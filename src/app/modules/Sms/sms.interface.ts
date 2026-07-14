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