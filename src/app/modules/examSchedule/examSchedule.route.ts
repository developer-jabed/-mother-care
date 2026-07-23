import type { FastifyInstance } from 'fastify';
import { ExamScheduleValidation } from './examSchedule.validation.js';
import validateRequest from '../../middlewares/validateRequest.js';
import { ExamScheduleController } from './examSchedule.controller.js';

export default async function examScheduleRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/',
        { preHandler: [validateRequest(ExamScheduleValidation.create)] },
        ExamScheduleController.create
    );

    fastify.get(
        '/',
        { preHandler: [validateRequest(ExamScheduleValidation.getMany)] },
        ExamScheduleController.getMany
    );

    fastify.get(
        '/:id',
        { preHandler: [validateRequest(ExamScheduleValidation.getSingle)] },
        ExamScheduleController.getSingle
    );

    fastify.patch(
        '/:id',
        { preHandler: [validateRequest(ExamScheduleValidation.update)] },
        ExamScheduleController.update
    );

    fastify.delete(
        '/:id',
        { preHandler: [validateRequest(ExamScheduleValidation.deleteSchedule)] },
        ExamScheduleController.deleteSchedule
    );
}