import type { FastifyInstance } from 'fastify';
import validateRequest from '../../middlewares/validateRequest.js';
import { ResultCardValidation } from './resultCart.validation.js';
import { ResultCardController } from './resultCart.controller.js';



export default async function resultCardRoutes(fastify: FastifyInstance) {
    // Single student result card — always synchronous, returns PDF directly
    fastify.get(
        '/:studentEnrollmentId/:examId',
        {
            preHandler: [
                validateRequest(ResultCardValidation.generateSingle),
            ],
        },
        ResultCardController.generateSingle
    );

    // Batch: whole class + section for one exam (optionally filtered to a
    // subset of enrollment ids). Queues when Redis is available, otherwise
    // falls back to direct synchronous generation.
    fastify.post(
        '/batch/section',
        {
            preHandler: [
        
                validateRequest(ResultCardValidation.generateBatchBySection),
            ],
        },
        ResultCardController.generateBatchBySection
    );

    // Poll job status — only meaningful when the batch call above returned
    // mode: 'queued'. Frontend polls this every few seconds.
    fastify.get(
        '/batch/:jobId/status',
        
        ResultCardController.getBatchStatus
    );
}