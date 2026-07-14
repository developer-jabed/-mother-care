import type { FastifyInstance } from "fastify";
import { ClassSubjectValidation } from "./classSubject.validation.js";
import validateRequest from "../../middlewares/validateRequest.js";
import { ClassSubjectController } from "./classSubject.controller.js";


export default async function classSubjectRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/',
        { preHandler: [validateRequest(ClassSubjectValidation.create)] },
        ClassSubjectController.createClassSubject
    );

    fastify.get('/', ClassSubjectController.getAllClassSubjects);

    // IMPORTANT: this must come BEFORE '/:id', otherwise Fastify will match
    // "/subjects" as :id="subjects" and route it to getSingleClassSubject.
    fastify.get('/subjects', ClassSubjectController.getSubjectsByClassAndSection);

    fastify.get('/:id', ClassSubjectController.getSingleClassSubject);

    fastify.patch(
        '/:id',
        { preHandler: [validateRequest(ClassSubjectValidation.update)] },
        ClassSubjectController.updateClassSubject
    );

    fastify.delete('/:id', ClassSubjectController.deleteClassSubject);
}