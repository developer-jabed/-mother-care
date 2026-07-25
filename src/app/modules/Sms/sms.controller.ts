import httpStatus from 'http-status';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { SmsService } from './sms.service.js';
import catchAsync from '../../shared/catchAsync.js';
import pick from '../../helper/pick.js';
import { smsLogFilterableFields } from './sms.constant.js';
import sendResponse from '../../shared/sendResponse.js';
import type { PaginationQuery } from '../../helper/paginationHelper.js';

const sendResultSms = async (
    request: FastifyRequest<{ Params: { examId: string }; Querystring: { force?: string } }>,
    reply: FastifyReply
) => {
    const examId = Number(request.params.examId);
    const force = request.query.force === 'true';

    const result = await SmsService.queueResultSmsForExam(request.server, { examId, force });

    return reply.status(httpStatus.OK).send({
        success: true,
        message: `${result.queued}টি এসএমএস পাঠানোর জন্য সারিবদ্ধ করা হয়েছে`,
        data: result,
    });
};


const getSmsLogs = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = pick(request.query as Record<string, unknown>, smsLogFilterableFields);
    const query = request.query as PaginationQuery;

    const result = await SmsService.getSmsLogs(filters, query);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'এসএমএস লগ সফলভাবে পাওয়া গেছে',
        meta: result.meta,
        data: result.data,
    });
});


export const SmsController = { sendResultSms , getSmsLogs};