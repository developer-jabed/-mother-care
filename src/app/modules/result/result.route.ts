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

    // Static routes must come before any dynamic '/:id' matcher
    fastify.get(
        '/section-result',
        { preHandler: [validateRequest(ResultValidation.getSectionWiseResults)] },
        ResultController.getSectionWiseResults
    );

    fastify.get(
        '/combined-ranking',
        { preHandler: [validateRequest(ResultValidation.getCombinedRanking)] },
        ResultController.getCombinedRanking
    );

    fastify.get('/:id', ResultController.getSingleResult);

    fastify.post(
        '/exam/:examId/calculate-positions',
        { preHandler: [validateRequest(ResultValidation.calculatePositions)] },
        ResultController.calculatePositions
    );

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

    fastify.delete('/:id', ResultController.deleteResult);
}