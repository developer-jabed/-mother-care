import type { FastifyInstance } from "fastify";
import { ExamValidation } from "./exam.validation.js";
import validateRequest from "../../middlewares/validateRequest.js";
import { ExamController } from "./exam.controller.js";


export default async function examRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/',
        { preHandler: [validateRequest(ExamValidation.create)] },
        ExamController.createExam
    );

    fastify.get(
        '/',
        { preHandler: [validateRequest(ExamValidation.getAllExams)] },
        ExamController.getAllExams
    );
    fastify.get('/:id', ExamController.getSingleExam);

    fastify.patch(
        '/:id',
        { preHandler: [validateRequest(ExamValidation.update)] },
        ExamController.updateExam
    );

    fastify.delete('/:id', ExamController.deleteExam);
}