import { Prisma, type Result } from '@prisma/client';
import httpStatus from 'http-status';
import type {
    ICombinedRankingFilterRequest,
    ICombinedRankingResponse,
    ICombinedRankingRow,
    ICreateResultPayload,
    IResultByRollFilterRequest,
    IResultFilterRequest,
    ISectionResultFilterRequest,
} from './result.interface.js';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import {
    calculateSubjectRawTotal,
    getTopScorersBySubject,
    resolveGrade,
} from './result.utils.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import { resultSearchableFields } from './result.constant.js';

/**
 * Shared ranking comparator used everywhere rank/position is assigned.
 * Primary  : totalMarks   (penalises partial subject sets)
 * Secondary: gradePoint   (GPA average)
 * Tertiary : percentage
 * Null / missing results sink to the bottom.
 */
const compareForRank = (
    a: { totalMarks: number | null; gradePoint: number | null; percentage: number | null },
    b: { totalMarks: number | null; gradePoint: number | null; percentage: number | null }
): number => {
    // Both missing → equal
    if (a.totalMarks === null && b.totalMarks === null) return 0;
    // One missing → the one with data ranks higher
    if (a.totalMarks === null) return 1;
    if (b.totalMarks === null) return -1;

    // 1. totalMarks DESC
    if (b.totalMarks !== a.totalMarks) {
        return b.totalMarks - a.totalMarks;
    }

    // 2. gradePoint DESC
    const aGP = a.gradePoint ?? 0;
    const bGP = b.gradePoint ?? 0;
    if (bGP !== aGP) {
        return bGP - aGP;
    }

    // 3. percentage DESC
    const aPct = a.percentage ?? 0;
    const bPct = b.percentage ?? 0;
    return bPct - aPct;
};

const buildResultComputation = async (
    examId: number,
    details: ICreateResultPayload['details']
) => {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
    }

    const subjectIds = details.map((d) => d.subjectId);
    const subjects = await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
    });

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));

    const missing = subjectIds.filter((id) => !subjectMap.has(id));
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

    const computedDetails = details.map((detail) => {
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

    // Percentage is still useful for display, but ranking never relies on it alone.
    // A student with only 1 subject @ 90 will have percentage 90 but totalMarks 90,
    // so they will rank below students who sat more subjects.
    const overallPercentage =
        overallFullMarks > 0 ? (overallObtained / overallFullMarks) * 100 : 0;

    // Overall GPA = average of subject gradePoints
    const totalGradePoints = computedDetails.reduce(
        (sum, d) => sum + (d.gradePoint || 0),
        0
    );
    const subjectCount = computedDetails.length || 1;
    const overallGradePoint = Number((totalGradePoints / subjectCount).toFixed(2));

    // Derive overall letter grade from the average GPA
    const sortedByGP = [...gradingScales].sort((a, b) => b.gradePoint - a.gradePoint);

    let overallGrade = 'F';
    for (const scale of sortedByGP) {
        if (overallGradePoint >= scale.gradePoint) {
            overallGrade = scale.grade;
            break;
        }
    }

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

    const result = await prisma.$transaction(async (tx) => {
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
            include: {
                details: { include: { subject: true } },
                enrollment: true,
                exam: true,
            },
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
            OR: resultSearchableFields.map((field) => ({
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

    // Full roster of the class+section (even students with no result yet)
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

    const rows = enrollments.map((enrollment) => {
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

    // Rank by totalMarks → gradePoint → percentage (class+section scoped)
    rows.sort(compareForRank);

    const ranked = rows.map((row, index) => ({
        ...row,
        rank: row.totalMarks !== null ? index + 1 : null,
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

    const result = await prisma.$transaction(async (tx) => {
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
            include: {
                details: { include: { subject: true } },
                enrollment: true,
                exam: true,
            },
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

/**
 * Persist position for every result in the given class+section for one exam.
 * Ranking order: totalMarks → gradePoint → percentage
 */
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
        // Fetch everything needed for the comparator; final order is applied in JS
        select: {
            id: true,
            totalMarks: true,
            gradePoint: true,
            percentage: true,
        },
    });

    if (results.length === 0) {
        throw new ApiError(
            httpStatus.NOT_FOUND,
            'No results found for this exam in the selected class and section'
        );
    }

    // Stable multi-key sort
    results.sort(compareForRank);

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

const getResultsByRoll = async (filters: IResultByRollFilterRequest) => {
    const { classId, sectionId, rollNumber, examId } = filters;

    const enrollment = await prisma.studentEnrollment.findFirst({
        where: { classId, sectionId, rollNumber, isCurrent: true },
        include: { student: true, class: true, section: true },
    });

    if (!enrollment) {
        throw new ApiError(
            httpStatus.NOT_FOUND,
            'No student found for this class, section, and roll number'
        );
    }

    const results = await prisma.result.findMany({
        where: {
            studentEnrollmentId: enrollment.id,
            isPublished: true,
            ...(examId !== undefined ? { examId } : {}),
        },
        include: {
            details: { include: { subject: true } },
            exam: true,
        },
        orderBy: { exam: { startDate: 'desc' } },
    });

    if (results.length === 0) {
        throw new ApiError(
            httpStatus.NOT_FOUND,
            'No published results found for this student'
        );
    }

    const resultsWithTopScorers = await Promise.all(
        results.map(async (result) => {
            const topScorersMap = await getTopScorersBySubject(
                result.examId,
                enrollment.classId,
                enrollment.sectionId,
                enrollment.id
            );

            const details = result.details.map((detail) => ({
                ...detail,
                topScorer: topScorersMap.get(detail.subjectId) ?? null,
            }));

            return { ...result, details };
        })
    );

    return {
        student: {
            fullName: enrollment.student.fullName,
            admissionNumber: enrollment.student.admissionNumber,
            fatherName: enrollment.student.fatherName,
            motherName: enrollment.student.motherName,
            gender: enrollment.student.gender,
            dateOfBirth: enrollment.student.dateOfBirth,
            phone: enrollment.student.phone,
            address: enrollment.student.address,
            photo: enrollment.student.photo,
            rollNumber: enrollment.rollNumber,
            className: enrollment.class.name,
            sectionName: enrollment.section.name,
        },
        results: resultsWithTopScorers,
    };
};

/**
 * Combined ranking across multiple exams for one class+section.
 * Primary rank key = average of totalMarks (not average percentage).
 * Secondary = average gradePoint.
 * This prevents a student who only sat 1 subject @ 90 from ranking above
 * students who sat the full set of subjects.
 */
const getCombinedRanking = async (
    filters: ICombinedRankingFilterRequest
): Promise<ICombinedRankingResponse> => {
    const { classId, sectionId, examIds } = filters;

    const enrollments = await prisma.studentEnrollment.findMany({
        where: { classId, sectionId },
        include: { student: true },
    });

    if (enrollments.length === 0) {
        throw new ApiError(
            httpStatus.NOT_FOUND,
            'No students found in this class and section'
        );
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
            totalMarks: true,
            gradePoint: true,
            percentage: true,
        },
    });

    const examIdSet = new Set(results.map((r) => r.examId));

    type Agg = {
        totalMarksSum: number;
        gradePointSum: number;
        percentageSum: number;
        examCount: number;
    };

    const byStudent = new Map<number, Agg>();

    for (const result of results) {
        if (result.totalMarks === null) continue;
        const key = result.studentEnrollmentId;
        const existing = byStudent.get(key) ?? {
            totalMarksSum: 0,
            gradePointSum: 0,
            percentageSum: 0,
            examCount: 0,
        };
        existing.totalMarksSum += result.totalMarks;
        existing.gradePointSum += result.gradePoint ?? 0;
        existing.percentageSum += result.percentage ?? 0;
        existing.examCount += 1;
        byStudent.set(key, existing);
    }

    const rows: ICombinedRankingRow[] = enrollments.map((enrollment) => {
        const agg = byStudent.get(enrollment.id);
        const examCount = agg?.examCount ?? 0;

        const averageTotalMarks =
            examCount > 0
                ? Number((agg!.totalMarksSum / examCount).toFixed(2))
                : null;
        const averageGradePoint =
            examCount > 0
                ? Number((agg!.gradePointSum / examCount).toFixed(2))
                : null;
        const averagePercentage =
            examCount > 0
                ? Number((agg!.percentageSum / examCount).toFixed(2))
                : null;

        return {
            studentEnrollmentId: enrollment.id,
            rollNumber: enrollment.rollNumber ?? null,
            name: enrollment.student.fullName,
            examCount,
            averagePercentage,          // kept for display
            averageTotalMarks,          // primary rank key
            averageGradePoint,          // secondary rank key
            rank: null,
        };
    });

    // Split & sort
    const withResults = rows
        .filter((r) => r.averageTotalMarks !== null)
        .sort((a, b) => {
            // averageTotalMarks DESC
            if (b.averageTotalMarks! !== a.averageTotalMarks!) {
                return b.averageTotalMarks! - a.averageTotalMarks!;
            }
            // averageGradePoint DESC
            const aGP = a.averageGradePoint ?? 0;
            const bGP = b.averageGradePoint ?? 0;
            if (bGP !== aGP) return bGP - aGP;
            // averagePercentage DESC (tie-breaker)
            return (b.averagePercentage ?? 0) - (a.averagePercentage ?? 0);
        });

    const withoutResults = rows.filter((r) => r.averageTotalMarks === null);

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
    getResultsByRoll,
    publishResult,
    getSectionWiseResults,
    calculatePositions,
    deleteResult,
};