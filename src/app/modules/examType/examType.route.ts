import type { FastifyInstance } from "fastify";
import { ExamTypeValidation } from "./examType.validation.js";
import validateRequest from "../../middlewares/validateRequest.js";
import { ExamTypeController } from "./examType.controller.js";

export default async function examTypeRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/',
        { preHandler: [validateRequest(ExamTypeValidation.create)] },
        ExamTypeController.createExamType
    );

    fastify.get('/', ExamTypeController.getAllExamTypes);
    fastify.get('/:id', ExamTypeController.getSingleExamType);

    fastify.patch(
        '/:id',
        { preHandler: [validateRequest(ExamTypeValidation.update)] },
        ExamTypeController.updateExamType
    );

    fastify.delete('/:id', ExamTypeController.deleteExamType);
}