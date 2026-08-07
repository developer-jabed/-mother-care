import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import type { IResultCardJobData, IResultCardJobResult } from './resultCart.interface.js';
import { ResultCardService } from './resultCart.service.js';

const redisUrl = process.env.BULLMQ_REDIS_URL;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'result-cards');

const getBaseUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '');

const persistPdf = async (
    pdfBuffer: Buffer,
    jobId: string,
    examId: number,
    classId: number,
    sectionId: number
) => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const fileName = `result-card_exam${examId}_class${classId}_section${sectionId}_${jobId}.pdf`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await fs.writeFile(filePath, pdfBuffer);

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        console.warn('⚠️ APP_URL is not set — returning relative path, download link will likely 404');
        return `/result-cards/${fileName}`;
    }

    return `${baseUrl}/result-cards/${fileName}`;
};

if (redisUrl) {
    const workerConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    const resultCardWorker = new Worker<IResultCardJobData, IResultCardJobResult>(
        'result-card-generation',
        async (job: Job<IResultCardJobData>) => {
            const { examId, classId, sectionId, onlyEnrollmentIds } = job.data;

            console.log(
                `📄 [${job.id}] Generating result cards (low-memory) — class ${classId}, section ${sectionId}`
            );

            const enrollmentIds =
                onlyEnrollmentIds && onlyEnrollmentIds.length > 0
                    ? onlyEnrollmentIds
                    : await ResultCardService.getSectionEnrollmentIds(classId, sectionId);

            const result = await ResultCardService.generateResultCardsForEnrollments(
                enrollmentIds,
                examId
            );

            if (!result.pdfBuffer) {
                throw new Error(
                    `All ${result.totalStudents} result cards failed. Reasons: ${JSON.stringify(result.failed)}`
                );
            }

            const fileUrl = await persistPdf(
                result.pdfBuffer,
                job.id!,
                examId,
                classId,
                sectionId
            );

            if (result.failed.length > 0) {
                console.warn(
                    `⚠️ [${job.id}] Generated ${result.successCount}/${result.totalStudents}. Skipped: ${JSON.stringify(result.failed)}`
                );
            } else {
                console.log(
                    `✅ [${job.id}] All ${result.totalStudents} result cards generated successfully`
                );
            }

            return {
                fileUrl,
                totalStudents: result.totalStudents,
                successCount: result.successCount,
                failed: result.failed,
            };
        },
        {
            connection: workerConnection,
            concurrency: 1, // critical for 1GB RAM

            // Proper timeout settings
            lockDuration: 15 * 60 * 1000, // 15 minutes
            stalledInterval: 30_000,
            maxStalledCount: 2,
        }
    );

    resultCardWorker.on('ready', () =>
        console.log('📄 Result card worker connected (low-memory mode)')
    );
    resultCardWorker.on('error', (err) =>
        console.error('🔥 Result card worker error:', err)
    );
    resultCardWorker.on('completed', (job) =>
        console.log(`🎉 Result card job ${job.id} completed`)
    );
    resultCardWorker.on('failed', (job, err) =>
        console.error(`💀 Result card job ${job?.id} failed:`, err.message)
    );
    resultCardWorker.on('stalled', (jobId) =>
        console.warn(`⚠️ Result card job ${jobId} stalled`)
    );
} else {
    console.warn(
        '⚠️ BULLMQ_REDIS_URL not set — result card worker not started (direct-generation fallback only)'
    );
}