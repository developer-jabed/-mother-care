import type { FastifyInstance } from "fastify";
import { ResultValidation } from "./result.validation.js";
import validateRequest from "../../middlewares/validateRequest.js";
import { ResultController } from "./result.controller.js";

export default async function resultRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/',
        { preHandler: [validateRequest(ResultValidation.create)] },
        ResultController.createResult
    );

    fastify.get('/', ResultController.getAllResults);
    fastify.get('/:id', ResultController.getSingleResult);

    fastify.patch(
        '/:id',
        { preHandler: [validateRequest(ResultValidation.update)] },
        ResultController.updateResult
    );

    fastify.patch(
        '/:id/publish',
        { preHandler: [validateRequest(ResultValidation.publish)] },
        ResultController.publishResult
    );

    fastify.post('/exam/:examId/calculate-positions', ResultController.calculatePositions);

    fastify.delete('/:id', ResultController.deleteResult);
}