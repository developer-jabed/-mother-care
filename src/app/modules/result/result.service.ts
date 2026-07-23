import { Prisma, type Result } from '@prisma/client';
import httpStatus from 'http-status';
import type { ICombinedRankingFilterRequest, ICombinedRankingResponse, ICombinedRankingRow, ICreateResultPayload, IResultFilterRequest, ISectionResultFilterRequest } from './result.interface.js';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { calculateSubjectRawTotal, resolveGrade } from './result.utils.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import { resultSearchableFields } from './result.constant.js';



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
    const {
        searchTerm,
        examId,
        studentEnrollmentId,
        classId,
        sectionId,
        isPublished,
        ...restFilters
    } = filters;

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

    // ── Filter by the enrollment's class/section (Result → StudentEnrollment) ──
    if (classId !== undefined || sectionId !== undefined) {
        andConditions.push({
            enrollment: {
                is: {
                    ...(classId !== undefined ? { classId: Number(classId) } : {}),
                    ...(sectionId !== undefined ? { sectionId: Number(sectionId) } : {}),
                },
            },
        });
    }

    if (isPublished !== undefined) {
        andConditions.push({
            isPublished: isPublished === true || String(isPublished) === 'true',
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


const getSectionWiseResults = async (filters: ISectionResultFilterRequest) => {
    const { examId, classId, sectionId } = filters;

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
    }

    // Pull every current enrollment in this class+section, whether or not they
    // have a result yet, so the ranking sheet always shows the full roster.
    const enrollments = await prisma.studentEnrollment.findMany({
        where: {
            classId,
            sectionId,
            academicYearId: exam.academicYearId,
            isCurrent: true,
        },
        include: {
            student: true,
            results: {
                where: { examId },
                include: { details: { include: { subject: true } } },
            },
        },
        orderBy: { rollNumber: 'asc' },
    });

    const rows = enrollments.map(enrollment => {
        const result = enrollment.results[0] ?? null;

        return {
            studentEnrollmentId: enrollment.id,
            studentId: enrollment.studentId,
            name: enrollment.student.fullName,
            rollNumber: enrollment.rollNumber,
            hasResult: Boolean(result),
            resultId: result?.id ?? null,
            totalMarks: result?.totalMarks ?? null,
            percentage: result?.percentage ?? null,
            grade: result?.grade ?? null,
            gradePoint: result?.gradePoint ?? null,
            isPublished: result?.isPublished ?? false,
            position: result?.position ?? null,
            details: result?.details ?? [],
        };
    });

    // Rank by percentage desc; students without a result sink to the bottom.
    rows.sort((a, b) => {
        if (a.percentage === null && b.percentage === null) return 0;
        if (a.percentage === null) return 1;
        if (b.percentage === null) return -1;
        return b.percentage - a.percentage;
    });

    const ranked = rows.map((row, index) => ({
        ...row,
        rank: row.percentage !== null ? index + 1 : null,
    }));

    return {
        examId,
        examName: exam.name,
        classId,
        sectionId,
        totalStudents: ranked.length,
        data: ranked,
    };
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

const calculatePositions = async (
    examId: number,
    classId: number,
    sectionId: number
): Promise<{ updated: number }> => {
    const results = await prisma.result.findMany({
        where: {
            examId,
            enrollment: {
                classId,
                sectionId,
            },
        },
        orderBy: { percentage: 'desc' },
    });

    if (results.length === 0) {
        throw new ApiError(httpStatus.NOT_FOUND, 'No results found for this exam in the selected class and section');
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

const getCombinedRanking = async (
    filters: ICombinedRankingFilterRequest
): Promise<ICombinedRankingResponse> => {
    const { classId, sectionId, examIds } = filters;

    const enrollments = await prisma.studentEnrollment.findMany({
        where: { classId, sectionId },
        include: { student: true },
    });

    if (enrollments.length === 0) {
        throw new ApiError(httpStatus.NOT_FOUND, 'No students found in this class and section');
    }

    const enrollmentIds = enrollments.map((e) => e.id);

    const results = await prisma.result.findMany({
        where: {
            studentEnrollmentId: { in: enrollmentIds },
            isPublished: true,
            ...(examIds && examIds.length > 0 ? { examId: { in: examIds } } : {}),
        },
        select: {
            studentEnrollmentId: true,
            examId: true,
            percentage: true,
        },
    });

    const examIdSet = new Set(results.map((r) => r.examId));

    const byStudent = new Map<number, { totalPercentage: number; examCount: number }>();

    for (const result of results) {
        if (result.percentage === null) continue;
        const key = result.studentEnrollmentId;
        const existing = byStudent.get(key) ?? { totalPercentage: 0, examCount: 0 };
        existing.totalPercentage += result.percentage;
        existing.examCount += 1;
        byStudent.set(key, existing);
    }

    const rows: ICombinedRankingRow[] = enrollments.map((enrollment) => {
        const agg = byStudent.get(enrollment.id);
        const averagePercentage = agg && agg.examCount > 0
            ? Number((agg.totalPercentage / agg.examCount).toFixed(2))
            : null;

        return {
            studentEnrollmentId: enrollment.id,
            rollNumber: enrollment.rollNumber ?? null,
            name: enrollment.student.fullName, // fixed: was `name`
            examCount: agg?.examCount ?? 0,
            averagePercentage,
            rank: null,
        };
    });

    const withResults = rows
        .filter((r) => r.averagePercentage !== null)
        .sort((a, b) => b.averagePercentage! - a.averagePercentage!);
    const withoutResults = rows.filter((r) => r.averagePercentage === null);

    withResults.forEach((row, index) => {
        row.rank = index + 1;
    });

    return {
        totalStudents: enrollments.length,
        examCount: examIdSet.size,
        data: [...withResults, ...withoutResults],
    };
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
    getCombinedRanking,
    publishResult,
    getSectionWiseResults,
    calculatePositions,
    deleteResult,
};