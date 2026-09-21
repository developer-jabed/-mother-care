export type IResultFilterRequest = {
    searchTerm?: string;
    studentEnrollmentId?: number;
    examId?: number;
    classId?: number;
    sectionId?: number;
    isPublished?: boolean;
};

export type ISectionResultFilterRequest = {
    examId: number;
    classId: number;
    sectionId: number;
};

export type IResultDetailInput = {
    subjectId: number;
    writtenMarks?: number;
    mcqMarks?: number;
    practicalMarks?: number;
    vivaMarks?: number;
};

export type ICreateResultPayload = {
    studentEnrollmentId: number;
    examId: number;
    remarks?: string;
    details: IResultDetailInput[];
};

export type ICombinedRankingFilterRequest = {
    classId: number;
    sectionId: number;
    examIds?: number[];
};

/** Updated row – rank is driven by totalMarks first, then GPA */
export type ICombinedRankingRow = {
    studentEnrollmentId: number;
    rollNumber: number | null;
    name: string;
    examCount: number;

    // Primary rank key
    averageTotalMarks: number | null;

    // Secondary rank key
    averageGradePoint: number | null;

    // Kept for display / reports
    averagePercentage: number | null;

    rank: number | null;
};

export type ICombinedRankingResponse = {
    totalStudents: number;
    examCount: number;
    data: ICombinedRankingRow[];
};

export type IResultByRollFilterRequest = {
    classId: number;
    sectionId: number;
    rollNumber: number;
    examId?: number;
};

export type IStudentResultProfile = {
    fullName: string;
    admissionNumber: string;
    fatherName: string | null;
    motherName: string | null;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth: Date;
    phone: string | null;
    address: string | null;
    photo: string | null;
    rollNumber: number;
    className: string;
    sectionName: string;
};