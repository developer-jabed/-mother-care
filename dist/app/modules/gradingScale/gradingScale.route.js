import { GradingScaleValidation } from "./gradingScale.validation.js";
import validateRequest from "../../middlewares/validateRequest.js";
import { GradingScaleController } from "./gradingScale.controller.js";
export default async function gradingScaleRoutes(fastify) {
    fastify.post('/', { preHandler: [validateRequest(GradingScaleValidation.create)] }, GradingScaleController.createGradingScale);
    fastify.get('/', GradingScaleController.getAllGradingScales);
    fastify.get('/academic-year/:academicYearId', GradingScaleController.getGradingScalesByAcademicYear);
    fastify.get('/:id', GradingScaleController.getSingleGradingScale);
    fastify.patch('/:id', { preHandler: [validateRequest(GradingScaleValidation.update)] }, GradingScaleController.updateGradingScale);
    fastify.delete('/:id', GradingScaleController.deleteGradingScale);
}
//# sourceMappingURL=gradingScale.route.js.map