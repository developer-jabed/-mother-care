import axios from 'axios';
import { prisma } from '../../shared/prisma.js';

const API_KEY = process.env.BULKSMSBD_API_KEY!;
const SENDER_ID = process.env.BULKSMSBD_SENDER_ID!;
const BASE_URL = process.env.BULKSMSBD_BASE_URL || 'http://bulksmsbd.net/api';

export const sendSmsViaBulkSmsBD = async (phone: string, message: string) => {
    const encodedMessage = encodeURIComponent(message);

    const response = await axios.get(`${BASE_URL}/smsapi`, {
        params: {
            api_key: API_KEY,
            type: 'text',
            number: phone,
            senderid: SENDER_ID,
            message: encodedMessage,
        },
        timeout: 15000,
    });

    const data = response.data;
    const code = data?.code || data?.status;

    if (code === 202 || data?.status?.toLowerCase() === 'success') {
        return { success: true, code: 202, providerResponse: data };
    }

    throw {
        success: false,
        code,
        message: getErrorMessage(code, data?.message),
        isRetryable: isRetryableError(code),
    };
};

const getErrorMessage = (code: any, defaultMsg?: string): string => {
    const errors: Record<string, string> = {
        202: "SMS সফলভাবে জমা হয়েছে",
        1001: "ভুল মোবাইল নম্বর",
        1002: "সেন্ডার আইডি সঠিক নয় অথবা নিষ্ক্রিয়",
        1003: "প্রয়োজনীয় তথ্য অনুপস্থিত, সিস্টেম অ্যাডমিনের সাথে যোগাযোগ করুন",
        1005: "অভ্যন্তরীণ ত্রুটি (Internal Error)",
        1006: "ব্যালেন্স মেয়াদ পাওয়া যায়নি",
        1007: "অপর্যাপ্ত ব্যালেন্স",
        1011: "ইউজার আইডি পাওয়া যায়নি",
        1012: "মাস্কিং SMS অবশ্যই বাংলায় পাঠাতে হবে",
        1013: "এই API কী দিয়ে সেন্ডার আইডির গেটওয়ে পাওয়া যায়নি",
        1014: "এই সেন্ডার আইডির জন্য Sender Type Name পাওয়া যায়নি",
        1015: "এই API কী দিয়ে সেন্ডার আইডির কোনো বৈধ গেটওয়ে পাওয়া যায়নি",
        1016: "এই সেন্ডার আইডির জন্য প্রাইস তথ্য সক্রিয় নেই",
        1017: "এই সেন্ডার আইডির জন্য প্রাইস তথ্য পাওয়া যায়নি",
        1018: "এই অ্যাকাউন্টের মালিকানা নিষ্ক্রিয় করা হয়েছে",
        1019: "এই অ্যাকাউন্টের Sender Type প্রাইস নিষ্ক্রিয়",
        1020: "এই অ্যাকাউন্টের প্যারেন্ট পাওয়া যায়নি",
        1021: "এই অ্যাকাউন্টের প্যারেন্ট সক্রিয় প্রাইস পাওয়া যায়নি",
        1031: "আপনার অ্যাকাউন্ট যাচাই করা হয়নি, অ্যাডমিনের সাথে যোগাযোগ করুন",
        1032: "IP হোয়াইটলিস্ট করা হয়নি",
    };
    return errors[code] || defaultMsg || "SMS পাঠাতে ব্যর্থ হয়েছে";
};

const isRetryableError = (code: any): boolean => {
    const nonRetryable = [
        '1001', '1002', '1011', '1013', '1014', '1015',
        '1016', '1017', '1018', '1019', '1020', '1021',
        '1031', '1032',
    ];
    return !nonRetryable.includes(String(code));
};

export const updateSmsLog = async (
    studentEnrollmentId: number,
    examId: number,
    status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED',
    providerResponse?: any,
    errorMessage?: string
) => {
    const providerMessageId =
        providerResponse?.message_id ??
        providerResponse?.messageId ??
        providerResponse?.SMSInfo?.[0]?.message_id ??
        undefined;

    const isSuccessStatus = status === 'SENT' || status === 'DELIVERED';

    await prisma.smsLog.upsert({
        where: { studentEnrollmentId_examId: { studentEnrollmentId, examId } },
        update: {
            status,
            providerMessageId: providerMessageId ? String(providerMessageId) : undefined,
            errorMessage,
            attemptCount: { increment: 1 },
            ...(isSuccessStatus && { sentAt: new Date() }),
        },
        create: {
            studentEnrollmentId,
            examId,
            phone: '',
            message: '',
            status,
            providerMessageId: providerMessageId ? String(providerMessageId) : undefined,
            errorMessage,
            ...(isSuccessStatus && { sentAt: new Date() }),
        },
    });
};