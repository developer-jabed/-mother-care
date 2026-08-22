import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type { FastifyInstance } from 'fastify';
import type { ISmsJobData, ISendResultSmsPayload, ISmsLogFilters } from './sms.interface.js';
import type { IPaginationOptions } from '../../interfaces/pagination.js';
import { buildPaginationMeta, calculatePagination, type PaginationQuery } from '../../helper/paginationHelper.js';
import type { Prisma } from '@prisma/client';
import { smsLogSearchableFields } from './sms.constant.js';

const APP_URL = process.env.FRONTEND_URL!;

const buildResultSmsText = (params: {
    studentName: string;
    examName: string;
    totalMarks: number;
    totalFullMarks: number;
    totalSubjects: number;
    grade: string;
    position: number | null;
    classId: number;
    sectionId: number;
    rollNumber: number;
}) => {
    const {
        studentName,
        examName,
        totalMarks,
        totalFullMarks,
        totalSubjects,
        grade,
        position,
        classId,
        sectionId,
        rollNumber,
    } = params;

    const rankText = position ? `, Rank: ${position}` : '';
    const resultUrl = `${APP_URL}/student/${classId}/${sectionId}/${rollNumber}`;

    return `Dear Guardian, ${studentName}'s ${examName} result: ${totalMarks}/${totalFullMarks} (${totalSubjects} subjects), Grade: ${grade}${rankText}. View: ${resultUrl}`;
};

const queueResultSmsForExam = async (
    fastify: FastifyInstance,
    payload: ISendResultSmsPayload
) => {
    const { examId, force = false } = payload;

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
    }

    const publishedResults = await prisma.result.findMany({
        where: { examId, isPublished: true },
        include: {
            enrollment: { include: { student: true } },
            details: { include: { subject: true } },
        },
    });

    if (publishedResults.length === 0) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'No published results found for this exam. Publish results before sending SMS.'
        );
    }

    const enrollmentIds = publishedResults.map(r => r.studentEnrollmentId);

    const alreadySent = force
        ? []
        : await prisma.smsLog.findMany({
            where: {
                examId,
                studentEnrollmentId: { in: enrollmentIds },
                status: { in: ['SENT', 'DELIVERED'] },
            },
            select: { studentEnrollmentId: true },
        });

    const alreadySentIds = new Set(alreadySent.map(r => r.studentEnrollmentId));

    const jobs: { name: string; data: ISmsJobData; opts: Record<string, unknown> }[] = [];
    let skippedNoPhone = 0;
    let skippedAlreadySent = 0;

    for (const result of publishedResults) {
        const { enrollment, details } = result;

        if (alreadySentIds.has(enrollment.id)) {
            skippedAlreadySent++;
            continue;
        }

        if (!enrollment.student.phone) {
            skippedNoPhone++;
            continue;
        }

        const totalFullMarks = details.reduce((sum, d) => sum + d.subject.fullMarks, 0);

        const message = buildResultSmsText({
            studentName: enrollment.student.fullName,
            examName: exam.name,
            totalMarks: result.totalMarks,
            totalFullMarks,
            totalSubjects: details.length,
            grade: result.grade,
            position: result.position,
            classId: enrollment.classId,
            sectionId: enrollment.sectionId,
            rollNumber: enrollment.rollNumber,
        });

        jobs.push({
            name: 'send-result-sms',
            data: {
                studentEnrollmentId: enrollment.id,
                examId,
                type: 'RESULT',          // ← যোগ করো
                phone: enrollment.student.phone,
                message,
            },
            opts: {
                attempts: 4,
                backoff: { type: 'exponential', delay: 8000 },
                removeOnComplete: 1000,
                removeOnFail: false,
            },
        });

        await prisma.smsLog.upsert({
            where: {
                studentEnrollmentId_examId: {
                    studentEnrollmentId: enrollment.id,
                    examId,
                },
            },
            update: {
                status: 'PENDING',
                message,
                phone: enrollment.student.phone,
                type: 'RESULT',
            },
            create: {
                studentEnrollmentId: enrollment.id,
                examId,
                type: 'RESULT',          // ← যোগ করো
                phone: enrollment.student.phone,
                message,
                status: 'PENDING',
            },
        });
    }

    if (jobs.length > 0) {
        await fastify.smsQueue.addBulk(jobs);
        await prisma.exam.update({
            where: { id: examId },
            data: { smsSentAt: new Date() }
        });
    }

    return {
        examName: exam.name,
        totalPublishedResults: publishedResults.length,
        queued: jobs.length,
        skippedNoPhone,
        skippedAlreadySent,
    };
};
const getSmsLogs = async (
    filters: ISmsLogFilters,
    query: PaginationQuery
) => {
    const {
        searchTerm,
        examId,
        studentEnrollmentId,
        studentFeeId,
        type,
        status,
        phone,
    } = filters;

    const { page, limit, skip, take, sortBy, sortOrder } =
        calculatePagination(query);

    const andConditions: Prisma.SmsLogWhereInput[] = [];

    if (searchTerm) {
        andConditions.push({
            OR: smsLogSearchableFields.map((field) => ({
                [field]: { contains: searchTerm, mode: 'insensitive' },
            })),
        });
    }

    if (examId) {
        andConditions.push({ examId: Number(examId) });
    }

    if (studentEnrollmentId) {
        andConditions.push({ studentEnrollmentId: Number(studentEnrollmentId) });
    }

    if (studentFeeId) {
        andConditions.push({ studentFeeId: Number(studentFeeId) });
    }

    if (type) {
        andConditions.push({ type });
    }

    if (status) {
        andConditions.push({ status });
    }

    if (phone) {
        andConditions.push({
            phone: { contains: phone, mode: 'insensitive' },
        });
    }

    const whereConditions: Prisma.SmsLogWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.smsLog.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
            exam: { select: { id: true, name: true } },
            studentFee: {
                select: {
                    id: true,
                    amount: true,
                    status: true,
                    feeType: { select: { displayName: true } },
                },
            },
            enrollment: {
                include: {
                    student: {
                        select: { id: true, fullName: true, phone: true },
                    },
                },
            },
        },
    });

    const total = await prisma.smsLog.count({ where: whereConditions });

    return {
        meta: buildPaginationMeta(total, {
            page,
            limit,
            skip,
            take,
            sortBy,
            sortOrder,
        }),
        data: result,
    };
};

export const SmsService = {
    queueResultSmsForExam,
    getSmsLogs,
};

