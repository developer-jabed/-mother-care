import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
const buildResultSmsText = (params) => {
    const { studentName, examName, totalMarks, totalFullMarks, totalSubjects, grade } = params;
    return `প্রিয় অভিভাবক, ${studentName}-এর ${examName} পরীক্ষার ফলাফল: প্রাপ্ত নম্বর ${totalMarks}/${totalFullMarks} (${totalSubjects} বিষয়), গ্রেড: ${grade}।`;
};
const queueResultSmsForExam = async (fastify, payload) => {
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
        throw new ApiError(httpStatus.BAD_REQUEST, 'No published results found for this exam. Publish results before sending SMS.');
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
    const jobs = [];
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
        });
        jobs.push({
            name: 'send-result-sms',
            data: {
                studentEnrollmentId: enrollment.id,
                examId,
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
            where: { studentEnrollmentId_examId: { studentEnrollmentId: enrollment.id, examId } },
            update: {
                status: 'PENDING',
                message,
                phone: enrollment.student.phone
            },
            create: {
                studentEnrollmentId: enrollment.id,
                examId,
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
export const SmsService = {
    queueResultSmsForExam
};
//# sourceMappingURL=sms.service.js.map