import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { sendSmsViaBulkSmsBD, updateSmsLog } from './sms.sender.js';
import { prisma } from '../../shared/prisma.js';

const redisUrl = process.env.BULLMQ_REDIS_URL;
if (!redisUrl) throw new Error('BULLMQ_REDIS_URL is required');

const workerConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const smsWorker = new Worker(
  'result-sms',
  async (job: Job<any>) => {
    const {
      phone,
      message,
      smsLogId,
      studentEnrollmentId,
      examId,
      type,
    } = job.data;

    try {
      console.log(
        `📤 [${job.id}] Sending SMS to ${phone} | type=${type || 'RESULT'}`
      );

      const result = await sendSmsViaBulkSmsBD(phone, message);

      // Fee SMS
      if (smsLogId) {
        await prisma.smsLog.update({
          where: { id: smsLogId },
          data: {
            status: 'SENT',
            providerMessageId: result.providerResponse?.message_id
              ? String(result.providerResponse.message_id)
              : undefined,
            sentAt: new Date(),
            attemptCount: { increment: 1 },
          },
        });
      }
      // Result SMS (old support)
      else if (examId && studentEnrollmentId) {
        await updateSmsLog(
          studentEnrollmentId,
          examId,
          'SENT',
          result.providerResponse
        );
      }

      console.log(`✅ [${job.id}] SMS sent successfully to ${phone}`);
      return result;
    } catch (error: any) {
      const errorCode = error.code || 'UNKNOWN';
      const isRetryable = error.isRetryable !== false;

      console.error(
        `❌ [${job.id}] Failed to ${phone} | Code: ${errorCode}`
      );

      if (smsLogId) {
        await prisma.smsLog.update({
          where: { id: smsLogId },
          data: {
            status: isRetryable ? 'PENDING' : 'FAILED',
            errorMessage: error.message,
            attemptCount: { increment: 1 },
          },
        });
      } else if (examId && studentEnrollmentId) {
        await updateSmsLog(
          studentEnrollmentId,
          examId,
          isRetryable ? 'PENDING' : 'FAILED',
          undefined,
          error.message
        );
      }

      if (!isRetryable) {
        console.log(`🚫 Non-retryable error. Marked as FAILED.`);
        return {
          success: false,
          permanentFailure: true,
          code: errorCode,
        };
      }

      throw error;
    }
  },
  {
    connection: workerConnection,
    concurrency: 5,
    limiter: { max: 5, duration: 1000 },
  }
);

smsWorker.on('ready', () => {
  console.log('📨 SMS worker connected and listening on "result-sms" queue');
});

smsWorker.on('error', (err) => {
  console.error('🔥 SMS worker error:', err);
});

smsWorker.on('completed', (job) => {
  console.log(`🎉 Job ${job.id} completed`);
});

smsWorker.on('failed', (job, err) => {
  console.error(
    `💀 Job ${job?.id} failed permanently after retries:`,
    err.message
  );
});

export default smsWorker;