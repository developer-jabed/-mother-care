export interface ISendResultSmsPayload {
    examId: number;
    force?: boolean;
}

export interface ISmsJobData {
    studentEnrollmentId: number;
    examId: number;
    phone: string;
    message: string;
}

export interface SmsResponse {
    success: boolean;
    message: string;
    queued?: number;
    skippedNoPhone?: number;
    skippedAlreadySent?: number;
    data?: any;
}