import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { IResultCardJobData } from './resultCart.interface.js';

const redisUrl = process.env.BULLMQ_REDIS_URL;

let resultCardQueue: Queue<IResultCardJobData> | null = null;
let redisAvailable = false;

if (redisUrl) {
    try {
        const queueConnection = new IORedis(redisUrl, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
            lazyConnect: false,
        });

        queueConnection.on('connect', () => {
            redisAvailable = true;
            console.log('🟢 Redis connected — result card jobs will be queued');
        });

        queueConnection.on('error', (err) => {
            redisAvailable = false;
            console.error('🔴 Redis connection error — falling back to direct generation:', err.message);
        });

        resultCardQueue = new Queue<IResultCardJobData>('result-card-generation', {
            connection: queueConnection,
        });
    } catch (err) {
        console.error('🔴 Failed to initialize BullMQ queue — falling back to direct generation:', err);
        resultCardQueue = null;
    }
} else {
    console.warn('⚠️ BULLMQ_REDIS_URL not set — result card generation will always run synchronously');
}

export const isQueueAvailable = (): boolean => {
    return resultCardQueue !== null && redisAvailable;
};

export const addResultCardJob = async (data: IResultCardJobData): Promise<string> => {
    if (!resultCardQueue || !redisAvailable) {
        throw new Error('Queue not available');
    }

    const job = await resultCardQueue.add('generate-section', data, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 8000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
        // Note: 'timeout' is no longer supported in JobsOptions
    });

    return String(job.id);
};

/** Normalized status for the frontend poller */
export const getResultCardJobStatus = async (jobId: string) => {
    if (!resultCardQueue) return null;

    const job = await resultCardQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();

    return {
        jobId: String(job.id),
        state,
        progress: job.progress ?? 0,
        result:
            state === 'completed'
                ? (job.returnvalue as {
                      fileUrl: string;
                      totalStudents: number;
                      successCount: number;
                      failed: unknown[];
                  })
                : undefined,
        failedReason: state === 'failed' ? job.failedReason ?? 'Job failed' : undefined,
    };
};

export { resultCardQueue };