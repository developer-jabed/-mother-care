import axios from 'axios';
import { prisma } from '../../shared/prisma.js';
const API_KEY = process.env.BULKSMSBD_API_KEY;
const SENDER_ID = process.env.BULKSMSBD_SENDER_ID;
const BASE_URL = process.env.BULKSMSBD_BASE_URL || 'http://bulksmsbd.net/api';
export const sendSmsViaBulkSmsBD = async (phone, message) => {
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
const getErrorMessage = (code, defaultMsg) => {
    const errors = {
        1001: "Invalid Number",
        1002: "Sender ID not correct or disabled",
        1003: "Missing required fields",
        1007: "Insufficient Balance",
        1013: "Sender ID not found",
        1031: "Account not verified",
        1032: "IP not whitelisted",
    };
    return errors[code] || defaultMsg || "SMS sending failed";
};
const isRetryableError = (code) => {
    const nonRetryable = ['1001', '1002', '1013', '1031', '1032'];
    return !nonRetryable.includes(String(code));
};
export const updateSmsLog = async (studentEnrollmentId, examId, status, providerResponse, errorMessage) => {
    const providerMessageId = providerResponse?.message_id ??
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
//# sourceMappingURL=sms.sender.js.map