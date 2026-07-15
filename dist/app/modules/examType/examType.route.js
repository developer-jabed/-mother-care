import { ExamTypeValidation } from "./examType.validation.js";
import validateRequest from "../../middlewares/validateRequest.js";
import { ExamTypeController } from "./examType.controller.js";
export default async function examTypeRoutes(fastify) {
    fastify.post('/', { preHandler: [validateRequest(ExamTypeValidation.create)] }, ExamTypeController.createExamType);
    fastify.get('/', ExamTypeController.getAllExamTypes);
    fastify.get('/:id', ExamTypeController.getSingleExamType);
    fastify.patch('/:id', { preHandler: [validateRequest(ExamTypeValidation.update)] }, ExamTypeController.updateExamType);
    fastify.delete('/:id', ExamTypeController.deleteExamType);
}
//# sourceMappingURL=examType.route.js.map