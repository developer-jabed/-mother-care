import chromium from '@sparticuz/chromium';
import puppeteerCore, { type Browser } from 'puppeteer-core';
import httpStatus from 'http-status';
import { Redis as IORedis } from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';

const isLocalDev = process.env.NODE_ENV !== 'production';
const CACHE_TTL_SECONDS = 900; // 15 min
let browserInstance: Browser | null = null;
let pagesGenerated = 0;
const RESTART_BROWSER_AFTER = 10;

// ── Redis cache (optional, falls back to direct generation) ──────────
const redisUrl = process.env.BULLMQ_REDIS_URL;
let cacheClient: IORedis | null = null;
if (redisUrl) {
  try {
    cacheClient = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    cacheClient.on('error', (err) =>
      console.error('🔴 Fee receipt cache Redis error:', err.message)
    );
  } catch (err) {
    console.error('🔴 Failed to init fee receipt cache Redis:', err);
    cacheClient = null;
  }
} else {
  console.warn('⚠️ BULLMQ_REDIS_URL not set — fee receipt caching disabled');
}

const getBrowser = async (): Promise<Browser> => {
  if (pagesGenerated >= RESTART_BROWSER_AFTER) {
    console.log(`[fee-receipt] Restarting browser after ${pagesGenerated} pages`);
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {}
      browserInstance = null;
    }
    pagesGenerated = 0;
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
      '--js-flags=--max-old-space-size=384',
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
      .resize(140, 140, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 80, compressionLevel: 9 })
      .toBuffer();
    const markBuf = await sharp(raw)
      .resize(70, 70, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 50, compressionLevel: 9 })
      .toBuffer();
    logoHeaderCache = `data:image/png;base64,${headerBuf.toString('base64')}`;
    logoMarkCache = `data:image/png;base64,${markBuf.toString('base64')}`;
  } catch {
    console.warn('[fee-receipt] sharp not available — using original logo');
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
        .resize(170, 65, { fit: 'inside', withoutEnlargement: true })
        .png({ quality: 80 })
        .toBuffer();
      principalSignatureCache = `data:image/png;base64,${resized.toString('base64')}`;
    } catch {
      principalSignatureCache = `data:image/png;base64,${raw.toString('base64')}`;
    }
  } catch {
    console.warn('[fee-receipt] Principal signature not found');
    principalSignatureCache = '';
  }
  return principalSignatureCache;
};

// ── Main entry point ──────────────────────────────────────────────
export const generateFeeReceiptPDF = async (paymentId: number): Promise<Buffer> => {
  const cacheKey = `fee-receipt:${paymentId}`;

  // Try cache first (stores base64 PDF)
  if (cacheClient) {
    try {
      const cached = await cacheClient.get(cacheKey);
      if (cached) {
        console.log(`[fee-receipt] cache hit for payment ${paymentId}`);
        return Buffer.from(cached, 'base64');
      }
    } catch (err) {
      console.error('[fee-receipt] cache read failed, generating fresh:', err);
    }
  }

  const payment = await prisma.feePayment.findUnique({
    where: { id: paymentId },
    include: {
      studentFee: {
        include: {
          feeType: true,
          enrollment: {
            include: {
              student: true,
              class: true,
              section: true,
              academicYear: true,
            },
          },
        },
      },
      receivedBy: {
        select: { fullName: true },
      },
    },
  });

  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }

  const { studentFee } = payment;
  const { enrollment, feeType } = studentFee;
  const student = enrollment.student;

  const monthText =
    studentFee.month && studentFee.year
      ? ` (${String(studentFee.month).padStart(2, '0')}/${studentFee.year})`
      : '';
  const remaining = (studentFee.payableAmount - studentFee.paidAmount).toFixed(2);
  const previousPaid = (studentFee.paidAmount - payment.amount).toFixed(2);

  // Load assets
  const { header: logo, mark: logoMark } = await loadAndResizeLogo();
  const principalSig = await loadPrincipalSignature();

  const isFullyPaid = studentFee.status === 'PAID';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 210mm;
      height: 297mm;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1a2a44;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      background: linear-gradient(160deg, #0f1c33 0%, #1a2a44 100%);
      padding: 10mm;
      position: relative;
    }

    .page {
      position: relative;
      width: 100%;
      height: 100%;
      background: #fdfaf3;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.35);
    }

    /* Decorative top ribbon */
    .top-ribbon {
      height: 14px;
      width: 100%;
      background: repeating-linear-gradient(
        135deg,
        #c9a15a 0px, #c9a15a 14px,
        #1a2a44 14px, #1a2a44 28px
      );
    }
    .bottom-ribbon {
      height: 14px;
      width: 100%;
      background: repeating-linear-gradient(
        135deg,
        #1a2a44 0px, #1a2a44 14px,
        #c9a15a 14px, #c9a15a 28px
      );
      position: absolute;
      bottom: 0;
      left: 0;
    }

    /* Watermark */
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
    .watermark img {
      width: 55%;
      filter: grayscale(1);
    }

    .content {
      position: relative;
      z-index: 2;
      padding: 34px 44px 20px;
      display: flex;
      flex-direction: column;
      height: calc(100% - 28px);
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 22px;
      padding-bottom: 22px;
      margin-bottom: 22px;
      border-bottom: 3px double #c9a15a;
    }
    .logo-wrap {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #fff, #f1e6cf);
      border: 3px solid #c9a15a;
      box-shadow: 0 4px 10px rgba(201,161,90,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .logo-wrap img {
      width: 74px;
      height: 74px;
      object-fit: contain;
    }
    .header-text { flex: 1; }
    .school-name {
      font-size: 26px;
      font-weight: 800;
      color: #1a2a44;
      letter-spacing: 0.4px;
    }
    .motto {
      font-size: 12.5px;
      color: #a3773a;
      font-style: italic;
      margin: 4px 0 10px;
      letter-spacing: 0.2px;
    }
    .title-badge {
      display: inline-block;
      background: linear-gradient(135deg, #1a2a44 0%, #2c3e5a 100%);
      color: #f6e9c9;
      padding: 7px 18px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      box-shadow: 0 3px 8px rgba(26, 42, 68, 0.3);
      border: 1px solid #c9a15a;
    }
    .header-right {
      text-align: right;
      flex-shrink: 0;
    }
    .receipt-no {
      font-size: 13px;
      color: #1a2a44;
      font-weight: 700;
    }
    .receipt-date {
      font-size: 11.5px;
      color: #7a6a4f;
      margin-top: 4px;
    }
    .status-pill {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 800;
      letter-spacing: 0.6px;
    }
    .status-pill.PAID { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .status-pill.PARTIAL { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .status-pill.PENDING { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
    .status-pill.OVERDUE { background: #fecaca; color: #7f1d1d; border: 1px solid #f87171; }

    /* Section title */
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #1a2a44;
      margin: 6px 0 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section-title::before {
      content: '';
      width: 6px;
      height: 18px;
      border-radius: 3px;
      background: linear-gradient(180deg, #c9a15a, #1a2a44);
    }
    .section-title::after {
      content: '';
      flex: 1;
      height: 1.5px;
      background: linear-gradient(to right, #e2d3ab, transparent);
    }

    /* Info grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 28px;
      background: #f7f1e2;
      border: 1px solid #e8dcc4;
      border-radius: 12px;
      padding: 18px 22px;
      margin-bottom: 24px;
    }
    .info-item .label {
      font-size: 10.5px;
      color: #8b6f47;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .info-item .value {
      font-size: 14.5px;
      font-weight: 700;
      color: #1a2a44;
    }

    /* Amount table */
    .amount-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #eee2cc;
      box-shadow: 0 2px 10px rgba(26,42,68,0.05);
    }
    .amount-table td {
      padding: 13px 18px;
      font-size: 14px;
      border-bottom: 1px solid #f0e6d2;
    }
    .amount-table tr:last-child td { border-bottom: none; }
    .amount-table tr:nth-child(even) td { background: #faf7ef; }
    .amount-table .label {
      color: #8b6f47;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      width: 45%;
    }
    .amount-table .value {
      font-weight: 700;
      color: #1a2a44;
      text-align: right;
    }
    .paid-now {
      background: linear-gradient(90deg, #e8f5e9, #d9f2dd) !important;
    }
    .paid-now .value {
      color: #065f46;
      font-size: 18px;
      font-weight: 800;
    }
    .total-row .value {
      font-size: 16px;
      color: #1a2a44;
    }
    .remaining-row .value {
      color: #a8391e;
      font-weight: 800;
    }

    /* Paid stamp */
    .stamp {
      position: absolute;
      top: 210px;
      right: 60px;
      width: 130px;
      height: 130px;
      border: 5px solid #10b981;
      border-radius: 50%;
      color: #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 2px;
      transform: rotate(-18deg);
      opacity: 0.85;
      z-index: 3;
      text-transform: uppercase;
    }

    .spacer { flex: 1; }

    /* Footer / Signature */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-top: 22px;
      margin-top: 10px;
      border-top: 1px dashed #d8c9a3;
    }
    .footer-note {
      font-size: 10.5px;
      color: #8a8272;
      max-width: 300px;
      line-height: 1.5;
    }
    .footer-note strong { color: #a3773a; }
    .signature-box {
      text-align: center;
      width: 220px;
    }
    .principal-signature {
      height: 56px;
      width: auto;
      max-width: 180px;
      object-fit: contain;
      margin: 0 auto 8px;
      display: block;
    }
    .signature-line {
      height: 1px;
      background: #333;
      width: 85%;
      margin: 42px auto 8px;
    }
    .signature-label {
      font-size: 13px;
      font-weight: 700;
      color: #1a2a44;
    }
    .signature-sub {
      font-size: 10.5px;
      color: #8a8272;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-ribbon"></div>
    <div class="watermark">
      <img src="${logoMark}" alt="" />
    </div>

    <div class="content">
      <!-- Header -->
      <div class="header">
        <div class="logo-wrap">
          <img src="${logo}" alt="School Logo" />
        </div>
        <div class="header-text">
          <div class="school-name">Mother Care School and College</div>
          <div class="motto">Excellence in Education Since 2025</div>
          <div class="title-badge">FEE PAYMENT RECEIPT</div>
        </div>
        <div class="header-right">
          <div class="receipt-no">Receipt No: FEE-${payment.id.toString().padStart(6, '0')}</div>
          <div class="receipt-date">${payment.paidAt.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}</div>
          <div class="status-pill ${studentFee.status}">${studentFee.status}</div>
        </div>
      </div>

      <!-- Student Information -->
      <div class="section-title">Student Information</div>
      <div class="info-grid">
        <div class="info-item">
          <div class="label">Name</div>
          <div class="value">${student.fullName}</div>
        </div>
        <div class="info-item">
          <div class="label">Admission No</div>
          <div class="value">${student.admissionNumber}</div>
        </div>
        <div class="info-item">
          <div class="label">Class &amp; Section</div>
          <div class="value">${enrollment.class.name} • ${enrollment.section.name}</div>
        </div>
        <div class="info-item">
          <div class="label">Roll No</div>
          <div class="value">${enrollment.rollNumber}</div>
        </div>
        <div class="info-item">
          <div class="label">Session</div>
          <div class="value">${enrollment.academicYear.title}</div>
        </div>
    
      </div>

      <!-- Payment Details -->
      <div class="section-title">Payment Details</div>
      <table class="amount-table">
        <tr>
          <td class="label">Fee Type</td>
          <td class="value">${feeType.displayName}${monthText}</td>
        </tr>
        <tr>
          <td class="label">Payable Amount</td>
          <td class="value">${studentFee.payableAmount.toFixed(2)} Tk</td>
        </tr>
     
        <tr class="paid-now">
          <td class="label">Paid Now</td>
          <td class="value">${payment.amount.toFixed(2)} Tk</td>
        </tr>
        <tr class="total-row">
          <td class="label">Total Paid</td>
          <td class="value">${studentFee.paidAmount.toFixed(2)} Tk</td>
        </tr>
        <tr class="remaining-row">
          <td class="label">Remaining Due</td>
          <td class="value">${remaining} Tk</td>
        </tr>
        ${
          payment.remarks
            ? `<tr>
                <td class="label">Remarks</td>
                <td class="value">${payment.remarks}</td>
              </tr>`
            : ''
        }
      </table>

      <div class="spacer"></div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-note">
          This is a <strong>computer-generated receipt</strong> issued by Mother Care School
          and College. No physical signature is required for its validity. Please retain
          this receipt for future reference.
        </div>
        <div class="signature-box">
          ${
            principalSig
              ? `<img src="${principalSig}" class="principal-signature" alt="Principal Signature" />`
              : `<div class="signature-line"></div>`
          }
          <div class="signature-label">Principal's Signature</div>
          <div class="signature-sub">Mother Care School and College</div>
        </div>
      </div>
    </div>

    ${isFullyPaid ? `<div class="stamp">PAID</div>` : ''}
    <div class="bottom-ribbon"></div>
  </div>
</body>
</html>
  `;

  const browser = await getBrowser();
  const page = await browser.newPage();
  let pdfBuffer: Buffer;

  try {
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const rawBuffer = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      timeout: 30_000,
    });
    pagesGenerated += 1;
    pdfBuffer = Buffer.from(rawBuffer);
  } finally {
    await page.close().catch(() => {});
  }

  // ── Cache in Redis ─────────────────────────────────────────────────
  if (cacheClient) {
    try {
      await cacheClient.set(
        cacheKey,
        pdfBuffer.toString('base64'),
        'EX',
        CACHE_TTL_SECONDS
      );
    } catch (err) {
      console.error('[fee-receipt] cache write failed:', err);
    }
  }

  return pdfBuffer;
};