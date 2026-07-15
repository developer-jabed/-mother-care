import type { FastifyRequest, FastifyReply } from 'fastify';
import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import sendResponse from '../../shared/sendResponse.js';
import { dashboardService } from './dashboard.service.js';

const getAdminDashboardMeta = catchAsync(
    async (request: FastifyRequest, reply: FastifyReply) => {
        const result = await dashboardService.getAdminDashboardMeta();

        sendResponse(reply, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'অ্যাডমিন ড্যাশবোর্ড তথ্য সফলভাবে পাওয়া গেছে',
            data: result,
        });
    },
);

export const dashboardController = {
    getAdminDashboardMeta,
};