import type { FastifyInstance } from 'fastify';
import { dashboardController } from './dashboard.controller.js';
// import auth from '../../middlewares/auth.js';
// import { UserRole } from '@prisma/client';

const dashboardRoutes = async (fastify: FastifyInstance) => {
    fastify.get(
        '/admin/summary',
        // { preHandler: [auth(UserRole.ADMIN)] }, // wire in once your auth middleware path is confirmed
        dashboardController.getAdminDashboardMeta,
    );
};

export default dashboardRoutes;