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

export interface ISmsLogFilters {
    searchTerm?: string;
    examId?: number;
    studentEnrollmentId?: number;
    status?: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
    phone?: string;
}