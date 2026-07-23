export type IAdmitCardStudentData = {
    studentEnrollmentId: number;
    admissionNumber: string;
    fullName: string;
    rollNumber: number;
    photo: string | null;
    className: string;
    sectionName: string;
};

export type IAdmitCardExamData = {
    examId: number;
    examName: string;
    academicYearTitle: string;
    startDate: Date | null;
    endDate: Date | null;
};

export type IAdmitCardScheduleRow = {
    subjectName: string;
    examDate: Date;
    startTime: Date;
    endTime: Date;
    roomNumber: string | null;
};

export type IAdmitCardData = {
    exam: IAdmitCardExamData;
    student: IAdmitCardStudentData;
    schedule: IAdmitCardScheduleRow[];
};

export type IFailedAdmitCard = {
    studentEnrollmentId: number;
    rollNumber: number | null;
    studentName: string | null;
    reason: string;
};

export type IAdmitCardGenerationResult = {
    pdfBuffer: Buffer | null;
    cloudinaryUrl?: string;           // ← Added
    totalStudents: number;
    successCount: number;
    failed: IFailedAdmitCard[];
};

export type IAdmitCardJobData = {
    examId: number;
    classId: number;
    sectionId: number;
    /** If set, only regenerate/retry these specific enrollments instead of the whole section */
    onlyEnrollmentIds?: number[];
};

export type IAdmitCardJobResult = {
    fileUrl: string;
    totalStudents: number;
    successCount: number;
    failed: IFailedAdmitCard[];
};