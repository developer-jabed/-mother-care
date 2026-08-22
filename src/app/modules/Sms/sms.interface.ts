export interface ISendResultSmsPayload {
  examId: number;
  force?: boolean;
}

// Result + Fee দুটোই সাপোর্ট করবে
export interface ISmsJobData {
  studentEnrollmentId: number;
  examId?: number;          // Fee SMS এ optional
  studentFeeId?: number;    // Fee SMS এর জন্য
  smsLogId?: number;        // Fee SMS log id
  type?: 'RESULT' | 'FEE_PAYMENT' | 'FEE_DUE';
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
  studentFeeId?: number;    // ← নতুন
  type?: string;            // ← নতুন (RESULT | FEE_PAYMENT | FEE_DUE)
  status?: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  phone?: string;
}