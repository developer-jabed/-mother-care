import { SmsController } from './sms.controller.js';
export default async function smsRoutes(fastify) {
    fastify.post('/exams/:examId/send-result-sms', SmsController.sendResultSms);
}
//# sourceMappingURL=sms.route.js.map