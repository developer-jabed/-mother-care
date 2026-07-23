import type { FastifyInstance } from 'fastify';
import { AdmitCardValidation } from './admitCard.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import { AdmitCardController } from './admitCard.controller.js';

export default async function admitCardRoutes(fastify: FastifyInstance) {
    fastify.get(
        '/single',
        { preHandler: [validateRequest(AdmitCardValidation.generateSingle)] },
        AdmitCardController.generateSingle
    );

    fastify.get(
        '/section',
        { preHandler: [validateRequest(AdmitCardValidation.generateSection)] },
        AdmitCardController.generateSection
    );

    fastify.post(
        '/retry-failed',
        { preHandler: [validateRequest(AdmitCardValidation.retryFailed)] },
        AdmitCardController.retryFailed
    );

    fastify.get(
        '/job/:jobId',
        { preHandler: [validateRequest(AdmitCardValidation.getJobStatus)] },
        AdmitCardController.getJobStatus
    );

    fastify.get(
        '/verify/:enrollmentId/:examId',
        { preHandler: [validateRequest(AdmitCardValidation.verify)] },
        AdmitCardController.verify
    );
}