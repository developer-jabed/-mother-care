import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import sendResponse from '../../shared/sendResponse.js';
import { AdmitCardService } from './admitCard.service.js';
import { addAdmitCardJob, admitCardQueue, isQueueAvailable } from './admitCard.queue.js';
import fs from 'fs/promises';
import path from 'path';
import ApiError from '../../errors/api.error.js';
import { prisma } from '../../shared/prisma.js';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'admit-cards');

const generateSingle = catchAsync(async (request, reply) => {
    const { examId, studentEnrollmentId } = request.query as {
        examId: string;
        studentEnrollmentId: string;
    };

    const pdfBuffer = await AdmitCardService.generateSingleAdmitCard(
        Number(studentEnrollmentId),
        Number(examId)
    );

    reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="admit-card-${studentEnrollmentId}.pdf"`)
        .send(pdfBuffer);
});

const generateSection = catchAsync(async (request, reply) => {
    const { examId, classId, sectionId } = request.query as {
        examId: string;
        classId: string;
        sectionId: string;
    };

    const parsedExamId = Number(examId);
    const parsedClassId = Number(classId);
    const parsedSectionId = Number(sectionId);

    if (isQueueAvailable()) {
        // Preferred path: queue it, respond immediately with a jobId to poll
        try {
            const jobId = await addAdmitCardJob({
                examId: parsedExamId,
                classId: parsedClassId,
                sectionId: parsedSectionId,
            });

            return sendResponse(reply, {
                statusCode: httpStatus.OK,
                success: true,
                message: 'Admit card generation started',
                data: { mode: 'queued', jobId },
            });
        } catch (err) {
            console.error('⚠️ Queueing failed despite Redis appearing available — falling back to direct generation:', err);
            // fall through to direct generation below
        }
    }

    // Fallback path: Redis unavailable (or queueing failed) — generate synchronously.
    // Slower and blocks the request, but guarantees admit cards still work with no Redis.
    console.log('⚙️ Generating admit cards directly (Redis unavailable)');

    const enrollmentIds = await AdmitCardService.getSectionEnrollmentIds(parsedClassId, parsedSectionId);
    const result = await AdmitCardService.generateAdmitCardsForEnrollments(enrollmentIds, parsedExamId);

    if (!result.pdfBuffer) {
        return sendResponse(reply, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'All admit cards failed to generate',
            data: { mode: 'direct', totalStudents: result.totalStudents, successCount: 0, failed: result.failed },
        });
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const fileName = `admit-card_exam${parsedExamId}_class${parsedClassId}_section${parsedSectionId}_${Date.now()}.pdf`;
    await fs.writeFile(path.join(OUTPUT_DIR, fileName), result.pdfBuffer);
    const fileUrl = `/admit-cards/${fileName}`;

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message:
            result.failed.length > 0
                ? `Generated ${result.successCount}/${result.totalStudents}. ${result.failed.length} student(s) need retry.`
                : 'All admit cards generated successfully',
        data: {
            mode: 'direct',
            fileUrl,
            totalStudents: result.totalStudents,
            successCount: result.successCount,
            failed: result.failed,
        },
    });
});

/** Retry ONLY the specific students that failed previously — works with or without Redis. */
const retryFailed = catchAsync(async (request, reply) => {
    const { examId, classId, sectionId, enrollmentIds } = request.body as {
        examId: number;
        classId: number;
        sectionId: number;
        enrollmentIds: number[];
    };

    if (isQueueAvailable()) {
        try {
            const jobId = await addAdmitCardJob({ examId, classId, sectionId, onlyEnrollmentIds: enrollmentIds });
            return sendResponse(reply, {
                statusCode: httpStatus.OK,
                success: true,
                message: `Retry started for ${enrollmentIds.length} student(s)`,
                data: { mode: 'queued', jobId },
            });
        } catch (err) {
            console.error('⚠️ Retry queueing failed — falling back to direct generation:', err);
        }
    }

    const result = await AdmitCardService.generateAdmitCardsForEnrollments(enrollmentIds, examId);

    if (!result.pdfBuffer) {
        return sendResponse(reply, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Retry failed for all requested students',
            data: { mode: 'direct', totalStudents: result.totalStudents, successCount: 0, failed: result.failed },
        });
    }

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const fileName = `admit-card-retry_exam${examId}_class${classId}_section${sectionId}_${Date.now()}.pdf`;
    await fs.writeFile(path.join(OUTPUT_DIR, fileName), result.pdfBuffer);
    const fileUrl = `/admit-cards/${fileName}`;

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message:
            result.failed.length > 0
                ? `Retried: ${result.successCount}/${result.totalStudents} succeeded, ${result.failed.length} still failed`
                : `All ${result.successCount} retried admit card(s) generated successfully`,
        data: {
            mode: 'direct',
            fileUrl,
            totalStudents: result.totalStudents,
            successCount: result.successCount,
            failed: result.failed,
        },
    });
});

const getJobStatus = catchAsync(async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    if (!admitCardQueue) {
        return sendResponse(reply, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Queue not available',
            data: { jobId, status: 'not_available' },
        });
    }

    const job = await admitCardQueue.getJob(jobId);

    if (!job) {
        return sendResponse(reply, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Job not found',
            data: { jobId, status: 'not_found' },
        });
    }

    const state = await job.getState();
    const returnValue = job.returnvalue as
        | { fileUrl?: string; totalStudents?: number; successCount?: number; failed?: unknown[] }
        | undefined;

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Job status retrieved',
        data: {
            jobId,
            status: state,
            fileUrl: returnValue?.fileUrl,
            totalStudents: returnValue?.totalStudents,
            successCount: returnValue?.successCount,
            failed: returnValue?.failed ?? [],
            error: job.failedReason,
        },
    });
});

const verify = catchAsync(async (request, reply) => {
    const { enrollmentId, examId } = request.params as {
        enrollmentId: string;
        examId: string;
    };

    const parsedEnrollmentId = Number(enrollmentId);
    const parsedExamId = Number(examId);

    if (Number.isNaN(parsedEnrollmentId) || Number.isNaN(parsedExamId)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid admit card reference');
    }

    const enrollment = await prisma.studentEnrollment.findUnique({
        where: { id: parsedEnrollmentId },
        include: { student: true, class: true, section: true },
    });

    const exam = await prisma.exam.findUnique({ where: { id: parsedExamId } });

    if (!enrollment || !exam) {
        return sendResponse(reply, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: 'Invalid or unrecognized admit card',
            data: { valid: false },
        });
    }

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Admit card verified',
        data: {
            valid: true,
            studentName: enrollment.student.fullName,
            admissionNumber: enrollment.student.admissionNumber,
            photo: enrollment.student.photo,
            rollNumber: enrollment.rollNumber,
            className: enrollment.class.name,
            sectionName: enrollment.section.name,
            examName: exam.name,
        },
    });
});

export const AdmitCardController = { generateSingle, generateSection, retryFailed, getJobStatus , verify};