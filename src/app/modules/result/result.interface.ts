export type IResultFilterRequest = {
    searchTerm?: string;
    studentEnrollmentId?: number;
    examId?: number;
    isPublished?: boolean;
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