import type { StudentEnrollment } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { buildPaginationMeta, calculatePagination } from '../../helper/paginationHelper.js';
import type {
    CreateStudentEnrollmentInput,
    PromoteStudentInput,
    UpdateStudentEnrollmentInput,
    PerformanceRankingQueryInput,
    BulkPromoteInput,
} from './studentEnrollment.validation.js';

const createStudentEnrollment = async (
    payload: CreateStudentEnrollmentInput
): Promise<StudentEnrollment> => {
    const existing = await prisma.studentEnrollment.findUnique({
        where: {
            studentId_academicYearId: {
                studentId: payload.studentId,
                academicYearId: payload.academicYearId,
            }
        }
    });

    if (existing) {
        throw new ApiError(httpStatus.CONFLICT, "Student already enrolled in this academic year");
    }

    return prisma.studentEnrollment.create({
        data: payload,
        include: {
            student: true,
            academicYear: true,
            class: true,
            section: true,
        },
    });
};

const updateStudentEnrollment = async (
    id: number,
    payload: UpdateStudentEnrollmentInput
): Promise<StudentEnrollment> => {
    const existing = await prisma.studentEnrollment.findUnique({ where: { id } });
    if (!existing) {
        throw new ApiError(httpStatus.NOT_FOUND, "Enrollment not found");
    }

    return prisma.studentEnrollment.update({
        where: { id },
        data: payload,
        include: {
            student: true,
            academicYear: true,
            class: true,
            section: true,
        },
    });
};

const promoteStudent = async (payload: PromoteStudentInput) => {
    const { studentId, newAcademicYearId, newClassId, newSectionId, newRollNumber } = payload;

    const currentEnrollment = await prisma.studentEnrollment.findFirst({
        where: { studentId, isCurrent: true },
        include: { student: true }
    });

    if (!currentEnrollment) {
        throw new ApiError(httpStatus.NOT_FOUND, "Current enrollment not found");
    }

    await prisma.studentEnrollment.update({
        where: { id: currentEnrollment.id },
        data: { isCurrent: false, status: "PROMOTED" }
    });

    const newEnrollment = await prisma.studentEnrollment.create({
        data: {
            studentId,
            academicYearId: newAcademicYearId,
            classId: newClassId,
            sectionId: newSectionId,
            rollNumber: newRollNumber,
            isCurrent: true,
            status: "ACTIVE",
            promotedFromId: currentEnrollment.id,
        },
        include: {
            student: true,
            academicYear: true,
            class: true,
            section: true,
        },
    });

    return newEnrollment;
};

/**
 * Returns all students currently enrolled in the given academic year / class / section,
 * ranked by their result percentage in a specific exam (typically the ফাইনাল পরীক্ষা / final exam).
 * Students with no published result for that exam are pushed to the bottom, ordered by current roll.
 */
const getStudentsWithPerformanceRanking = async (query: PerformanceRankingQueryInput) => {
    const { academicYearId, classId, sectionId, examId } = query;

    const enrollments = await prisma.studentEnrollment.findMany({
        where: { academicYearId, classId, sectionId, isCurrent: true },
        include: {
            student: true,
            results: {
                where: { isPublished: true, examId },
                select: { percentage: true },
            },
        },
    });

    const ranked = enrollments
        .map(e => {
            const finalResult = e.results[0]; // one exam selected -> at most one result per student
            const percentage = finalResult ? finalResult.percentage : null;

            return {
                studentId: e.studentId,
                enrollmentId: e.id,
                name: e.student.fullName,
                currentRoll: e.rollNumber,
                hasResult: !!finalResult,
                percentage,
            };
        })
        .sort((a, b) => {
            if (a.percentage === null && b.percentage === null) return a.currentRoll - b.currentRoll;
            if (a.percentage === null) return 1;
            if (b.percentage === null) return -1;
            return b.percentage - a.percentage;
        });

    return ranked.map((s, idx) => ({
        ...s,
        suggestedRoll: idx + 1,
    }));
};

/**
 * Bulk-promotes selected students from a source academic year/class/section
 * into a target academic year/class/section, assigning the provided roll numbers.
 * Students who already have an enrollment in the target academic year are skipped.
 * The old enrollment is marked PROMOTED and isCurrent: false; the new one links back via promotedFromId.
 */
const bulkPromoteStudents = async (payload: BulkPromoteInput) => {
    const {
        sourceAcademicYearId,
        targetAcademicYearId,
        targetClassId,
        targetSectionId,
        promotions,
    } = payload;

    const studentIds = promotions.map(p => p.studentId);

    const alreadyPromoted = await prisma.studentEnrollment.findMany({
        where: { studentId: { in: studentIds }, academicYearId: targetAcademicYearId },
        select: { studentId: true },
    });
    const alreadyPromotedSet = new Set(alreadyPromoted.map(e => e.studentId));
    const toPromote = promotions.filter(p => !alreadyPromotedSet.has(p.studentId));

    const created = await prisma.$transaction(async tx => {
        const results: StudentEnrollment[] = [];

        for (const p of toPromote) {
            const sourceEnrollment = await tx.studentEnrollment.findUnique({
                where: {
                    studentId_academicYearId: {
                        studentId: p.studentId,
                        academicYearId: sourceAcademicYearId,
                    },
                },
            });

            if (!sourceEnrollment) continue;

            const newEnrollment = await tx.studentEnrollment.create({
                data: {
                    studentId: p.studentId,
                    academicYearId: targetAcademicYearId,
                    classId: targetClassId,
                    sectionId: targetSectionId,
                    rollNumber: p.newRollNumber,
                    isCurrent: true,
                    status: "ACTIVE",
                    promotedFromId: sourceEnrollment.id,
                    promotionDate: new Date(),
                },
            });

            await tx.studentEnrollment.update({
                where: { id: sourceEnrollment.id },
                data: { isCurrent: false, status: "PROMOTED" },
            });

            results.push(newEnrollment);
        }

        return results;
    });

    return {
        promoted: created.length,
        skippedAlreadyPromoted: promotions.length - toPromote.length,
    };
};

const getEnrollmentById = async (id: number) => {
    const enrollment = await prisma.studentEnrollment.findUnique({
        where: { id },
        include: {
            student: true,
            academicYear: true,
            class: true,
            section: true,
        },
    });

    if (!enrollment) {
        throw new ApiError(httpStatus.NOT_FOUND, "Enrollment not found");
    }

    return enrollment;
};

const getAllEnrollments = async (filters: any = {}) => {
    const { search, page = 1, limit = 10, isCurrent } = filters;
    const pagination = calculatePagination({ page, limit });

    const whereCondition: any = {};

    if (isCurrent !== undefined) {
        whereCondition.isCurrent = isCurrent === "true" || isCurrent === true;
    }

    const [enrollments, total] = await Promise.all([
        prisma.studentEnrollment.findMany({
            where: whereCondition,
            skip: pagination.skip,
            take: pagination.take,
            orderBy: { createdAt: 'desc' },
            include: {
                student: true,
                academicYear: true,
                class: true,
                section: true,
            },
        }),
        prisma.studentEnrollment.count({ where: whereCondition }),
    ]);

    return {
        meta: buildPaginationMeta(total, pagination),
        data: enrollments
    };
};

const getStudentsBySection = async (params: {
    academicYearId: number;
    classId: number;
    sectionId: number;
}) => {
    const section = await prisma.section.findUnique({
        where: { id: params.sectionId },
    });

    if (!section) {
        throw new ApiError(httpStatus.NOT_FOUND, "শাখা পাওয়া যায়নি");
    }

    if (section.classId !== params.classId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "এই শাখাটি এই ক্লাসের অন্তর্ভুক্ত নয়");
    }

    return prisma.studentEnrollment.findMany({
        where: {
            academicYearId: params.academicYearId,
            classId: params.classId,
            sectionId: params.sectionId,
            isCurrent: true,
        },
        orderBy: { rollNumber: "asc" },
        include: { student: true },
    });
};


export const studentEnrollmentService = {
    createStudentEnrollment,
    updateStudentEnrollment,
    promoteStudent,
    getStudentsWithPerformanceRanking,
    bulkPromoteStudents,
    getEnrollmentById,
    getAllEnrollments,
    getStudentsBySection,
};