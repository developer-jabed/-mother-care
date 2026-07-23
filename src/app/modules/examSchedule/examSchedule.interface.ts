export interface ICreateExamSchedule {
    examId: number;
    subjectId: number;
    classId: number;
    sectionId?: number | null;
    examDate: Date | string;
    startTime: Date | string;
    endTime: Date | string;
    roomNumber?: string | null;
}

export interface IUpdateExamSchedule {
    examId?: number;
    subjectId?: number;
    classId?: number;
    sectionId?: number | null;
    examDate?: Date | string;
    startTime?: Date | string;
    endTime?: Date | string;
    roomNumber?: string | null;
}

export interface IExamScheduleFilters {
    examId?: number;
    classId?: number;
    sectionId?: number;
    subjectId?: number;
}