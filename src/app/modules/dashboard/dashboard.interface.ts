export interface ISummaryCard {
    totalStudents: number;
    totalUsers: number;
    totalTeachers: number;
    totalAdmins: number;
    totalClasses: number;
    totalSections: number;
    totalSubjects: number;
    totalExams: number;
    publishedExams: number;
    totalResults: number;
    publishedResults: number;
    currentAcademicYear: string | null;
}

export interface IChartDataPoint {
    label: string;
    value: number;
}

export interface IGenderDistribution {
    male: number;
    female: number;
    other: number;
}

export interface ISmsStats {
    pending: number;
    sent: number;
    failed: number;
    delivered: number;
}

export interface IResultPublishStatus {
    published: number;
    unpublished: number;
}

export interface IAdminDashboardMeta {
    summary: ISummaryCard;
    enrollmentByClass: IChartDataPoint[];
    gradeDistribution: IChartDataPoint[];
    genderDistribution: IGenderDistribution;
    smsStats: ISmsStats;
    resultPublishStatus: IResultPublishStatus;
    userRoleDistribution: IChartDataPoint[];
}