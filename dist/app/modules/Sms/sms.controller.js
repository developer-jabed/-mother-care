import httpStatus from 'http-status';
import { SmsService } from './sms.service.js';
const sendResultSms = async (request, reply) => {
    const examId = Number(request.params.examId);
    const force = request.query.force === 'true';
    const result = await SmsService.queueResultSmsForExam(request.server, { examId, force });
    return reply.status(httpStatus.OK).send({
        success: true,
        message: `${result.queued}টি এসএমএস পাঠানোর জন্য সারিবদ্ধ করা হয়েছে`,
        data: result,
    });
};
export const SmsController = { sendResultSms };
//# sourceMappingURL=sms.controller.js.map