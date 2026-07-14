import { Prisma, type Result } from '@prisma/client';
import httpStatus from 'http-status';
import type { ICreateResultPayload, IResultFilterRequest } from './result.interface.js';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { calculateSubjectRawTotal, resolveGrade } from './result.utils.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import { resultSearchableFields } from './result.constant.js';


// Shared helper: fetches subjects + grading scale, computes per-subject and overall grades
const buildResultComputation = async (
    examId: number,
    details: ICreateResultPayload['details']
) => {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
    }

    const subjectIds = details.map(d => d.subjectId);
    const subjects = await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
    });

    const subjectMap = new Map(subjects.map(s => [s.id, s]));

    const missing = subjectIds.filter(id => !subjectMap.has(id));
    if (missing.length > 0) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid subjectId(s): ${missing.join(', ')}`
        );
    }

    const gradingScales = await prisma.gradingScale.findMany({
        where: { academicYearId: exam.academicYearId },
        orderBy: { minPercentage: 'desc' },
    });

    if (gradingScales.length === 0) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'No grading scale configured for this academic year'
        );
    }

    let overallFullMarks = 0;
    let overallObtained = 0;

    const computedDetails = details.map(detail => {
        const subject = subjectMap.get(detail.subjectId)!;
        const rawTotal = calculateSubjectRawTotal(detail);

        if (rawTotal > subject.fullMarks) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Marks for subject "${subject.name}" (${rawTotal}) exceed full marks (${subject.fullMarks})`
            );
        }

        const subjectPercentage = (rawTotal / subject.fullMarks) * 100;
        const { grade, gradePoint } = resolveGrade(subjectPercentage, gradingScales);

        overallFullMarks += subject.fullMarks;
        overallObtained += rawTotal;

        return {
            subjectId: detail.subjectId,
            writtenMarks: detail.writtenMarks,
            mcqMarks: detail.mcqMarks,
            practicalMarks: detail.practicalMarks,
            vivaMarks: detail.vivaMarks,
            totalMarks: rawTotal,
            grade,
            gradePoint,
        };
    });

    const overallPercentage = (overallObtained / overallFullMarks) * 100;
    const { grade: overallGrade, gradePoint: overallGradePoint } = resolveGrade(
        overallPercentage,
        gradingScales
    );

    return {
        computedDetails,
        overallObtained,
        overallPercentage,
        overallGrade,
        overallGradePoint,
    };
};

const createResult = async (payload: ICreateResultPayload): Promise<Result> => {
    const { studentEnrollmentId, examId, remarks, details } = payload;

    const existing = await prisma.result.findUnique({
        where: {
            studentEnrollmentId_examId: { studentEnrollmentId, examId },
        },
    });

    if (existing) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'A result already exists for this student and exam. Use update instead.'
        );
    }

    const {
        computedDetails,
        overallObtained,
        overallPercentage,
        overallGrade,
        overallGradePoint,
    } = await buildResultComputation(examId, details);

    const result = await prisma.$transaction(async tx => {
        return tx.result.create({
            data: {
                studentEnrollmentId,
                examId,
                remarks,
                totalMarks: overallObtained,
                percentage: overallPercentage,
                grade: overallGrade,
                gradePoint: overallGradePoint,
                details: { create: computedDetails },
            },
            include: { details: { include: { subject: true } }, enrollment: true, exam: true },
        });
    });

    return result;
};

const getAllResults = async (
    filters: IResultFilterRequest,
    paginationOptions: PaginationResult
) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, examId, studentEnrollmentId, isPublished, ...restFilters } = filters;

    const andConditions: Prisma.ResultWhereInput[] = [];

    if (searchTerm) {
        andConditions.push({
            OR: resultSearchableFields.map(field => ({
                [field]: { contains: searchTerm, mode: 'insensitive' },
            })),
        });
    }

    if (examId !== undefined) {
        andConditions.push({ examId: Number(examId) });
    }

    if (studentEnrollmentId !== undefined) {
        andConditions.push({ studentEnrollmentId: Number(studentEnrollmentId) });
    }

    if (isPublished !== undefined) {
        andConditions.push({
            isPublished: isPublished === true || String(isPublished) === "true",
        });
    }

    // Any remaining plain string filters (if IResultFilterRequest has others)
    if (Object.keys(restFilters).length > 0) {
        andConditions.push({
            AND: Object.entries(restFilters).map(([key, value]) => ({
                [key]: value,
            })),
        });
    }

    const whereConditions: Prisma.ResultWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.result.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
            details: { include: { subject: true } },
            enrollment: true,
            exam: true,
        },
    });

    const total = await prisma.result.count({ where: whereConditions });
    const meta = buildPaginationMeta(total, paginationOptions);

    return { meta, data: result };
};

const getSingleResult = async (id: number): Promise<Result> => {
    const result = await prisma.result.findUnique({
        where: { id },
        include: {
            details: { include: { subject: true } },
            enrollment: true,
            exam: true,
        },
    });

    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Result not found');
    }

    return result;
};

const updateResult = async (
    id: number,
    payload: { remarks?: string; details?: ICreateResultPayload['details'] }
): Promise<Result> => {
    const existing = await getSingleResult(id);

    if (existing.isPublished) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot modify a published result. Unpublish it first.'
        );
    }

    const result = await prisma.$transaction(async tx => {
        if (payload.details && payload.details.length > 0) {
            const {
                computedDetails,
                overallObtained,
                overallPercentage,
                overallGrade,
                overallGradePoint,
            } = await buildResultComputation(existing.examId, payload.details);

            await tx.resultDetail.deleteMany({ where: { resultId: id } });

            await tx.result.update({
                where: { id },
                data: {
                    remarks: payload.remarks,
                    totalMarks: overallObtained,
                    percentage: overallPercentage,
                    grade: overallGrade,
                    gradePoint: overallGradePoint,
                    details: { create: computedDetails },
                },
            });
        } else if (payload.remarks !== undefined) {
            await tx.result.update({
                where: { id },
                data: { remarks: payload.remarks },
            });
        }

        return tx.result.findUniqueOrThrow({
            where: { id },
            include: { details: { include: { subject: true } }, enrollment: true, exam: true },
        });
    });

    return result;
};

const publishResult = async (id: number, isPublished: boolean): Promise<Result> => {
    await getSingleResult(id);

    const result = await prisma.result.update({
        where: { id },
        data: {
            isPublished,
            publishedAt: isPublished ? new Date() : null,
        },
    });

    return result;
};

const calculatePositions = async (examId: number): Promise<{ updated: number }> => {
    const results = await prisma.result.findMany({
        where: { examId },
        orderBy: { percentage: 'desc' },
    });

    if (results.length === 0) {
        throw new ApiError(httpStatus.NOT_FOUND, 'No results found for this exam');
    }

    await prisma.$transaction(
        results.map((result, index) =>
            prisma.result.update({
                where: { id: result.id },
                data: { position: index + 1 },
            })
        )
    );

    return { updated: results.length };
};

const deleteResult = async (id: number): Promise<Result> => {
    const existing = await getSingleResult(id);

    if (existing.isPublished) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot delete a published result. Unpublish it first.'
        );
    }

    const result = await prisma.result.delete({ where: { id } });

    return result;
};

export const ResultService = {
    createResult,
    getAllResults,
    getSingleResult,
    updateResult,
    publishResult,
    calculatePositions,
    deleteResult,
};