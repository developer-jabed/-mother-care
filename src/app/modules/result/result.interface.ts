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

export type ICombinedRankingRow = {
    studentEnrollmentId: number;
    rollNumber: number | null; // fixed: was `string | null`
    name: string;
    examCount: number;
    averagePercentage: number | null;
    rank: number | null;
};

export type ICombinedRankingResponse = {
    totalStudents: number;
    examCount: number;
    data: ICombinedRankingRow[];
};