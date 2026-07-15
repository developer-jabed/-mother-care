import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { sendSmsViaBulkSmsBD, updateSmsLog } from './sms.sender.js';
import type { ISmsJobData } from './sms.interface.js';

const redisUrl = process.env.UPSTASH_REDIS_URL;
if (!redisUrl) throw new Error("UPSTASH_REDIS_URL is required");

const workerConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

const smsWorker = new Worker(
    'result-sms', // must match the queue name in queue.ts exactly
    async (job: Job<ISmsJobData>) => {
        const { studentEnrollmentId, examId, phone, message } = job.data;

        try {
            console.log(`📤 [${job.id}] Sending to ${phone}`);

            const result = await sendSmsViaBulkSmsBD(phone, message);

            await updateSmsLog(studentEnrollmentId, examId, 'SENT', result.providerResponse);

            console.log(`✅ [${job.id}] Success to ${phone}`);
            return result;

        } catch (error: any) {
            const errorCode = error.code || 'UNKNOWN';
            const isRetryable = error.isRetryable !== false;

            console.error(`❌ [${job.id}] Failed to ${phone} | Code: ${errorCode}`);

            await updateSmsLog(
                studentEnrollmentId,
                examId,
                isRetryable ? 'PENDING' : 'FAILED',
                undefined,
                error.message
            );

            if (!isRetryable) {
                console.log(`🚫 Non-retryable error. Marked as FAILED.`);
            }

            throw error;
        }
    },
    {
        connection: workerConnection,
        concurrency: 8,
        limiter: { max: 25, duration: 1000 },
    }
);

smsWorker.on('ready', () => {
    console.log('📨 SMS worker connected and listening on "result-sms" queue');
});

smsWorker.on('error', (err) => {
    console.error('🔥 SMS worker error:', err);
});

export default smsWorker;