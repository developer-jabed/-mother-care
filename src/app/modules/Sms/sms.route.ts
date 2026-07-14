import type { FastifyInstance } from 'fastify';
import { SmsController } from './sms.controller.js';

export default async function smsRoutes(fastify: FastifyInstance) {
    fastify.post<{ Params: { examId: string }; Querystring: { force?: string } }>(
        '/exams/:examId/send-result-sms',
        SmsController.sendResultSms
    );
}