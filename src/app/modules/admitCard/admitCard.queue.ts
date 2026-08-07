import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import type { IAdmitCardJobData } from './admitCard.interface.js';

const redisUrl = process.env.BULLMQ_REDIS_URL;

let admitCardQueue: Queue<IAdmitCardJobData> | null = null;
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
            console.log('🟢 Redis connected — admit card jobs will be queued');
        });

        queueConnection.on('error', (err) => {
            redisAvailable = false;
            console.error('🔴 Redis connection error — falling back to direct generation:', err.message);
        });

        admitCardQueue = new Queue<IAdmitCardJobData>('admit-card-generation', {
            connection: queueConnection,
        });
    } catch (err) {
        console.error('🔴 Failed to initialize BullMQ queue — falling back to direct generation:', err);
        admitCardQueue = null;
    }
} else {
    console.warn('⚠️ BULLMQ_REDIS_URL not set — admit card generation will always run synchronously');
}

export const isQueueAvailable = (): boolean => {
    return admitCardQueue !== null && redisAvailable;
};

export const addAdmitCardJob = async (data: IAdmitCardJobData): Promise<string> => {
    if (!admitCardQueue) {
        throw new Error('Queue not initialized');
    }

    const job = await admitCardQueue.add('generate-section', data, {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 8000,
        },
        removeOnComplete: {
            age: 3600,
        },
        removeOnFail: {
            age: 86400,
        },
        // Note: 'timeout' is no longer supported in JobsOptions
    });

    return job.id!;
};

export { admitCardQueue };