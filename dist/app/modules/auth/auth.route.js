import { UserRole } from '@prisma/client';
import validateRequest from '../../middlewares/validateRequest.js';
import { AuthValidation } from './auth.validation.js';
import { AuthController } from './auth.controller.js';
import auth from '../../middlewares/auth.middleware.js';
const ALL_ROLES = [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT, UserRole.GUARDIAN];
export default async function authRoutes(fastify) {
    fastify.post('/login', { preHandler: [validateRequest(AuthValidation.login)] }, AuthController.loginUser);
    fastify.post('/refresh-token', AuthController.refreshToken);
    fastify.post('/change-password', {
        preHandler: [auth(...ALL_ROLES), validateRequest(AuthValidation.changePassword)],
    }, AuthController.changePassword);
    fastify.get('/me', { preHandler: [auth(...ALL_ROLES)] }, AuthController.getMe);
    fastify.post('/logout', AuthController.logout);
}
//# sourceMappingURL=auth.route.js.map