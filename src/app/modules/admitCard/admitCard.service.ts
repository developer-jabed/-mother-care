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

// ── Low-memory settings ──────────────────────────────────────────────
const BATCH_SIZE = 2;                 // critical for 1GB RAM
const isLocalDev = process.env.NODE_ENV !== 'production';

let browserInstance: Browser | null = null;
let pagesGenerated = 0;
const RESTART_BROWSER_AFTER = 8;      // restart very frequently

const getBrowser = async (): Promise<Browser> => {
    if (pagesGenerated >= RESTART_BROWSER_AFTER) {
        console.log(`[admit-pdf] Restarting browser after ${pagesGenerated} pages (low-memory mode)`);
        if (browserInstance) {
            try {
                await browserInstance.close();
            } catch { }
            browserInstance = null;
        }
        pagesGenerated = 0;

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
    }

    if (!browserInstance || !browserInstance.connected) {
        const commonArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--js-flags=--max-old-space-size=384', // limit V8 heap
        ];

        if (isLocalDev) {
            const puppeteer = await import('puppeteer');
            browserInstance = (await puppeteer.default.launch({
                headless: true,
                args: commonArgs,
            })) as unknown as Browser;
        } else {
            browserInstance = await puppeteerCore.launch({
                args: [...chromium.args, ...commonArgs],
                executablePath: await chromium.executablePath(),
                headless: true,
            });
        }
    }
    return browserInstance;
};

const warmupBrowser = async (): Promise<void> => {
    try {
        await getBrowser();
        console.log('Puppeteer browser pre-warmed (low-memory mode)');
    } catch (error) {
        console.error('Failed to pre-warm Puppeteer browser:', error);
    }
};

// ── Logo ─────────────────────────────────────────────────────────────
let logoHeaderCache: string | null = null;
let logoMarkCache: string | null = null;

const loadAndResizeLogo = async (): Promise<{ header: string; mark: string }> => {
    if (logoHeaderCache && logoMarkCache) {
        return { header: logoHeaderCache, mark: logoMarkCache };
    }

    const logoPath = path.join(process.cwd(), 'public', 'assets', 'mothercare-logo.png');
    const raw = await fs.readFile(logoPath);

    try {
        const sharp = (await import('sharp')).default;

        const headerBuf = await sharp(raw)
            .resize(120, 120, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 70, compressionLevel: 9 })
            .toBuffer();

        const markBuf = await sharp(raw)
            .resize(60, 60, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 50, compressionLevel: 9 })
            .toBuffer();

        logoHeaderCache = `data:image/png;base64,${headerBuf.toString('base64')}`;
        logoMarkCache = `data:image/png;base64,${markBuf.toString('base64')}`;
    } catch {
        console.warn('[admit-cards] sharp not available — using original logo');
        const b64 = `data:image/png;base64,${raw.toString('base64')}`;
        logoHeaderCache = b64;
        logoMarkCache = b64;
    }

    return { header: logoHeaderCache!, mark: logoMarkCache! };
};

// ── Principal Signature ──────────────────────────────────────────────
let principalSignatureCache: string | null = null;

const loadPrincipalSignature = async (): Promise<string> => {
    if (principalSignatureCache) return principalSignatureCache;

    try {
        const sigPath = path.join(process.cwd(), 'public', 'assets', 'principal-signature.png');
        const raw = await fs.readFile(sigPath);

        try {
            const sharp = (await import('sharp')).default;
            const resized = await sharp(raw)
                .resize(140, 55, { fit: 'inside', withoutEnlargement: true })
                .png({ quality: 70 })
                .toBuffer();

            principalSignatureCache = `data:image/png;base64,${resized.toString('base64')}`;
        } catch {
            principalSignatureCache = `data:image/png;base64,${raw.toString('base64')}`;
        }
    } catch {
        console.warn('[admit-cards] Principal signature not found');
        principalSignatureCache = '';
    }

    return principalSignatureCache;
};

// ── Bengali font ─────────────────────────────────────────────────────
let bengaliFontBase64Cache: string | null = null;

const getBengaliFontBase64 = async (): Promise<string> => {
    if (isLocalDev) return '';

    if (!bengaliFontBase64Cache) {
        const buffer = await fs.readFile(
            path.join(process.cwd(), 'public', 'fonts', 'NotoSansBengali-Regular.ttf')
        );
        bengaliFontBase64Cache = buffer.toString('base64');
    }
    return bengaliFontBase64Cache;
};

// ── Photo & Signature helpers (smaller sizes) ────────────────────────
const toCloudinaryThumbnail = (url: string): string => {
    if (!url.includes('/upload/')) return url;
    return url.replace('/upload/', '/upload/w_100,h_120,c_fill,q_auto:low,f_auto/');
};

const toCloudinarySignature = (url: string): string => {
    if (!url.includes('/upload/')) return url;
    return url.replace('/upload/', '/upload/w_140,h_55,c_fit,q_auto:low,f_auto/');
};

const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error('Failed to fetch image:', error);
        return null;
    }
};

const preloadPhotosAndSignatures = async (
    enrollments: { id: number; photo: string | null; signature: string | null }[]
): Promise<{
    photoCache: Map<number, string | null>;
    signatureCache: Map<number, string | null>;
}> => {
    const photoCache = new Map<number, string | null>();
    const signatureCache = new Map<number, string | null>();

    // Process in small chunks to avoid memory spikes
    const CHUNK = 5;
    for (let i = 0; i < enrollments.length; i += CHUNK) {
        const chunk = enrollments.slice(i, i + CHUNK);

        await Promise.all(
            chunk.map(async (enrollment) => {
                if (enrollment.photo) {
                    const thumbnailUrl = toCloudinaryThumbnail(enrollment.photo);
                    const base64 = await fetchImageAsBase64(thumbnailUrl);
                    photoCache.set(enrollment.id, base64);
                } else {
                    photoCache.set(enrollment.id, null);
                }

                if (enrollment.signature) {
                    const sigUrl = toCloudinarySignature(enrollment.signature);
                    const base64 = await fetchImageAsBase64(sigUrl);
                    signatureCache.set(enrollment.id, base64);
                } else {
                    signatureCache.set(enrollment.id, null);
                }
            })
        );
    }

    return { photoCache, signatureCache };
};

const renderAdmitCardHtml = async (cards: IAdmitCardData[]): Promise<string> => {
    const { header: logo, mark: logoMark } = await loadAndResizeLogo();
    const principalSig = await loadPrincipalSignature();
    const bengaliFont = await getBengaliFontBase64();

    const fontFaceCss = bengaliFont
        ? `
            @font-face {
                font-family: 'Noto Sans Bengali';
                src: url(data:font/ttf;base64,${bengaliFont}) format('truetype');
                font-weight: normal;
                font-style: normal;
            }
        `
        : '';

    const pages = await Promise.all(
        cards.map(async (card) => {
            const qrPayload = `${process.env.FRONTEND_URL}/admit-cards/verify/${card.student.studentEnrollmentId}/${card.exam.examId}`;
            const qrDataUrl = await QRCode.toDataURL(qrPayload, {
                width: 90,
                margin: 0,
                errorCorrectionLevel: 'M',
            });

            const rowCount = card.schedule.length;
            const densityClass =
                rowCount <= 5 ? 'roomy' : rowCount <= 8 ? 'normal' : 'compact';

            const scheduleRows = card.schedule
                .map((row, idx) => {
                    const timeOptions: Intl.DateTimeFormatOptions = {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                        timeZone: 'Asia/Dhaka',
                    };

                    const dateOptions: Intl.DateTimeFormatOptions = {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'Asia/Dhaka',
                    };

                    const start = new Date(row.startTime).toLocaleTimeString('en-US', timeOptions);
                    const end = new Date(row.endTime).toLocaleTimeString('en-US', timeOptions);

                    return `
                    <tr>
                        <td class="sl">${idx + 1}</td>
                        <td class="subj">${row.subjectName}</td>
                        <td>${new Date(row.examDate).toLocaleDateString('en-US', dateOptions)}</td>
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
                <div class="watermark">
                    <img src="${logoMark}" alt="" />
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
                    : `<div class="no-photo">Photo</div>`
                }
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
                        ${principalSig
                    ? `<img src="${principalSig}" class="principal-signature" alt="Principal Signature" />`
                    : `<div class="signature-line"></div>`
                }
                        <div>Principal's Signature</div>
                    </div>
                    <div class="signature-box">
                        ${card.student.signature
                    ? `<img src="${card.student.signature}" class="student-signature" alt="Student Signature" />`
                    : `<div class="signature-line"></div>`
                }
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
            ${fontFaceCss}

            @page { size: A4; margin: 8mm; }
            * { box-sizing: border-box; }
            body {
                font-family: 'Noto Sans Bengali', 'Segoe UI', system-ui, sans-serif;
                margin: 0;
                background: #f8f5f0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .admit-card {
                position: relative;
                page-break-after: always;
                page-break-inside: avoid;
                border: 3px solid #1a2a44;
                border-radius: 10px;
                padding: 28px 32px;
                background: #fdfaf3;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .admit-card:last-child { page-break-after: auto; }

            .watermark {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1;
                opacity: 0.05;
                pointer-events: none;
            }
            .watermark img { width: 42%; filter: grayscale(1); }

            .header, .body, .schedule-title, .schedule, .footer, .no-schedule {
                position: relative;
                z-index: 2;
            }

            .header {
                display: flex;
                align-items: center;
                gap: 18px;
                border-bottom: 3px double #8b6f47;
                padding-bottom: 14px;
                margin-bottom: 18px;
            }
            .logo {
                width: 68px;
                height: 68px;
                object-fit: contain;
                border: 3px solid #8b6f47;
                border-radius: 50%;
                padding: 3px;
                background: white;
                flex-shrink: 0;
            }
            .header-text { flex: 1; }
            .school-name {
                font-size: 22px;
                font-weight: 800;
                color: #1a2a44;
                letter-spacing: 0.3px;
            }
            .motto {
                font-size: 11.5px;
                color: #8b6f47;
                font-style: italic;
                margin: 2px 0 7px;
            }
            .title-row {
                display: flex;
                align-items: baseline;
                gap: 10px;
                background: #1a2a44;
                color: #fff;
                padding: 4px 11px;
                border-radius: 4px;
                width: fit-content;
            }
            .title {
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 1.4px;
            }
            .exam-name {
                font-size: 12px;
                color: #d4af37;
                font-weight: 600;
            }

            .body {
                display: flex;
                gap: 22px;
                margin-bottom: 16px;
                align-items: stretch;
            }
            .photo-box {
                width: 110px;
                height: 134px;
                border: 3px solid #1a2a44;
                border-radius: 6px;
                overflow: hidden;
                background: #fff;
                flex-shrink: 0;
            }
            .photo-box img { width: 100%; height: 100%; object-fit: cover; }
            .no-photo {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #aaa;
                font-size: 12px;
            }

            .student-info {
                flex: 1;
                border-left: 2px solid #eee2cc;
                padding-left: 18px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                row-gap: 7px;
                column-gap: 14px;
            }
            .info-row { display: flex; flex-direction: column; font-size: 13px; }
            .label {
                font-size: 9.5px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #8b6f47;
                font-weight: 600;
                margin-bottom: 1px;
            }
            .value { font-weight: 600; color: #1a2a44; font-size: 13.5px; }
            .value.roll { color: #a8391e; font-size: 15px; }

            .qr-box { text-align: center; flex-shrink: 0; align-self: center; }
            .qr-box img {
                width: 90px;
                height: 90px;
                border: 2px solid #1a2a44;
                padding: 5px;
                background: white;
            }
            .qr-label { margin-top: 5px; font-size: 9px; color: #555; font-weight: 500; }

            .schedule-title {
                font-size: 12.5px;
                font-weight: 700;
                color: #1a2a44;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
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
                font-size: 12.5px;
                border-radius: 5px;
                overflow: hidden;
            }
            table.schedule th {
                background: #1a2a44;
                color: white;
                text-align: left;
                font-weight: 600;
                font-size: 10.5px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            table.schedule td { border-bottom: 1px solid #eee2cc; }
            table.schedule tr:last-child td { border-bottom: none; }
            table.schedule tr:nth-child(even) td { background: #faf6ec; }
            table.schedule .sl { width: 26px; color: #8b6f47; font-weight: 600; text-align: center; }
            table.schedule .subj { font-weight: 600; color: #1a2a44; }
            table.schedule .room { font-weight: 700; color: #1a2a44; text-align: center; }
            .time-cell { white-space: nowrap; }
            .time-start, .time-end {
                font-weight: 600;
                color: #1a2a44;
                background: #eef1f6;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
            }
            .time-arrow { margin: 0 5px; color: #8b6f47; font-weight: 700; }

            .admit-card.roomy table.schedule th,
            .admit-card.roomy table.schedule td { padding: 12px 12px; }
            .admit-card.roomy .schedule { margin: 14px 0 18px; }
            .admit-card.roomy .body { margin-bottom: 18px; }

            .admit-card.normal table.schedule th,
            .admit-card.normal table.schedule td { padding: 9px 10px; }
            .admit-card.normal .schedule { margin: 12px 0 14px; }

            .admit-card.compact table.schedule th,
            .admit-card.compact table.schedule td { padding: 6px 8px; font-size: 11.5px; }
            .admit-card.compact .schedule { margin: 10px 0 12px; }
            .admit-card.compact .time-start,
            .admit-card.compact .time-end { padding: 1px 4px; font-size: 10.5px; }
            .admit-card.compact .body { margin-bottom: 12px; }
            .admit-card.compact .header { margin-bottom: 12px; padding-bottom: 10px; }

            .no-schedule {
                text-align: center;
                font-size: 13px;
                color: #666;
                padding: 16px;
                border: 2px dashed #ccc;
                border-radius: 6px;
                margin: 12px 0;
            }

            .footer {
                display: flex;
                justify-content: space-between;
                margin-top: 8px;
                padding-top: 14px;
                font-size: 12px;
                border-top: 1px dashed #d8c9a3;
            }
            .signature-box { text-align: center; width: 42%; }
            .signature-line {
                height: 1px;
                background: #333;
                margin-bottom: 6px;
                width: 85%;
                margin-left: auto;
                margin-right: auto;
            }

            .principal-signature {
                height: 45px;
                width: auto;
                max-width: 150px;
                object-fit: contain;
                margin: 0 auto 4px;
                display: block;
            }

            .student-signature {
                height: 40px;
                width: auto;
                max-width: 140px;
                object-fit: contain;
                margin: 0 auto 4px;
                display: block;
            }
        </style>
    </head>
    <body>${pages.join('')}</body>
    </html>`;
};

const generatePdfBuffer = async (html: string, pageCount: number): Promise<Buffer> => {
    const t0 = Date.now();
    const browser = await getBrowser();
    console.log(`[admit-pdf] browser ready in ${Date.now() - t0}ms`);

    const page = await browser.newPage();
    try {
        // Limit page resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['stylesheet', 'font', 'image', 'media', 'websocket'].includes(resourceType)) {
                // We already embed everything as base64, so block external requests
                if (!req.url().startsWith('data:')) {
                    return req.abort();
                }
            }
            req.continue();
        });

        const t1 = Date.now();
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 45_000,
        });
        console.log(
            `[admit-pdf] setContent ${Date.now() - t1}ms (html ~${(html.length / 1024).toFixed(0)} KB)`
        );

        const t2 = Date.now();
        const pdfBuffer = await page.pdf({
            format: 'a4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
            timeout: 45_000,
        });
        console.log(
            `[admit-pdf] page.pdf ${Date.now() - t2}ms → ${(pdfBuffer.byteLength / 1024).toFixed(0)} KB`
        );

        pagesGenerated += pageCount;
        return Buffer.from(pdfBuffer);
    } finally {
        await page.close().catch(() => { });
    }
};

const mergePdfBuffers = async (buffers: Buffer[]): Promise<Buffer> => {
    const mergedPdf = await PDFDocument.create();

    for (const buffer of buffers) {
        const doc = await PDFDocument.load(buffer);
        const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));
    }

    // Help garbage collection on low-memory servers
    buffers.length = 0;

    return Buffer.from(await mergedPdf.save());
};

const uploadAdmitCardToCloudinary = async (
    pdfBuffer: Buffer,
    examName: string,
    studentName?: string
): Promise<string> => {
    const cleanExam = examName.replace(/[^a-zA-Z0-9]/g, '-');
    const cleanStudent = studentName
        ? studentName.replace(/[^a-zA-Z0-9]/g, '-')
        : 'batch';

    const uploadedFile = {
        buffer: pdfBuffer,
        mimetype: 'application/pdf',
        filename: `${cleanExam}-${cleanStudent}.pdf`,
    };

    const result = await fileUploader.uploadToCloudinary(uploadedFile, 'admit-cards');
    return result.secure_url;
};

const generateAdmitCardsForEnrollments = async (
    enrollmentIds: number[],
    examId: number
): Promise<IAdmitCardGenerationResult> => {
    const tTotal = Date.now();
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
            failed,
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

    // ── Preload photos + signatures (chunked) ────────────────────────
    const tPhoto = Date.now();
    const { photoCache, signatureCache } = await preloadPhotosAndSignatures(
        enrollments.map((e) => ({
            id: e.id,
            photo: e.student.photo,
            signature: (e.student as any).signature ?? null,
        }))
    );
    console.log(
        `[admit-photos] preload ${Date.now() - tPhoto}ms for ${enrollments.length} students`
    );

    const cards: IAdmitCardData[] = enrollments.map((enrollment) => {
        const student: IAdmitCardStudentData = {
            studentEnrollmentId: enrollment.id,
            admissionNumber: enrollment.student.admissionNumber,
            fullName: enrollment.student.fullName,
            fatherName: enrollment.student.fatherName,
            motherName: enrollment.student.motherName,
            rollNumber: enrollment.rollNumber,
            photo: photoCache.get(enrollment.id) ?? null,
            signature: signatureCache.get(enrollment.id) ?? null,
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
            failed,
        };
    }

    // ── Sequential batch processing (safest for 1GB) ─────────────────
    const batches: IAdmitCardData[][] = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        batches.push(cards.slice(i, i + BATCH_SIZE));
    }

    console.log(
        `[admit-cards] Low-memory mode → ${cards.length} cards in ${batches.length} batches of ${BATCH_SIZE}`
    );

    const batchPdfBuffers: Buffer[] = [];

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const tBatch = Date.now();

        const html = await renderAdmitCardHtml(batch);
        const buffer = await generatePdfBuffer(html, batch.length);

        console.log(
            `[admit-batch ${i + 1}/${batches.length}] ${Date.now() - tBatch}ms (${batch.length} cards)`
        );

        batchPdfBuffers.push(buffer);

        // Small delay to let system breathe
        if (i < batches.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    const pdfBuffer =
        batchPdfBuffers.length === 1
            ? batchPdfBuffers[0]
            : await mergePdfBuffers(batchPdfBuffers);

    let cloudinaryUrl: string | undefined = undefined;
    if (!isLocalDev) {
        try {
            const studentName =
                cards.length === 1 ? cards[0].student.fullName : undefined;
            const tUp = Date.now();
            cloudinaryUrl = await uploadAdmitCardToCloudinary(
                pdfBuffer,
                exam.name,
                studentName
            );
            console.log(`[admit-cloudinary] upload ${Date.now() - tUp}ms`);
        } catch (error) {
            console.error('Cloudinary upload failed:', error);
        }
    }

    console.log(
        `[admit-cards] DONE ${Date.now() - tTotal}ms — ${cards.length}/${enrollmentIds.length} ok, pdf ${(pdfBuffer.byteLength / 1024).toFixed(0)} KB`
    );

    return {
        pdfBuffer,
        cloudinaryUrl,
        totalStudents: enrollmentIds.length,
        successCount: cards.length,
        failed,
    };
};

const getSectionEnrollmentIds = async (
    classId: number,
    sectionId: number
): Promise<number[]> => {
    const enrollments = await prisma.studentEnrollment.findMany({
        where: { classId, sectionId },
        orderBy: { rollNumber: 'asc' },
        select: { id: true },
    });

    if (enrollments.length === 0) {
        throw new ApiError(
            httpStatus.NOT_FOUND,
            'No students found in this class and section'
        );
    }

    return enrollments.map((e) => e.id);
};

const generateSingleAdmitCard = async (
    studentEnrollmentId: number,
    examId: number
): Promise<Buffer> => {
    const result = await generateAdmitCardsForEnrollments(
        [studentEnrollmentId],
        examId
    );

    if (!result.pdfBuffer) {
        const reason = result.failed[0]?.reason ?? 'Unknown error';
        throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            `Failed to generate admit card: ${reason}`
        );
    }

    return result.pdfBuffer;
};

export const AdmitCardService = {
    getSectionEnrollmentIds,
    generateAdmitCardsForEnrollments,
    generateSingleAdmitCard,
    warmupBrowser,
};