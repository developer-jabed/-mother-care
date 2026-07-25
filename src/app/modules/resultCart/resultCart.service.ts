import chromium from '@sparticuz/chromium';
import puppeteerCore, { type Browser } from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import httpStatus from 'http-status';
import fs from 'fs/promises';
import path from 'path';

import type {
    IResultCardData,
    IResultCardExamData,
    IResultCardGenerationResult,
    IResultCardStudentData,
    IResultCardSubjectRow,
    IFailedResultCard,
} from './resultCart.interface.js';

import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { fileUploader } from '../../helper/fileUploader.js';

const BATCH_SIZE = 10;
const isLocalDev = process.env.NODE_ENV !== 'production';

// ── Shared browser instance (same lifecycle pattern as admitCard.service.ts) ──
let browserInstance: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
    if (!browserInstance || !browserInstance.connected) {
        if (isLocalDev) {
            const puppeteer = await import('puppeteer');
            browserInstance = (await puppeteer.default.launch({
                headless: true,
            })) as unknown as Browser;
        } else {
            browserInstance = await puppeteerCore.launch({
                args: chromium.args,
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
        console.log('Puppeteer browser pre-warmed successfully (result cards)');
    } catch (error) {
        console.error('Failed to pre-warm Puppeteer browser (result cards):', error);
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

// ── Student photo handling (same thumbnail + prefetch strategy) ─────
const toCloudinaryThumbnail = (url: string): string => {
    if (!url.includes('/upload/')) return url;
    return url.replace('/upload/', '/upload/w_200,h_240,c_fill,q_auto,f_auto/');
};

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
// ── HTML rendering ───────────────────────────────────────────────────
const gradeBadgeClass = (grade: string): string => {
    if (grade.startsWith('A')) return 'badge-green';
    if (grade === 'F' || grade.toUpperCase() === 'FAIL') return 'badge-red';
    return 'badge-blue';
};

const renderResultCardHtml = async (cards: IResultCardData[]): Promise<string> => {
    const { logo } = await getBrandAssets();
    const bengaliFont = await getBengaliFontBase64();

    const pages = cards
        .map((card) => {
            const subjectRows = card.subjects
                .map(
                    (row, idx) => `
                    <tr>
                        <td class="sl">${idx + 1}</td>
                        <td class="code">${row.subjectCode}</td>
                        <td class="subj">${row.subjectName}</td>
                        <td class="marks">${row.totalMarks} <span class="marks-sep">/</span> ${row.fullMarks}</td>
                        <td class="grade-cell"><span class="badge ${gradeBadgeClass(row.grade)}">${row.grade}</span></td>
                    </tr>`
                )
                .join('');

            const positionRow = card.summary.position
                ? `<tr>
                        <td class="label">Position</td>
                        <td class="value" colspan="3"><span class="position-pill">${card.summary.position}</span></td>
                   </tr>`
                : '';

            return `
            <div class="result-card">
                <!-- Deep paper texture layers -->
                <div class="paper-base"></div>
                <div class="paper-grain"></div>
                <div class="paper-vignette"></div>
                <div class="corner-ornament corner-tl"></div>
                <div class="corner-ornament corner-tr"></div>
                <div class="corner-ornament corner-bl"></div>
                <div class="corner-ornament corner-br"></div>

                <div class="watermark">
                    <img src="${logo}" alt="" />
                </div>

                <!-- School identity header -->
                <header class="school-header">
                    <div class="header-accent-bar"></div>
                    <div class="header-content">
                        <div class="logo-wrap">
                            <img src="${logo}" alt="Mother Care School & College" class="school-logo" />
                        </div>
                        <div class="school-identity">
                            <div class="school-name">Mother Care School &amp; College</div>
                            <div class="school-tagline">Excellence in Education · Character · Leadership</div>
                            <div class="school-meta">
                                <span class="est-badge">Est. 2025</span>
                                <span class="meta-sep">·</span>
                                <span>${card.exam.academicYearTitle}</span>
                            </div>
                        </div>
                    </div>
                    <div class="header-bottom-rule"></div>
                </header>

                <div class="result-banner">
                    <span class="banner-label">Official Result</span>
                    <span class="banner-exam">${card.exam.examName.toUpperCase()}</span>
                </div>

                <div class="section-title">
                    <span class="section-icon">◆</span>
                    Student Information Summary
                </div>
                <table class="info-table">
                    <tr>
                        <td class="label">Roll No</td>
                        <td class="value roll">${card.student.rollNumber}</td>
                        <td class="label">Admission No</td>
                        <td class="value">${card.student.admissionNumber}</td>
                    </tr>
                    <tr>
                        <td class="label">Name of Student</td>
                        <td class="value name" colspan="3">${card.student.fullName}</td>
                    </tr>
                    <tr>
                        <td class="label">Father's Name</td>
                        <td class="value">${card.student.fatherName ?? '—'}</td>
                        <td class="label">Mother's Name</td>
                        <td class="value">${card.student.motherName ?? '—'}</td>
                    </tr>
                    <tr>
                        <td class="label">Class &amp; Section</td>
                        <td class="value">${card.student.className} · ${card.student.sectionName}</td>
                        <td class="label">Date of Birth</td>
                        <td class="value">${new Date(card.student.dateOfBirth).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            })}</td>
                    </tr>
                    <tr>
                        <td class="label">Result</td>
                        <td class="value result-value">
                            GPA <strong>${card.summary.gradePoint.toFixed(2)}</strong>
                            <span class="grade-inline">(${card.summary.grade})</span>
                        </td>
                        <td class="label">Percentage</td>
                        <td class="value pct">${card.summary.percentage.toFixed(2)}%</td>
                    </tr>
                    ${positionRow}
                </table>

                <div class="section-title">
                    <span class="section-icon">◆</span>
                    Subject-wise Grade / Marks
                </div>
                <table class="subject-table">
                    <thead>
                        <tr>
                            <th class="sl">#</th>
                            <th>Subject Code</th>
                            <th>Subject Name</th>
                            <th>Marks</th>
                            <th>Grade</th>
                        </tr>
                    </thead>
                    <tbody>${subjectRows}</tbody>
                </table>

                <footer class="card-footer">
                    <div class="footer-note">
                        This is a computer-generated result card of<br/>
                        <strong>Mother Care School &amp; College</strong> · Est. 2025
                    </div>
                    <div class="signatures">
                        <div class="signature-box">
                            <div class="signature-line"></div>
                            <div class="sig-title">Controller of Examinations</div>
                        </div>
                        <div class="signature-box">
                            <div class="signature-line"></div>
                            <div class="sig-title">Principal</div>
                        </div>
                    </div>
                </footer>
            </div>`;
        })
        .join('');

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
            @page { size: A4; margin: 6mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Noto Sans Bengali', 'Noto Sans', 'Segoe UI', system-ui, sans-serif;
                background: #e8ecf4;
                color: #1a2332;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            /* ── Card shell ── */
            .result-card {
                position: relative;
                page-break-after: always;
                min-height: 100%;
                overflow: hidden;
                border-radius: 6px;
                border: 1.5px solid #c5cddc;
                background: #faf8f4;
                box-shadow:
                    0 1px 0 rgba(255,255,255,0.7) inset,
                    0 12px 40px rgba(30, 58, 138, 0.12);
            }
            .result-card:last-child { page-break-after: auto; }

            /* Deep paper texture */
            .paper-base {
                position: absolute; inset: 0; z-index: 0;
                background:
                    linear-gradient(165deg, #fdfbf7 0%, #f5f1e8 45%, #efe9dc 100%);
            }
            .paper-grain {
                position: absolute; inset: 0; z-index: 0;
                opacity: 0.45;
                background-image:
                    radial-gradient(circle at 20% 30%, rgba(120,100,60,0.04) 0%, transparent 50%),
                    radial-gradient(circle at 80% 70%, rgba(80,90,120,0.05) 0%, transparent 45%),
                    url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
                background-size: 100% 100%, 100% 100%, 180px 180px;
            }
            .paper-vignette {
                position: absolute; inset: 0; z-index: 0;
                pointer-events: none;
                background: radial-gradient(
                    ellipse 85% 75% at 50% 45%,
                    transparent 40%,
                    rgba(40, 50, 80, 0.07) 100%
                );
            }

            /* Corner ornaments */
            .corner-ornament {
                position: absolute; z-index: 3;
                width: 28px; height: 28px;
                border-color: #b08d57;
                border-style: solid;
                opacity: 0.55;
            }
            .corner-tl { top: 10px; left: 10px; border-width: 2px 0 0 2px; border-radius: 4px 0 0 0; }
            .corner-tr { top: 10px; right: 10px; border-width: 2px 2px 0 0; border-radius: 0 4px 0 0; }
            .corner-bl { bottom: 10px; left: 10px; border-width: 0 0 2px 2px; border-radius: 0 0 0 4px; }
            .corner-br { bottom: 10px; right: 10px; border-width: 0 2px 2px 0; border-radius: 0 0 4px 0; }

            .watermark {
                position: absolute; inset: 0;
                display: flex; align-items: center; justify-content: center;
                z-index: 1; opacity: 0.045; pointer-events: none;
            }
            .watermark img { width: 48%; filter: grayscale(1); }

            /* Content sits above texture */
            .school-header,
            .result-banner,
            .section-title,
            .info-table,
            .subject-table,
            .card-footer {
                position: relative;
                z-index: 2;
            }

            /* ── School header ── */
            .school-header {
                background: linear-gradient(135deg, #0f1f4b 0%, #1e3a8a 55%, #1e40af 100%);
                color: #fff;
                padding: 0;
                position: relative;
                overflow: hidden;
            }
            .header-accent-bar {
                height: 4px;
                background: linear-gradient(90deg, #b08d57, #e8d5a3, #b08d57);
            }
            .header-content {
                display: flex;
                align-items: center;
                gap: 18px;
                padding: 18px 26px 16px;
            }
            .logo-wrap {
                flex-shrink: 0;
                width: 64px; height: 64px;
                border-radius: 50%;
                background: rgba(255,255,255,0.12);
                border: 2px solid rgba(176, 141, 87, 0.6);
                display: flex; align-items: center; justify-content: center;
                box-shadow: 0 0 0 4px rgba(255,255,255,0.06);
            }
            .school-logo {
                width: 48px; height: 48px;
                object-fit: contain;
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
            }
            .school-identity { flex: 1; min-width: 0; }
            .school-name {
                font-size: 20px;
                font-weight: 800;
                letter-spacing: 0.4px;
                line-height: 1.2;
                text-shadow: 0 1px 2px rgba(0,0,0,0.25);
            }
            .school-tagline {
                font-size: 11px;
                opacity: 0.85;
                margin-top: 3px;
                letter-spacing: 0.6px;
                font-weight: 500;
            }
            .school-meta {
                margin-top: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11.5px;
                opacity: 0.9;
            }
            .est-badge {
                display: inline-block;
                background: linear-gradient(135deg, #b08d57, #8f7040);
                color: #fff;
                font-weight: 700;
                font-size: 10px;
                letter-spacing: 0.08em;
                padding: 3px 10px;
                border-radius: 999px;
                text-transform: uppercase;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            .meta-sep { opacity: 0.5; }
            .header-bottom-rule {
                height: 3px;
                background: linear-gradient(90deg,
                    transparent 0%,
                    rgba(176,141,87,0.7) 20%,
                    rgba(232,213,163,0.9) 50%,
                    rgba(176,141,87,0.7) 80%,
                    transparent 100%
                );
            }

            /* Result banner */
            .result-banner {
                background: linear-gradient(90deg, #eef1fb, #f7f5f0, #eef1fb);
                border-bottom: 1px solid #d4dced;
                padding: 11px 20px;
                text-align: center;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }
            .banner-label {
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: #5b6b8c;
            }
            .banner-exam {
                font-size: 14px;
                font-weight: 800;
                color: #1e3a8a;
                letter-spacing: 0.04em;
            }

            /* Section titles */
            .section-title {
                background: linear-gradient(90deg, #1e3a8a, #1e40af);
                color: #fff;
                font-size: 11.5px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                padding: 8px 16px;
                margin: 18px 18px 0;
                border-radius: 4px 4px 0 0;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 2px 6px rgba(30, 58, 138, 0.25);
            }
            .section-icon {
                color: #e8d5a3;
                font-size: 9px;
            }

            /* Info table */
            table.info-table {
                width: calc(100% - 36px);
                margin: 0 18px 2px;
                border-collapse: collapse;
                font-size: 12.5px;
                background: rgba(255,255,255,0.55);
                border: 1px solid #e0e6f0;
                border-top: none;
            }
            table.info-table td {
                border: 1px solid #e3e8f2;
                padding: 8px 12px;
                vertical-align: middle;
            }
            table.info-table .label {
                background: linear-gradient(180deg, #f4f7fc, #eef2f9);
                color: #5b6b8c;
                font-weight: 700;
                width: 118px;
                font-size: 10.5px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }
            table.info-table .value {
                font-weight: 600;
                color: #1a2a44;
            }
            table.info-table .value.roll {
                color: #1e3a8a;
                font-size: 15px;
                font-weight: 800;
            }
            table.info-table .value.name {
                font-size: 14px;
                font-weight: 700;
                color: #0f1f4b;
            }
            table.info-table .result-value {
                color: #157347;
                font-size: 13.5px;
            }
            table.info-table .result-value strong {
                font-size: 16px;
            }
            .grade-inline {
                font-weight: 600;
                margin-left: 4px;
                color: #0f5132;
            }
            table.info-table .pct {
                font-weight: 700;
                color: #1e3a8a;
            }
            .position-pill {
                display: inline-block;
                background: linear-gradient(135deg, #1e3a8a, #1e40af);
                color: #fff;
                font-weight: 700;
                font-size: 12px;
                padding: 3px 14px;
                border-radius: 999px;
                letter-spacing: 0.03em;
            }

            /* Subject table */
            table.subject-table {
                width: calc(100% - 36px);
                margin: 0 18px 20px;
                border-collapse: collapse;
                font-size: 12.5px;
                background: rgba(255,255,255,0.55);
                border: 1px solid #e0e6f0;
                border-top: none;
            }
            table.subject-table th {
                background: linear-gradient(180deg, #1e3a8a, #162d6e);
                color: #fff;
                text-align: left;
                padding: 9px 12px;
                font-size: 10.5px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                font-weight: 700;
            }
            table.subject-table td {
                border-bottom: 1px solid #e8edf5;
                padding: 8px 12px;
            }
            table.subject-table tr:nth-child(even) td {
                background: rgba(247, 249, 253, 0.85);
            }
            table.subject-table tr:last-child td {
                border-bottom: none;
            }
            table.subject-table .sl {
                width: 32px;
                text-align: center;
                color: #7a8699;
                font-weight: 600;
            }
            table.subject-table .code {
                color: #5b6b8c;
                font-family: ui-monospace, 'IBM Plex Mono', monospace;
                font-size: 11.5px;
            }
            table.subject-table .subj {
                font-weight: 650;
                color: #1a2a44;
            }
            table.subject-table .marks {
                font-weight: 700;
                color: #1a2a44;
            }
            .marks-sep {
                color: #9aa5b8;
                font-weight: 500;
                margin: 0 2px;
            }

            /* Grade badges */
            .badge {
                display: inline-block;
                padding: 3px 11px;
                border-radius: 999px;
                font-weight: 800;
                font-size: 11.5px;
                letter-spacing: 0.02em;
                min-width: 36px;
                text-align: center;
            }
            .badge-green {
                background: linear-gradient(180deg, #d8f5e4, #c3ecd4);
                color: #0f5132;
                box-shadow: 0 1px 0 rgba(15, 81, 50, 0.12);
            }
            .badge-blue {
                background: linear-gradient(180deg, #dbe6fb, #c9d8f7);
                color: #1e3a8a;
                box-shadow: 0 1px 0 rgba(30, 58, 138, 0.12);
            }
            .badge-red {
                background: linear-gradient(180deg, #fce0de, #f5cfcb);
                color: #9b1c1c;
                box-shadow: 0 1px 0 rgba(155, 28, 28, 0.12);
            }

            /* Footer */
            .card-footer {
                margin-top: 8px;
                padding: 16px 28px 22px;
                border-top: 1px dashed #d4d0c4;
            }
            .footer-note {
                text-align: center;
                font-size: 10.5px;
                color: #6b7280;
                line-height: 1.55;
                margin-bottom: 22px;
            }
            .footer-note strong {
                color: #1e3a8a;
            }
            .signatures {
                display: flex;
                justify-content: space-between;
                padding: 0 12px;
            }
            .signature-box {
                text-align: center;
                width: 38%;
            }
            .signature-line {
                height: 1px;
                background: linear-gradient(90deg, transparent, #4a5568 15%, #4a5568 85%, transparent);
                margin: 0 auto 7px;
                width: 88%;
            }
            .sig-title {
                font-size: 11px;
                font-weight: 600;
                color: #374151;
                letter-spacing: 0.02em;
            }
        </style>
    </head>
    <body>${pages}</body>
    </html>`;
};
const generatePdfBuffer = async (html: string): Promise<Buffer> => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'a4', printBackground: true });
        return Buffer.from(pdfBuffer);
    } finally {
        await page.close();
    }
};

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

const uploadResultCardToCloudinary = async (
    pdfBuffer: Buffer,
    examName: string,
    studentName?: string
): Promise<string> => {
    const cleanExam = examName.replace(/[^a-zA-Z0-9]/g, '-');
    const cleanStudent = studentName ? studentName.replace(/[^a-zA-Z0-9]/g, '-') : 'batch';

    const uploadedFile = {
        buffer: pdfBuffer,
        mimetype: 'application/pdf',
        filename: `result-${cleanExam}-${cleanStudent}.pdf`,
    };

    const result = await fileUploader.uploadToCloudinary(uploadedFile, 'result-cards');
    return result.secure_url;
};

/**
 * Core generation function — fetches Result + ResultDetail rows for the given
 * enrollment ids under a specific exam, renders in batches, merges into one PDF.
 */
const generateResultCardsForEnrollments = async (
    enrollmentIds: number[],
    examId: number
): Promise<IResultCardGenerationResult> => {
    const failed: IFailedResultCard[] = [];

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
        throw new ApiError(httpStatus.NOT_FOUND, `Exam ${examId} not found`);
    }

    const enrollments = await prisma.studentEnrollment.findMany({
        where: { id: { in: enrollmentIds } },
        include: {
            student: true,
            class: true,
            section: true,
            academicYear: true,
            results: {
                where: { examId },
                include: {
                    details: { include: { subject: true } },
                },
            },
        },
    });

    const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

    for (const id of enrollmentIds) {
        const enrollment = enrollmentMap.get(id);
        if (!enrollment) {
            failed.push({
                studentEnrollmentId: id,
                rollNumber: null,
                studentName: null,
                reason: 'Enrollment not found',
            });
            continue;
        }
        if (!enrollment.results || enrollment.results.length === 0) {
            failed.push({
                studentEnrollmentId: id,
                rollNumber: enrollment.rollNumber,
                studentName: enrollment.student.fullName,
                reason: 'Result not found for this exam',
            });
        }
    }

    const eligibleEnrollments = enrollments.filter(
        (e) => e.results && e.results.length > 0
    );

    if (eligibleEnrollments.length === 0) {
        return {
            pdfBuffer: null,
            cloudinaryUrl: undefined,
            totalStudents: enrollmentIds.length,
            successCount: 0,
            failed,
        };
    }

    const examData: IResultCardExamData = {
        examId: exam.id,
        examName: exam.name,
        academicYearTitle: eligibleEnrollments[0].academicYear.title,
    };

    // Photos are optional on result cards — enable if you want them displayed
    const photoCache = await preloadPhotos(
        eligibleEnrollments.map((e) => ({ id: e.id, photo: e.student.photo }))
    );

    const cards: IResultCardData[] = eligibleEnrollments.map((enrollment) => {
        const result = enrollment.results[0]; // unique per [studentEnrollmentId, examId]

        const subjects: IResultCardSubjectRow[] = result.details.map((detail) => ({
            subjectCode: detail.subject.code,
            subjectName: detail.subject.name,
            fullMarks: detail.subject.fullMarks,
            passMarks: detail.subject.passMarks,
            writtenMarks: detail.writtenMarks,
            mcqMarks: detail.mcqMarks,
            practicalMarks: detail.practicalMarks,
            vivaMarks: detail.vivaMarks,
            totalMarks: detail.totalMarks,
            grade: detail.grade,
            gradePoint: detail.gradePoint,
        }));

        const student: IResultCardStudentData = {
            studentEnrollmentId: enrollment.id,
            admissionNumber: enrollment.student.admissionNumber,
            fullName: enrollment.student.fullName,
            fatherName: enrollment.student.fatherName,
            motherName: enrollment.student.motherName,
            dateOfBirth: enrollment.student.dateOfBirth,
            gender: enrollment.student.gender,
            className: enrollment.class.name,
            sectionName: enrollment.section.name,
            rollNumber: enrollment.rollNumber,
            photo: photoCache.get(enrollment.id) ?? null,
        };

        return {
            exam: examData,
            student,
            summary: {
                totalMarks: result.totalMarks,
                percentage: result.percentage,
                grade: result.grade,
                gradePoint: result.gradePoint,
                position: result.position,
                remarks: result.remarks,
            },
            subjects,
        };
    });

    // ── Batch render + merge ──
    const batches: IResultCardData[][] = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        batches.push(cards.slice(i, i + BATCH_SIZE));
    }

    const batchPdfBuffers: Buffer[] = [];
    for (const batch of batches) {
        const html = await renderResultCardHtml(batch);
        const buffer = await generatePdfBuffer(html);
        batchPdfBuffers.push(buffer);
    }

    const pdfBuffer =
        batchPdfBuffers.length === 1 ? batchPdfBuffers[0] : await mergePdfBuffers(batchPdfBuffers);

    let cloudinaryUrl: string | undefined = undefined;
    try {
        const studentName = cards.length === 1 ? cards[0].student.fullName : undefined;
        cloudinaryUrl = await uploadResultCardToCloudinary(pdfBuffer, exam.name, studentName);
    } catch (error) {
        console.error('Cloudinary upload failed (result cards):', error);
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

const generateSingleResultCard = async (
    studentEnrollmentId: number,
    examId: number
): Promise<Buffer> => {
    const result = await generateResultCardsForEnrollments([studentEnrollmentId], examId);

    if (!result.pdfBuffer) {
        const reason = result.failed[0]?.reason ?? 'Unknown error';
        throw new ApiError(httpStatus.NOT_FOUND, `Failed to generate result card: ${reason}`);
    }

    return result.pdfBuffer;
};

export const ResultCardService = {
    getSectionEnrollmentIds,
    generateResultCardsForEnrollments,
    generateSingleResultCard,
    warmupBrowser,
};