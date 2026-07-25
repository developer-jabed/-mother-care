export interface IResultCardSubjectRow {
    subjectCode: string;
    subjectName: string;
    fullMarks: number;
    passMarks: number;
    writtenMarks: number | null;
    mcqMarks: number | null;
    practicalMarks: number | null;
    vivaMarks: number | null;
    totalMarks: number;
    grade: string;
    gradePoint: number;
}

export interface IResultCardExamData {
    examId: number;
    examName: string;
    academicYearTitle: string;
}

export interface IResultCardStudentData {
    studentEnrollmentId: number;
    admissionNumber: string;
    fullName: string;
    fatherName: string | null;
    motherName: string | null;
    dateOfBirth: Date;
    gender: string;
    className: string;
    sectionName: string;
    rollNumber: number;
    photo: string | null; // base64 data URI, or null
}

export interface IResultCardSummary {
    totalMarks: number;
    percentage: number;
    grade: string;
    gradePoint: number;
    position: number | null;
    remarks: string | null;
}

export interface IResultCardData {
    exam: IResultCardExamData;
    student: IResultCardStudentData;
    summary: IResultCardSummary;
    subjects: IResultCardSubjectRow[];
}

export interface IResultCardJobData {
    examId: number;
    classId: number;
    sectionId: number;
    onlyEnrollmentIds?: number[]; // when set, generate only for these ids within the section
}

export interface IResultCardJobResult {
    fileUrl: string;
    totalStudents: number;
    successCount: number;
    failed: IFailedResultCard[];
}

export interface IFailedResultCard {
    studentEnrollmentId: number;
    rollNumber: number | null;
    studentName: string | null;
    reason: string;
}

export interface IResultCardGenerationResult {
    pdfBuffer: Buffer | null;
    cloudinaryUrl?: string;
    totalStudents: number;
    successCount: number;
    failed: IFailedResultCard[];
}