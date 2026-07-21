import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { sendSmsViaBulkSmsBD, updateSmsLog } from './sms.sender.js';
import type { ISmsJobData } from './sms.interface.js';

const redisUrl = process.env.BULLMQ_REDIS_URL;
if (!redisUrl) throw new Error("BULLMQ_REDIS_URL is required");

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
                console.log(`🚫 Non-retryable error. Marked as FAILED — not retrying.`);
                // Resolve instead of throw so BullMQ doesn't waste retry attempts
                // on errors we already know are permanent (bad number, wrong sender ID, etc.)
                return { success: false, permanentFailure: true, code: errorCode };
            }

            throw error; // only retryable errors bubble up to trigger BullMQ retry
        }
    },
    {
        connection: workerConnection,
        concurrency: 5,
        limiter: { max: 5, duration: 1000 }, // 5 SMS/sec — safer for BulkSMSBD gateway limits
        // Redis Cloud doesn't bill per-command like Upstash did, so no need to
        // aggressively tune stalledInterval/drainDelay — BullMQ defaults are fine here.
    }
);

smsWorker.on('ready', () => {
    console.log('📨 SMS worker connected and listening on "result-sms" queue (Redis Cloud)');
});

smsWorker.on('error', (err) => {
    console.error('🔥 SMS worker error:', err);
});

smsWorker.on('completed', (job) => {
    console.log(`🎉 Job ${job.id} completed`);
});

smsWorker.on('failed', (job, err) => {
    console.error(`💀 Job ${job?.id} failed permanently after retries:`, err.message);
});

export default smsWorker;