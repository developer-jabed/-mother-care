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

const BATCH_SIZE = 10;
const isLocalDev = process.env.NODE_ENV !== 'production';

// ── Shared browser ───────────────────────────────────────────────────
let browserInstance: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
    if (!browserInstance || !browserInstance.connected) {
        if (isLocalDev) {
            const puppeteer = await import('puppeteer');
            browserInstance = (await puppeteer.default.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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

// ── Logo: load once, resize small ────────────────────────────────────
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
            .resize(160, 160, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 80, compressionLevel: 9 })
            .toBuffer();

        const markBuf = await sharp(raw)
            .resize(80, 80, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 60, compressionLevel: 9 })
            .toBuffer();

        logoHeaderCache = `data:image/png;base64,${headerBuf.toString('base64')}`;
        logoMarkCache = `data:image/png;base64,${markBuf.toString('base64')}`;
    } catch {
        console.warn(
            '[result-cards] sharp not available — using original logo (pnpm add sharp for smaller/faster PDFs)'
        );
        const b64 = `data:image/png;base64,${raw.toString('base64')}`;
        logoHeaderCache = b64;
        logoMarkCache = b64;
    }

    return { header: logoHeaderCache!, mark: logoMarkCache! };
};

// ── HTML ─────────────────────────────────────────────────────────────
const gradeBadgeClass = (grade: string): string => {
    if (grade.startsWith('A')) return 'badge-green';
    if (grade === 'F' || grade.toUpperCase() === 'FAIL') return 'badge-red';
    return 'badge-blue';
};

const renderResultCardHtml = async (cards: IResultCardData[]): Promise<string> => {
    const { header: logo, mark: logoMark } = await loadAndResizeLogo();

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
                <div class="corner-ornament corner-tl"></div>
                <div class="corner-ornament corner-tr"></div>
                <div class="corner-ornament corner-bl"></div>
                <div class="corner-ornament corner-br"></div>
                <div class="watermark"><img src="${logoMark}" alt="" /></div>

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

                <div class="section-title"><span class="section-icon">◆</span> Student Information Summary</div>
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
                            day: '2-digit', month: '2-digit', year: 'numeric',
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

                <div class="section-title"><span class="section-icon">◆</span> Subject-wise Grade / Marks</div>
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

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
@page { size: A4; margin: 8mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #fff;
    color: #1a2332;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.result-card {
    position: relative;
    page-break-after: always;
    page-break-inside: avoid;
    overflow: hidden;
    border-radius: 6px;
    border: 1.5px solid #c5cddc;
    background: linear-gradient(165deg, #fdfbf7 0%, #f7f3eb 100%);
    padding-bottom: 6px;
}
.result-card:last-child { page-break-after: auto; }
.corner-ornament {
    position: absolute; z-index: 3;
    width: 22px; height: 22px;
    border-color: #b08d57; border-style: solid; opacity: 0.45;
}
.corner-tl { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
.corner-tr { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
.corner-bl { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
.corner-br { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; }
.watermark {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    z-index: 1; opacity: 0.035; pointer-events: none;
}
.watermark img { width: 38%; }
.school-header, .result-banner, .section-title,
.info-table, .subject-table, .card-footer { position: relative; z-index: 2; }

.school-header {
    background: linear-gradient(135deg, #0f1f4b 0%, #1e3a8a 55%, #1e40af 100%);
    color: #fff;
}
.header-accent-bar {
    height: 3px;
    background: linear-gradient(90deg, #b08d57, #e8d5a3, #b08d57);
}
.header-content {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 20px 11px;
}
.logo-wrap {
    width: 48px; height: 48px; border-radius: 50%;
    background: rgba(255,255,255,0.12);
    border: 2px solid rgba(176,141,87,0.55);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.school-logo { width: 36px; height: 36px; object-fit: contain; }
.school-name { font-size: 17px; font-weight: 800; letter-spacing: 0.3px; }
.school-tagline { font-size: 9.5px; opacity: 0.85; margin-top: 2px; letter-spacing: 0.4px; }
.school-meta {
    margin-top: 5px; display: flex; align-items: center;
    gap: 6px; font-size: 10px; opacity: 0.9;
}
.est-badge {
    background: linear-gradient(135deg, #b08d57, #8f7040);
    color: #fff; font-weight: 700; font-size: 9px;
    letter-spacing: 0.06em; padding: 2px 8px; border-radius: 999px;
    text-transform: uppercase;
}
.meta-sep { opacity: 0.5; }
.header-bottom-rule {
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(176,141,87,0.8) 30%, rgba(232,213,163,0.95) 50%, rgba(176,141,87,0.8) 70%, transparent);
}

.result-banner {
    background: #eef1fb;
    border-bottom: 1px solid #d4dced;
    padding: 7px 16px;
    text-align: center;
}
.banner-label {
    display: block; font-size: 9px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase; color: #5b6b8c;
}
.banner-exam { font-size: 12.5px; font-weight: 800; color: #1e3a8a; letter-spacing: 0.03em; }

.section-title {
    background: #1e3a8a; color: #fff;
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; padding: 5px 12px;
    margin: 10px 14px 0; border-radius: 3px 3px 0 0;
    display: flex; align-items: center; gap: 6px;
}
.section-icon { color: #e8d5a3; font-size: 7px; }

table.info-table {
    width: calc(100% - 28px); margin: 0 14px;
    border-collapse: collapse; font-size: 11px;
    background: #fff; border: 1px solid #e0e6f0; border-top: none;
}
table.info-table td { border: 1px solid #e3e8f2; padding: 5px 9px; vertical-align: middle; }
table.info-table .label {
    background: #f4f7fc; color: #5b6b8c; font-weight: 700;
    width: 100px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.03em;
}
table.info-table .value { font-weight: 600; color: #1a2a44; }
table.info-table .value.roll { color: #1e3a8a; font-size: 13px; font-weight: 800; }
table.info-table .value.name { font-size: 12.5px; font-weight: 700; color: #0f1f4b; }
table.info-table .result-value { color: #157347; font-size: 12px; }
table.info-table .result-value strong { font-size: 13.5px; }
.grade-inline { font-weight: 600; margin-left: 2px; color: #0f5132; }
table.info-table .pct { font-weight: 700; color: #1e3a8a; }
.position-pill {
    display: inline-block; background: #1e3a8a; color: #fff;
    font-weight: 700; font-size: 10.5px; padding: 2px 10px; border-radius: 999px;
}

table.subject-table {
    width: calc(100% - 28px); margin: 0 14px 4px;
    border-collapse: collapse; font-size: 11px;
    background: #fff; border: 1px solid #e0e6f0; border-top: none;
}
table.subject-table th {
    background: #1e3a8a; color: #fff; text-align: left;
    padding: 5px 9px; font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 0.04em; font-weight: 700;
}
table.subject-table td { border-bottom: 1px solid #e8edf5; padding: 4px 9px; }
table.subject-table tr:nth-child(even) td { background: #f7f9fd; }
table.subject-table tr:last-child td { border-bottom: none; }
table.subject-table .sl { width: 26px; text-align: center; color: #7a8699; font-weight: 600; }
table.subject-table .code { color: #5b6b8c; font-family: ui-monospace, monospace; font-size: 10.5px; }
table.subject-table .subj { font-weight: 650; color: #1a2a44; }
table.subject-table .marks { font-weight: 700; }
.marks-sep { color: #9aa5b8; font-weight: 500; margin: 0 1px; }

.badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-weight: 800; font-size: 10.5px; min-width: 30px; text-align: center;
}
.badge-green { background: #d8f5e4; color: #0f5132; }
.badge-blue { background: #dbe6fb; color: #1e3a8a; }
.badge-red { background: #fce0de; color: #9b1c1c; }

.card-footer {
    margin-top: 2px;
    padding: 8px 22px 12px;
    border-top: 1px dashed #d4d0c4;
}
.footer-note {
    text-align: center; font-size: 9px; color: #6b7280;
    line-height: 1.45; margin-bottom: 10px;
}
.footer-note strong { color: #1e3a8a; }
.signatures { display: flex; justify-content: space-between; padding: 0 6px; }
.signature-box { text-align: center; width: 38%; }
.signature-line {
    height: 1px; background: #4a5568;
    margin: 0 auto 5px; width: 85%; opacity: 0.65;
}
.sig-title { font-size: 10px; font-weight: 600; color: #374151; }
</style>
</head>
<body>${pages}</body>
</html>`;
};

const generatePdfBuffer = async (html: string): Promise<Buffer> => {
    const t0 = Date.now();
    const browser = await getBrowser();
    console.log(`[pdf] browser ready in ${Date.now() - t0}ms`);

    const page = await browser.newPage();
    try {
        const t1 = Date.now();
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        console.log(`[pdf] setContent ${Date.now() - t1}ms (html ~${(html.length / 1024).toFixed(0)} KB)`);

        const t2 = Date.now();
        const pdfBuffer = await page.pdf({
            format: 'a4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
        });
        console.log(`[pdf] page.pdf ${Date.now() - t2}ms → ${(pdfBuffer.byteLength / 1024).toFixed(0)} KB`);

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
    return Buffer.from(await mergedPdf.save());
};

const generateResultCardsForEnrollments = async (
    enrollmentIds: number[],
    examId: number
): Promise<IResultCardGenerationResult> => {
    const tTotal = Date.now();
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
                include: { details: { include: { subject: true } } },
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
        if (!enrollment.results?.length) {
            failed.push({
                studentEnrollmentId: id,
                rollNumber: enrollment.rollNumber,
                studentName: enrollment.student.fullName,
                reason: 'Result not found for this exam',
            });
        }
    }

    const eligibleEnrollments = enrollments.filter((e) => e.results?.length > 0);

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

    const cards: IResultCardData[] = eligibleEnrollments.map((enrollment) => {
        const result = enrollment.results[0];

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
            photo: null,
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

    const batches: IResultCardData[][] = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        batches.push(cards.slice(i, i + BATCH_SIZE));
    }

    const batchPdfBuffers: Buffer[] = [];
    for (const [i, batch] of batches.entries()) {
        const tBatch = Date.now();
        const html = await renderResultCardHtml(batch);
        const buffer = await generatePdfBuffer(html);
        console.log(`[batch ${i + 1}/${batches.length}] ${Date.now() - tBatch}ms (${batch.length} cards)`);
        batchPdfBuffers.push(buffer);
    }

    const pdfBuffer =
        batchPdfBuffers.length === 1
            ? batchPdfBuffers[0]
            : await mergePdfBuffers(batchPdfBuffers);

    console.log(
        `[result-cards] DONE ${Date.now() - tTotal}ms — ${cards.length}/${enrollmentIds.length} ok, pdf ${(pdfBuffer.byteLength / 1024).toFixed(0)} KB`
    );

    return {
        pdfBuffer,
        cloudinaryUrl: undefined,
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