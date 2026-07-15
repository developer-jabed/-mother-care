import { SubjectValidation } from "./subject.validation.js";
import { SubjectController } from "./subject.controller.js";
import validateRequest from "../../middlewares/validateRequest.js";
export default async function subjectRoutes(fastify) {
    fastify.post('/', { preHandler: [validateRequest(SubjectValidation.create)] }, SubjectController.createSubject);
    fastify.get('/', SubjectController.getAllSubjects);
    fastify.get('/:id', SubjectController.getSingleSubject);
    fastify.patch('/:id', { preHandler: [validateRequest(SubjectValidation.update)] }, SubjectController.updateSubject);
    fastify.delete('/:id', SubjectController.deleteSubject);
}
//# sourceMappingURL=subject.route.js.map