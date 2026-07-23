import puppeteer, { Browser } from 'puppeteer';
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

let browserInstance: Browser | null = null;

const getBrowser = async (): Promise<Browser> => {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    }
    return browserInstance;
};

// Logo cache
let logoBase64Cache: string | null = null;

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

const renderAdmitCardHtml = async (cards: IAdmitCardData[]): Promise<string> => {
    const { logo } = await getBrandAssets();

    const pages = await Promise.all(
        cards.map(async (card) => {
            const qrPayload = `${process.env.APP_URL}/api/v1/admit-cards/verify/${card.student.studentEnrollmentId}/${card.exam.examId}`;
            const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 130, margin: 1 });

            const scheduleRows = card.schedule
                .map(
                    (row) => `
                    <tr>
                        <td>${row.subjectName}</td>
                        <td>${new Date(row.examDate).toLocaleDateString('en-US')}</td>
                        <td>${new Date(row.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(row.endTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>${row.roomNumber ?? '—'}</td>
                    </tr>`
                )
                .join('');

            return `
            <div class="admit-card">
                <div class="bg-texture"></div>
                <div class="watermark">
                    <img src="${logo}" alt="Watermark" />
                </div>

                <div class="header">
                    <img class="logo" src="${logo}" alt="School Logo" />
                    <div class="header-text">
                        <div class="school-name">Mother Care School and College</div>
                        <div class="motto">Excellence in Education Since 2025</div>
                        <div class="title">ADMIT CARD</div>
                        <div class="exam-name">${card.exam.examName} • ${card.exam.academicYearTitle}</div>
                    </div>
                </div>

                <div class="body">
                    <div class="photo-box">
                        ${card.student.photo 
                            ? `<img src="${card.student.photo}" alt="Student Photo" />` 
                            : `<div class="no-photo">Photo</div>`}
                    </div>

                    <div class="student-info">
                        <div class="info-row"><strong>Name:</strong> <span>${card.student.fullName}</span></div>
                        <div class="info-row"><strong>Admission No:</strong> <span>${card.student.admissionNumber}</span></div>
                        <div class="info-row"><strong>Class:</strong> <span>${card.student.className} • ${card.student.sectionName}</span></div>
                        <div class="info-row"><strong>Roll No:</strong> <span>${card.student.rollNumber}</span></div>
                    </div>

                    <div class="qr-box">
                        <img src="${qrDataUrl}" alt="QR Code" />
                        <div class="qr-label">Scan to Verify</div>
                    </div>
                </div>

                ${card.schedule.length > 0
                    ? `
                    <table class="schedule">
                        <thead>
                            <tr>
                                <th>Subject</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Room No</th>
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
            @page { size: A4; margin: 8mm; }
            * { box-sizing: border-box; }
            body { 
                font-family: 'Noto Sans', 'Segoe UI', sans-serif; 
                margin: 0; 
                background: #f8f5f0;
            }

            .admit-card {
                position: relative;
                page-break-after: always;
                border: 3px solid #1a2a44;
                border-radius: 8px;
                padding: 28px 32px;
                background: #fdfaf3;
                min-height: 100%;
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
                opacity: 0.07;
                pointer-events: none;
            }
            .watermark img {
                width: 52%;
                filter: grayscale(1);
            }

            .header, .body, .schedule, .footer, .no-schedule {
                position: relative;
                z-index: 2;
            }

            .header {
                display: flex;
                align-items: center;
                gap: 20px;
                border-bottom: 3px double #8b6f47;
                padding-bottom: 18px;
                margin-bottom: 24px;
            }
            .logo {
                width: 78px;
                height: 78px;
                object-fit: contain;
                border: 3px solid #8b6f47;
                border-radius: 50%;
                padding: 4px;
                background: white;
            }
            .header-text { flex: 1; }
            .school-name {
                font-size: 26px;
                font-weight: 800;
                color: #1a2a44;
                letter-spacing: 0.5px;
            }
            .motto {
                font-size: 13px;
                color: #8b6f47;
                font-style: italic;
                margin: 4px 0 8px;
            }
            .title {
                font-size: 19px;
                font-weight: 700;
                color: #1a2a44;
            }
            .exam-name {
                font-size: 14.5px;
                color: #555;
                margin-top: 4px;
            }

            .body {
                display: flex;
                gap: 28px;
                margin-bottom: 26px;
                align-items: flex-start;
            }
            .photo-box {
                width: 128px;
                height: 155px;
                border: 4px solid #1a2a44;
                border-radius: 6px;
                overflow: hidden;
                background: #fff;
                flex-shrink: 0;
                box-shadow: 0 6px 12px rgba(0,0,0,0.2);
            }
            .photo-box img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .no-photo {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #aaa;
                font-size: 14px;
            }

            .student-info {
                flex: 1;
                font-size: 15.5px;
                line-height: 2.1;
            }
            .info-row {
                margin-bottom: 6px;
            }
            .info-row span {
                font-weight: 600;
                color: #1a2a44;
            }

            .qr-box {
                text-align: center;
                flex-shrink: 0;
            }
            .qr-box img {
                width: 108px;
                height: 108px;
                border: 3px solid #1a2a44;
                padding: 6px;
                background: white;
            }
            .qr-label {
                margin-top: 8px;
                font-size: 10px;
                color: #555;
                font-weight: 500;
            }

            table.schedule {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0 28px;
                background: white;
                font-size: 13.8px;
            }
            table.schedule th {
                background: #1a2a44;
                color: white;
                padding: 10px 12px;
                text-align: left;
                font-weight: 600;
            }
            table.schedule td {
                padding: 10px 12px;
                border: 1px solid #ddd;
            }
            table.schedule tr:nth-child(even) {
                background: #f9f6f0;
            }

            .no-schedule {
                text-align: center;
                font-size: 15px;
                color: #666;
                padding: 20px;
                border: 2px dashed #ccc;
                border-radius: 6px;
            }

            .footer {
                display: flex;
                justify-content: space-between;
                margin-top: 40px;
                font-size: 14px;
            }
            .signature-box {
                text-align: center;
                width: 42%;
            }
            .signature-line {
                height: 1px;
                background: #333;
                margin-bottom: 8px;
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
        await page.setContent(html, { waitUntil: 'load' });
        const pdfBuffer = await page.pdf({ format: 'a4', printBackground: true });
        return Buffer.from(pdfBuffer);
    } finally {
        await page.close();
    }
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
 * Core generation function
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

    const cards: IAdmitCardData[] = enrollments.map((enrollment) => {
        const student: IAdmitCardStudentData = {
            studentEnrollmentId: enrollment.id,
            admissionNumber: enrollment.student.admissionNumber,
            fullName: enrollment.student.fullName,
            rollNumber: enrollment.rollNumber,
            photo: enrollment.student.photo,
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

    const html = await renderAdmitCardHtml(cards);
    const pdfBuffer = await generatePdfBuffer(html);

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
): Promise<{ pdfBuffer: Buffer; cloudinaryUrl: string }> => {
    const result = await generateAdmitCardsForEnrollments([studentEnrollmentId], examId);
    
    if (!result.pdfBuffer) {
        const reason = result.failed[0]?.reason ?? 'Unknown error';
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to generate admit card: ${reason}`);
    }
    if (!result.cloudinaryUrl) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload admit card to Cloudinary');
    }

    return { pdfBuffer: result.pdfBuffer, cloudinaryUrl: result.cloudinaryUrl };
};

export const AdmitCardService = {
    getSectionEnrollmentIds,
    generateAdmitCardsForEnrollments,
    generateSingleAdmitCard,
};