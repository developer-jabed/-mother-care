import httpStatus from 'http-status';
import type { FastifyRequest, FastifyReply } from 'fastify';

import catchAsync from '../../shared/catchAsync.js';
import sendResponse from '../../shared/sendResponse.js';
import ApiError from '../../errors/api.error.js';
import { ResultCardService } from './resultCart.service.js';
import { addResultCardJob, getResultCardJobStatus, isQueueAvailable } from './resultCart.queue.js';


// GET /result-cards/:studentEnrollmentId/:examId  -> streams a single PDF (always sync, fast)
const generateSingle = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const { studentEnrollmentId, examId } = request.params as {
        studentEnrollmentId: string;
        examId: string;
    };

    const pdfBuffer = await ResultCardService.generateSingleResultCard(
        Number(studentEnrollmentId),
        Number(examId)
    );

    reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="result-card-${studentEnrollmentId}.pdf"`)
        .send(pdfBuffer);
});

// POST /result-cards/batch/section  { classId, sectionId, examId, onlyEnrollmentIds? }
// Queues the job when Redis is available; otherwise falls back to generating
// and streaming the PDF directly in the same request (slower, but still works).
const generateBatchBySection = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const { classId, sectionId, examId, onlyEnrollmentIds } = request.body as {
        classId: number;
        sectionId: number;
        examId: number;
        onlyEnrollmentIds?: number[];
    };

    if (isQueueAvailable()) {
        // Cheap sanity check before queuing so we don't queue a job that
        // will immediately fail on an empty section.
        await ResultCardService.getSectionEnrollmentIds(classId, sectionId);

        const jobId = await addResultCardJob({ examId, classId, sectionId, onlyEnrollmentIds });

        return sendResponse(reply, {
            statusCode: httpStatus.ACCEPTED,
            success: true,
            message: 'Result card batch job queued',
            data: { jobId, statusUrl: `/result-cards/batch/${jobId}/status`, mode: 'queued' },
        });
    }

    // ── Fallback: no Redis configured / Redis down — generate synchronously ──
    console.warn('⚠️ Queue unavailable — generating result cards synchronously (direct fallback)');

    const enrollmentIds = onlyEnrollmentIds && onlyEnrollmentIds.length > 0
        ? onlyEnrollmentIds
        : await ResultCardService.getSectionEnrollmentIds(classId, sectionId);

    const result = await ResultCardService.generateResultCardsForEnrollments(enrollmentIds, examId);

    if (!result.pdfBuffer) {
        return sendResponse(reply, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: 'No result cards could be generated for this class/section',
            data: result,
        });
    }

    reply
        .header('Content-Type', 'application/pdf')
        .header(
            'Content-Disposition',
            `inline; filename="result-cards-class${classId}-section${sectionId}-exam${examId}.pdf"`
        )
        .header('X-Mode', 'direct')
        .header('X-Total-Students', String(result.totalStudents))
        .header('X-Success-Count', String(result.successCount))
        .header('X-Failed-Count', String(result.failed.length))
        .send(result.pdfBuffer);
});

// GET /result-cards/batch/:jobId/status
const getBatchStatus = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };

    const status = await getResultCardJobStatus(jobId);

    if (!status) {
        throw new ApiError(httpStatus.NOT_FOUND, `Job ${jobId} not found (or queue unavailable)`);
    }

    sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Job status fetched',
        data: status,
    });
});

export const ResultCardController = {
    generateSingle,
    generateBatchBySection,
    getBatchStatus,
};