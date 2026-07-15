import crypto from 'crypto';

const SECRET = process.env.RESULT_TOKEN_SECRET!;

export const generateResultToken = (studentEnrollmentId: number, examId: number): string => {
    const payload = `${studentEnrollmentId}:${examId}`;
    return crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
};

export const verifyResultToken = (
    studentEnrollmentId: number,
    examId: number,
    token: string
): boolean => {
    const expected = generateResultToken(studentEnrollmentId, examId);
    // timing-safe comparison
    return (
        expected.length === token.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
    );
};