import { Worker, Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { AdmitCardService } from './admitCard.service.js';
import type { IAdmitCardJobData, IAdmitCardJobResult } from './admitCard.interface.js';

const redisUrl = process.env.BULLMQ_REDIS_URL;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'admit-cards');

const getBaseUrl = () => (process.env.APP_URL ?? '').replace(/\/$/, '');

const persistPdf = async (
    pdfBuffer: Buffer,
    jobId: string,
    examId: number,
    classId: number,
    sectionId: number
) => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const fileName = `admit-card_exam${examId}_class${classId}_section${sectionId}_${jobId}.pdf`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await fs.writeFile(filePath, pdfBuffer);

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        console.warn('⚠️ APP_URL is not set — returning relative path');
        return `/admit-cards/${fileName}`;
    }

    return `${baseUrl}/admit-cards/${fileName}`;
};

if (redisUrl) {
    const workerConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    const admitCardWorker = new Worker<IAdmitCardJobData, IAdmitCardJobResult>(
        'admit-card-generation',
        async (job: Job<IAdmitCardJobData>) => {
            const { examId, classId, sectionId, onlyEnrollmentIds } = job.data;

            console.log(
                `📄 [${job.id}] Generating admit cards (low-memory) — class ${classId}, section ${sectionId}`
            );

            const enrollmentIds =
                onlyEnrollmentIds && onlyEnrollmentIds.length > 0
                    ? onlyEnrollmentIds
                    : await AdmitCardService.getSectionEnrollmentIds(classId, sectionId);

            const result = await AdmitCardService.generateAdmitCardsForEnrollments(
                enrollmentIds,
                examId
            );

            if (!result.pdfBuffer) {
                throw new Error(
                    `All ${result.totalStudents} admit cards failed. Reasons: ${JSON.stringify(result.failed)}`
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
                    `✅ [${job.id}] All ${result.totalStudents} admit cards generated successfully`
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
            concurrency: 1, // must stay 1 on 1GB server

            // ── Correct timeout settings for modern BullMQ ──────────
            lockDuration: 15 * 60 * 1000, // 15 minutes (safe for 50 cards)
            stalledInterval: 30_000,      // check every 30 seconds
            maxStalledCount: 2,           // allow 2 stalls before failing
        }
    );

    admitCardWorker.on('ready', () =>
        console.log('📄 Admit card worker connected (low-memory mode)')
    );
    admitCardWorker.on('error', (err) =>
        console.error('🔥 Admit card worker error:', err)
    );
    admitCardWorker.on('completed', (job) =>
        console.log(`🎉 Admit card job ${job.id} completed`)
    );
    admitCardWorker.on('failed', (job, err) =>
        console.error(`💀 Admit card job ${job?.id} failed:`, err.message)
    );
    admitCardWorker.on('stalled', (jobId) =>
        console.warn(`⚠️ Admit card job ${jobId} stalled`)
    );
} else {
    console.warn(
        '⚠️ BULLMQ_REDIS_URL not set — admit card worker not started'
    );
}