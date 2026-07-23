import chromium from '@sparticuz/chromium';
import puppeteerCore, { type Browser } from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import httpStatus from 'http-status';
import fs from 'fs/promises';
import path from 'path';

import type {
    IAdmitCardData,
    IAdmitCardExamData,
    IAdmitCardGenerationResult,
    IAdmitCardScheduleRow,
    IAdmitCardStudentData,
    IFailedAdmitCard,
} from './admitCard.interface.js';

import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { fileUploader } from '../../helper/fileUploader.js';

const BATCH_SIZE = 10;
const isLocalDev = process.env.NODE_ENV !== 'production';

let browserInstance: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
    if (!browserInstance || !browserInstance.connected) {
        if (isLocalDev) {
            // Local dev machine (Windows/Mac/Linux) — use full puppeteer's own bundled Chrome
            const puppeteer = await import('puppeteer');
            browserInstance = (await puppeteer.default.launch({
                headless: true,
            })) as unknown as Browser;
        } else {
            // Production (Render/OCI Linux) — serverless-friendly Chromium binary
            browserInstance = await puppeteerCore.launch({
                args: chromium.args,
                executablePath: await chromium.executablePath(),
                headless: true,
            });
        }
    }
    return browserInstance;
};

/**
 * Pre-warm the browser at server startup so the first real request
 * doesn't pay the Chromium boot/extraction cost.
 */
const warmupBrowser = async (): Promise<void> => {
    try {
        await getBrowser();
        console.log('Puppeteer browser pre-warmed successfully');
    } catch (error) {
        console.error('Failed to pre-warm Puppeteer browser:', error);
    }
};

// ── Asset caches (logo + Bengali font) ──────────────────────────────
let logoBase64Cache: string | null = null;
let bengaliFontBase64Cache: string | null = null;

const loadAssetAsBase64 = async (filePath: string): Promise<string> => {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1);
    return `data:image/${ext};base64,${buffer.toString('base64')}`;
};

const getBrandAssets = async () => {
    if (!logoBase64Cache) {
        logoBase64Cache = await loadAssetAsBase64(
            path.join(process.cwd(), 'public', 'assets', 'mothercare-logo.png')
        );
    }
    return { logo: logoBase64Cache };
};

const getBengaliFontBase64 = async (): Promise<string> => {
    if (!bengaliFontBase64Cache) {
        const buffer = await fs.readFile(
            path.join(process.cwd(), 'public', 'fonts', 'NotoSansBengali-Regular.ttf')
        );
        bengaliFontBase64Cache = buffer.toString('base64');
    }
    return bengaliFontBase64Cache;
};

// ── Student photo handling ──────────────────────────────────────────

/**
 * Rewrite a Cloudinary URL to request a small, pre-cropped, auto-quality
 * thumbnail instead of the original full-resolution upload. Dramatically
 * reduces network transfer + Chromium image-decode time per card.
 */
const toCloudinaryThumbnail = (url: string): string => {
    if (!url.includes('/upload/')) return url; // not a Cloudinary URL, leave as-is
    return url.replace('/upload/', '/upload/w_200,h_240,c_fill,q_auto,f_auto/');
};

/**
 * Fetch a photo URL and convert it to a base64 data URI, so Chromium never
 * has to make its own network request during page.setContent(). Failures
 * are swallowed — the card just falls back to the "no photo" placeholder.
 */
const fetchPhotoAsBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to pre-fetch student photo:', error);
        return null;
    }
};

/**
 * Pre-fetch every student photo in the batch concurrently, once, before any
 * Chromium rendering starts. Returns a map of enrollmentId -> base64 data URI.
 */
const preloadPhotos = async (
    enrollments: { id: number; photo: string | null }[]
): Promise<Map<number, string | null>> => {
    const photoCache = new Map<number, string | null>();

    await Promise.all(
        enrollments.map(async (enrollment) => {
            if (!enrollment.photo) {
                photoCache.set(enrollment.id, null);
                return;
            }
            const thumbnailUrl = toCloudinaryThumbnail(enrollment.photo);
            const base64 = await fetchPhotoAsBase64(thumbnailUrl);
            photoCache.set(enrollment.id, base64);
        })
    );

    return photoCache;
};

const renderAdmitCardHtml = async (cards: IAdmitCardData[]): Promise<string> => {
    const { logo } = await getBrandAssets();
    const bengaliFont = await getBengaliFontBase64();

    const pages = await Promise.all(
        cards.map(async (card) => {
            const qrPayload = `${process.env.APP_URL}/api/v1/admit-cards/verify/${card.student.studentEnrollmentId}/${card.exam.examId}`;
            const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 100, margin: 0 });

            const rowCount = card.schedule.length;
            const densityClass =
                rowCount <= 5 ? 'roomy' : rowCount <= 8 ? 'normal' : 'compact';

            const scheduleRows = card.schedule
                .map((row, idx) => {
                    const start = new Date(row.startTime).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const end = new Date(row.endTime).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    return `
                    <tr>
                        <td class="sl">${idx + 1}</td>
                        <td class="subj">${row.subjectName}</td>
                        <td>${new Date(row.examDate).toLocaleDateString('en-US', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                    })}</td>
                        <td class="time-cell">
                            <span class="time-start">${start}</span>
                            <span class="time-arrow">&rarr;</span>
                            <span class="time-end">${end}</span>
                        </td>
                        <td class="room">${row.roomNumber ?? '—'}</td>
                    </tr>`;
                })
                .join('');

            return `
            <div class="admit-card ${densityClass}">
                <div class="bg-texture"></div>
                <div class="watermark">
                    <img src="${logo}" alt="Watermark" />
                </div>

                <div class="header">
                    <img class="logo" src="${logo}" alt="School Logo" />
                    <div class="header-text">
                        <div class="school-name">Mother Care School and College</div>
                        <div class="motto">Excellence in Education Since 2025</div>
                        <div class="title-row">
                            <span class="title">ADMIT CARD</span>
                            <span class="exam-name">${card.exam.examName} • ${card.exam.academicYearTitle}</span>
                        </div>
                    </div>
                </div>

                <div class="body">
                    <div class="photo-box">
                        ${card.student.photo
                    ? `<img src="${card.student.photo}" alt="Student Photo" />`
                    : `<div class="no-photo">Photo</div>`}
                    </div>

                    <div class="student-info">
                        <div class="info-grid">
                            <div class="info-row"><span class="label">Name</span><span class="value">${card.student.fullName}</span></div>
                            <div class="info-row"><span class="label">Admission No</span><span class="value">${card.student.admissionNumber}</span></div>
                            <div class="info-row"><span class="label">Father's Name</span><span class="value">${card.student.fatherName ?? '—'}</span></div>
                            <div class="info-row"><span class="label">Mother's Name</span><span class="value">${card.student.motherName ?? '—'}</span></div>
                            <div class="info-row"><span class="label">Class</span><span class="value">${card.student.className} • ${card.student.sectionName}</span></div>
                            <div class="info-row"><span class="label">Roll No</span><span class="value roll">${card.student.rollNumber}</span></div>
                        </div>
                    </div>

                    <div class="qr-box">
                        <img src="${qrDataUrl}" alt="QR Code" />
                        <div class="qr-label">Scan to Verify</div>
                    </div>
                </div>

                ${rowCount > 0
                    ? `
                    <div class="schedule-title">Exam Schedule</div>
                    <table class="schedule">
                        <thead>
                            <tr>
                                <th class="sl">#</th>
                                <th>Subject</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Room</th>
                            </tr>
                        </thead>
                        <tbody>${scheduleRows}</tbody>
                    </table>`
                    : `<p class="no-schedule">Exam schedule will be announced later.</p>`
                }

                <div class="footer">
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div>Principal's Signature</div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-line"></div>
                        <div>Student's Signature</div>
                    </div>
                </div>
            </div>`;
        })
    );

    return `
    <html>
    <head>
        <meta charset="utf-8" />
        <style>
            @font-face {
                font-family: 'Noto Sans Bengali';
                src: url(data:font/ttf;base64,${bengaliFont}) format('truetype');
                font-weight: normal;
                font-style: normal;
            }

            @page { size: A4; margin: 8mm; }
            * { box-sizing: border-box; }
            body {
                font-family: 'Noto Sans Bengali', 'Noto Sans', 'Segoe UI', sans-serif;
                margin: 0;
                background: #f8f5f0;
            }

            .admit-card {
                position: relative;
                page-break-after: always;
                border: 3px solid #1a2a44;
                border-radius: 10px;
                padding: 30px 34px;
                background: #fdfaf3;
                min-height: 100%;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 25px rgba(0,0,0,0.15);
                overflow: hidden;
            }
            .admit-card:last-child { page-break-after: auto; }

            .bg-texture {
                position: absolute;
                inset: 0;
                z-index: 0;
                opacity: 0.75;
                background-image:
                    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n' x='0' y='0'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.45 0 0 0 0 0.38 0 0 0 0 0.28 0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),
                    linear-gradient(rgba(245, 240, 230, 0.6), rgba(245, 240, 230, 0.6));
                background-repeat: repeat;
                pointer-events: none;
            }

            .watermark {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1;
                opacity: 0.06;
                pointer-events: none;
            }
            .watermark img { width: 50%; filter: grayscale(1); }

            .header, .body, .schedule-title, .schedule, .footer, .no-schedule {
                position: relative;
                z-index: 2;
            }

            .header {
                display: flex;
                align-items: center;
                gap: 20px;
                border-bottom: 3px double #8b6f47;
                padding-bottom: 16px;
                margin-bottom: 22px;
            }
            .logo {
                width: 76px;
                height: 76px;
                object-fit: contain;
                border: 3px solid #8b6f47;
                border-radius: 50%;
                padding: 4px;
                background: white;
                flex-shrink: 0;
            }
            .header-text { flex: 1; }
            .school-name {
                font-size: 25px;
                font-weight: 800;
                color: #1a2a44;
                letter-spacing: 0.4px;
            }
            .motto {
                font-size: 12.5px;
                color: #8b6f47;
                font-style: italic;
                margin: 3px 0 8px;
            }
            .title-row {
                display: flex;
                align-items: baseline;
                gap: 10px;
                background: #1a2a44;
                color: #fff;
                padding: 5px 12px;
                border-radius: 4px;
                width: fit-content;
            }
            .title {
                font-size: 15px;
                font-weight: 700;
                letter-spacing: 1.5px;
            }
            .exam-name {
                font-size: 12.5px;
                color: #d4af37;
                font-weight: 600;
            }

            .body {
                display: flex;
                gap: 26px;
                margin-bottom: 22px;
                align-items: stretch;
            }
            .photo-box {
                width: 122px;
                height: 148px;
                border: 4px solid #1a2a44;
                border-radius: 6px;
                overflow: hidden;
                background: #fff;
                flex-shrink: 0;
                box-shadow: 0 6px 12px rgba(0,0,0,0.2);
            }
            .photo-box img { width: 100%; height: 100%; object-fit: cover; }
            .no-photo {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #aaa;
                font-size: 13px;
            }

            .student-info {
                flex: 1;
                border-left: 2px solid #eee2cc;
                padding-left: 22px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                row-gap: 9px;
                column-gap: 18px;
            }
            .info-row { display: flex; flex-direction: column; font-size: 13.5px; }
            .label {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                color: #8b6f47;
                font-weight: 600;
                margin-bottom: 2px;
            }
            .value { font-weight: 600; color: #1a2a44; font-size: 14.5px; }
            .value.roll { color: #a8391e; font-size: 16px; }

            .qr-box { text-align: center; flex-shrink: 0; align-self: center; }
            .qr-box img {
                width: 100px;
                height: 100px;
                border: 3px solid #1a2a44;
                padding: 6px;
                background: white;
            }
            .qr-label { margin-top: 7px; font-size: 9.5px; color: #555; font-weight: 500; }

            .schedule-title {
                font-size: 13.5px;
                font-weight: 700;
                color: #1a2a44;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .schedule-title::after {
                content: '';
                flex: 1;
                height: 1px;
                background: #d8c9a3;
            }

            table.schedule {
                width: 100%;
                border-collapse: collapse;
                background: white;
                font-size: 13.5px;
                border-radius: 6px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            }
            table.schedule th {
                background: #1a2a44;
                color: white;
                text-align: left;
                font-weight: 600;
                font-size: 11.5px;
                text-transform: uppercase;
                letter-spacing: 0.4px;
            }
            table.schedule td { border-bottom: 1px solid #eee2cc; }
            table.schedule tr:last-child td { border-bottom: none; }
            table.schedule tr:nth-child(even) td { background: #faf6ec; }
            table.schedule .sl { width: 28px; color: #8b6f47; font-weight: 600; text-align: center; }
            table.schedule .subj { font-weight: 600; color: #1a2a44; }
            table.schedule .room {
                font-weight: 700;
                color: #1a2a44;
                text-align: center;
            }
            .time-cell { white-space: nowrap; }
            .time-start, .time-end {
                font-weight: 600;
                color: #1a2a44;
                background: #eef1f6;
                padding: 2px 7px;
                border-radius: 4px;
                font-size: 12px;
            }
            .time-arrow { margin: 0 6px; color: #8b6f47; font-weight: 700; }

            .admit-card.roomy table.schedule th,
            .admit-card.roomy table.schedule td { padding: 15px 14px; }
            .admit-card.roomy .schedule { margin: 22px 0 34px; }
            .admit-card.roomy .body { margin-bottom: 30px; }

            .admit-card.normal table.schedule th,
            .admit-card.normal table.schedule td { padding: 11px 12px; }
            .admit-card.normal .schedule { margin: 18px 0 26px; }

            .admit-card.compact table.schedule th,
            .admit-card.compact table.schedule td { padding: 7px 10px; font-size: 12.5px; }
            .admit-card.compact .schedule { margin: 14px 0 18px; }
            .admit-card.compact .time-start,
            .admit-card.compact .time-end { padding: 1px 5px; font-size: 11px; }
            .admit-card.compact .body { margin-bottom: 16px; }
            .admit-card.compact .header { margin-bottom: 16px; padding-bottom: 12px; }

            .no-schedule {
                text-align: center;
                font-size: 14px;
                color: #666;
                padding: 24px;
                border: 2px dashed #ccc;
                border-radius: 6px;
                margin: 20px 0;
            }

            .footer {
                display: flex;
                justify-content: space-between;
                margin-top: auto;
                padding-top: 24px;
                font-size: 13px;
            }
            .signature-box { text-align: center; width: 42%; }
            .signature-line {
                height: 1px;
                background: #333;
                margin-bottom: 7px;
                width: 85%;
                margin-left: auto;
                margin-right: auto;
            }
        </style>
    </head>
    <body>${pages.join('')}</body>
    </html>`;
};

const generatePdfBuffer = async (html: string): Promise<Buffer> => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        // domcontentloaded is sufficient now since photos/logo/font/QR are all
        // base64-embedded — no external network fetches happen during render.
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'a4', printBackground: true });
        return Buffer.from(pdfBuffer);
    } finally {
        await page.close();
    }
};

/**
 * Merge multiple single-batch PDF buffers into one final PDF document.
 */
const mergePdfBuffers = async (buffers: Buffer[]): Promise<Buffer> => {
    const mergedPdf = await PDFDocument.create();

    for (const buffer of buffers) {
        const doc = await PDFDocument.load(buffer);
        const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
    }

    const mergedBytes = await mergedPdf.save();
    return Buffer.from(mergedBytes);
};

// Cloudinary Upload Helper
const uploadAdmitCardToCloudinary = async (pdfBuffer: Buffer, examName: string, studentName?: string): Promise<string> => {
    const cleanExam = examName.replace(/[^a-zA-Z0-9]/g, '-');
    const cleanStudent = studentName ? studentName.replace(/[^a-zA-Z0-9]/g, '-') : 'batch';

    const uploadedFile = {
        buffer: pdfBuffer,
        mimetype: 'application/pdf',
        filename: `${cleanExam}-${cleanStudent}.pdf`
    };

    const result = await fileUploader.uploadToCloudinary(uploadedFile, 'admit-cards');
    return result.secure_url;
};

/**
 * Core generation function — pre-fetches photos, renders in small batches,
 * then merges into one PDF.
 */
const generateAdmitCardsForEnrollments = async (
    enrollmentIds: number[],
    examId: number
): Promise<IAdmitCardGenerationResult> => {
    const failed: IFailedAdmitCard[] = [];

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
        throw new ApiError(httpStatus.NOT_FOUND, `Exam ${examId} not found`);
    }

    const enrollments = await prisma.studentEnrollment.findMany({
        where: { id: { in: enrollmentIds } },
        include: { student: true, class: true, section: true, academicYear: true },
    });

    const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

    for (const id of enrollmentIds) {
        if (!enrollmentMap.has(id)) {
            failed.push({
                studentEnrollmentId: id,
                rollNumber: null,
                studentName: null,
                reason: 'Enrollment not found',
            });
        }
    }

    if (enrollments.length === 0) {
        return {
            pdfBuffer: null,
            cloudinaryUrl: undefined,
            totalStudents: enrollmentIds.length,
            successCount: 0,
            failed
        };
    }

    const classId = enrollments[0].classId;

    const scheduleRows = await prisma.examSchedule.findMany({
        where: { examId, classId },
        include: { subject: true },
        orderBy: { examDate: 'asc' },
    });

    const schedule: IAdmitCardScheduleRow[] = scheduleRows.map((row) => ({
        subjectName: row.subject.name,
        examDate: row.examDate,
        startTime: row.startTime,
        endTime: row.endTime,
        roomNumber: row.roomNumber,
    }));

    const examData: IAdmitCardExamData = {
        examId: exam.id,
        examName: exam.name,
        academicYearTitle: enrollments[0].academicYear.title,
        startDate: exam.startDate,
        endDate: exam.endDate,
    };

    // ── Pre-fetch every student photo once, concurrently, as small base64 thumbnails ──
    const photoCache = await preloadPhotos(
        enrollments.map((e) => ({ id: e.id, photo: e.student.photo }))
    );

    const cards: IAdmitCardData[] = enrollments.map((enrollment) => {
        const student: IAdmitCardStudentData = {
            studentEnrollmentId: enrollment.id,
            admissionNumber: enrollment.student.admissionNumber,
            fullName: enrollment.student.fullName,
            fatherName: enrollment.student.fatherName,
            motherName: enrollment.student.motherName,
            rollNumber: enrollment.rollNumber,
            photo: photoCache.get(enrollment.id) ?? null, // base64 thumbnail, or null for placeholder
            className: enrollment.class.name,
            sectionName: enrollment.section.name,
        };

        return { exam: examData, student, schedule };
    });

    if (cards.length === 0) {
        return {
            pdfBuffer: null,
            cloudinaryUrl: undefined,
            totalStudents: enrollmentIds.length,
            successCount: 0,
            failed
        };
    }

    // ── Render in small batches to keep each Chromium pass fast & light on memory ──
    const batches: IAdmitCardData[][] = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        batches.push(cards.slice(i, i + BATCH_SIZE));
    }

    const batchPdfBuffers: Buffer[] = [];
    for (const batch of batches) {
        const html = await renderAdmitCardHtml(batch);
        const buffer = await generatePdfBuffer(html);
        batchPdfBuffers.push(buffer);
    }

    const pdfBuffer =
        batchPdfBuffers.length === 1 ? batchPdfBuffers[0] : await mergePdfBuffers(batchPdfBuffers);

    let cloudinaryUrl: string | undefined = undefined;
    try {
        const studentName = cards.length === 1 ? cards[0].student.fullName : undefined;
        cloudinaryUrl = await uploadAdmitCardToCloudinary(pdfBuffer, exam.name, studentName);
    } catch (error) {
        console.error('Cloudinary upload failed:', error);
    }

    return {
        pdfBuffer,
        cloudinaryUrl,
        totalStudents: enrollmentIds.length,
        successCount: cards.length,
        failed,
    };
};

const getSectionEnrollmentIds = async (classId: number, sectionId: number): Promise<number[]> => {
    const enrollments = await prisma.studentEnrollment.findMany({
        where: { classId, sectionId },
        orderBy: { rollNumber: 'asc' },
        select: { id: true },
    });

    if (enrollments.length === 0) {
        throw new ApiError(httpStatus.NOT_FOUND, 'No students found in this class and section');
    }

    return enrollments.map((e) => e.id);
};

const generateSingleAdmitCard = async (
    studentEnrollmentId: number,
    examId: number
): Promise<Buffer> => {
    const result = await generateAdmitCardsForEnrollments([studentEnrollmentId], examId);

    if (!result.pdfBuffer) {
        const reason = result.failed[0]?.reason ?? 'Unknown error';
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to generate admit card: ${reason}`);
    }

    return result.pdfBuffer;
};

export const AdmitCardService = {
    getSectionEnrollmentIds,
    generateAdmitCardsForEnrollments,
    generateSingleAdmitCard,
    warmupBrowser,
};