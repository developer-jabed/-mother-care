import type { GradingScale } from '@prisma/client';
import httpStatus from 'http-status';
import ApiError from '../../errors/api.error.js';
import { prisma } from '../../shared/prisma.js';

// ─────────────────────────────────────────────
// Grading utilities
// ─────────────────────────────────────────────

export const resolveGrade = (
    percentage: number,
    gradingScales: GradingScale[]
): { grade: string; gradePoint: number } => {
    if (percentage < 0 || percentage > 100 || Number.isNaN(percentage)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid percentage value: ${percentage}`
        );
    }

    // Sort by minPercentage descending so overlapping ranges resolve
    // deterministically to the highest-qualifying band, not array order
    const sorted = [...gradingScales].sort((a, b) => b.minPercentage - a.minPercentage);

    const match = sorted.find(
        scale => percentage >= scale.minPercentage && percentage <= scale.maxPercentage
    );

    if (!match) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `No grading scale defined for percentage ${percentage}. Check GradingScale configuration for this academic year.`
        );
    }

    return { grade: match.grade, gradePoint: match.gradePoint };
};

export const calculateSubjectRawTotal = (detail: {
    writtenMarks?: number | null;
    mcqMarks?: number | null;
    practicalMarks?: number | null;
    vivaMarks?: number | null;
}): number => {
    const values = [detail.writtenMarks, detail.mcqMarks, detail.practicalMarks, detail.vivaMarks];

    for (const v of values) {
        if (v !== null && v !== undefined && v < 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Marks cannot be negative: received ${v}`);
        }
    }

    return values.reduce((sum: number, v) => sum + (v ?? 0), 0);
};

export const validateMarksAgainstFullMarks = (total: number, fullMarks: number): void => {
    if (total > fullMarks) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Calculated total (${total}) exceeds subject's full marks (${fullMarks})`
        );
    }
};

// ─────────────────────────────────────────────
// Top scorer utilities
// ─────────────────────────────────────────────

export type TopScorer = {
    studentName: string;
    admissionNumber: string;
    rollNumber: number;
    marks: number;
    isCurrentStudent: boolean;
};

export type SubjectTopScorersMap = Map<number, TopScorer>;

/**
 * Computes the top-scoring student per subject for a given exam + class
 * (optionally scoped to a section), in two queries total regardless of
 * how many subjects or students exist.
 *
 * Ties: the first matching row wins. Swap to `findMany` per subject-group
 * if you need to surface multiple co-toppers.
 */
export const getTopScorersBySubject = async (
    examId: number,
    classId: number,
    sectionId: number | undefined,
    currentEnrollmentId: number
): Promise<SubjectTopScorersMap> => {
    const map: SubjectTopScorersMap = new Map();

    // 1. Max marks per subject, in one grouped query
    const maxMarksBySubject = await prisma.resultDetail.groupBy({
        by: ['subjectId'],
        where: {
            result: {
                examId,
                isPublished: true,
                enrollment: {
                    classId,
                    ...(sectionId !== undefined ? { sectionId } : {}),
                    isCurrent: true,
                },
            },
        },
        _max: { totalMarks: true },
    });

    const validMaxMarks = maxMarksBySubject.filter(
        (m): m is typeof m & { _max: { totalMarks: number } } => m._max.totalMarks !== null
    );

    if (validMaxMarks.length === 0) {
        return map;
    }

    // 2. Fetch the rows matching those max marks, in one query
    const topDetails = await prisma.resultDetail.findMany({
        where: {
            OR: validMaxMarks.map(m => ({
                subjectId: m.subjectId,
                totalMarks: m._max.totalMarks,
                result: {
                    examId,
                    isPublished: true,
                    enrollment: {
                        classId,
                        ...(sectionId !== undefined ? { sectionId } : {}),
                        isCurrent: true,
                    },
                },
            })),
        },
        include: {
            result: {
                include: {
                    enrollment: {
                        include: { student: true },
                    },
                },
            },
        },
    });

    // 3. Reduce to a Map keyed by subjectId (first row wins on ties)
    for (const detail of topDetails) {
        if (map.has(detail.subjectId)) continue;

        map.set(detail.subjectId, {
            studentName: detail.result.enrollment.student.fullName,
            admissionNumber: detail.result.enrollment.student.admissionNumber,
            rollNumber: detail.result.enrollment.rollNumber,
            marks: detail.totalMarks,
            isCurrentStudent: detail.result.enrollment.id === currentEnrollmentId,
        });
    }

    return map;
};