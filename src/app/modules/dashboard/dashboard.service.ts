import { prisma } from '../../shared/prisma.js';
import type {
    IAdminDashboardMeta,
    IChartDataPoint,
    IGenderDistribution,
    ISmsStats,
} from './dashboard.interface.js';

const getAdminDashboardMeta = async (): Promise<IAdminDashboardMeta> => {
    // Current academic year drives several scoped queries below, so fetch it first
    const currentAcademicYear = await prisma.academicYear.findFirst({
        where: { isCurrent: true },
    });

    // --- Summary card counts ---
    // NOTE: kept as individual awaits (not destructured Promise.all) — matches the
    // fix used earlier for the groupBy/TS destructuring issue in the dashboard module.
    const totalStudents = await prisma.student.count({ where: { isActive: true } });
    const totalUsers = await prisma.user.count({ where: { isDeleted: false } });
    const totalTeachers = await prisma.user.count({
        where: { role: 'TEACHER', isDeleted: false },
    });
    const totalAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isDeleted: false },
    });
    const totalClasses = await prisma.class.count();
    const totalSections = await prisma.section.count();
    const totalSubjects = await prisma.subject.count();
    const totalExams = await prisma.exam.count();
    const publishedExams = await prisma.exam.count({ where: { isPublished: true } });
    const totalResults = await prisma.result.count();
    const publishedResults = await prisma.result.count({ where: { isPublished: true } });

    // --- Enrollment by class (current academic year, active enrollments only) ---
    const enrollmentGroups = await prisma.studentEnrollment.groupBy({
        by: ['classId'],
        where: currentAcademicYear
            ? { academicYearId: currentAcademicYear.id, isCurrent: true }
            : { isCurrent: true },
        _count: { _all: true },
    });

    const classIds = enrollmentGroups.map((g) => g.classId);
    const classes = await prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true },
    });
    const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

    const enrollmentByClass: IChartDataPoint[] = enrollmentGroups.map((g) => ({
        label: classNameMap.get(g.classId) ?? `Class ${g.classId}`,
        value: g._count._all,
    }));

    // --- Grade distribution (published results only) ---
    const gradeGroups = await prisma.result.groupBy({
        by: ['grade'],
        where: { isPublished: true },
        _count: { _all: true },
    });

    const gradeDistribution: IChartDataPoint[] = gradeGroups
        .map((g) => ({ label: g.grade, value: g._count._all }))
        .sort((a, b) => b.value - a.value);

    // --- Gender distribution (active students) ---
    const maleCount = await prisma.student.count({ where: { gender: 'MALE', isActive: true } });
    const femaleCount = await prisma.student.count({ where: { gender: 'FEMALE', isActive: true } });
    const otherCount = await prisma.student.count({ where: { gender: 'OTHER', isActive: true } });

    const genderDistribution: IGenderDistribution = {
        male: maleCount,
        female: femaleCount,
        other: otherCount,
    };

    // --- SMS delivery stats ---
    const smsPending = await prisma.smsLog.count({ where: { status: 'PENDING' } });
    const smsSent = await prisma.smsLog.count({ where: { status: 'SENT' } });
    const smsFailed = await prisma.smsLog.count({ where: { status: 'FAILED' } });
    const smsDelivered = await prisma.smsLog.count({ where: { status: 'DELIVERED' } });

    const smsStats: ISmsStats = {
        pending: smsPending,
        sent: smsSent,
        failed: smsFailed,
        delivered: smsDelivered,
    };

    // --- Result publish status ---
    const unpublishedResults = totalResults - publishedResults;

    // --- User role distribution ---
    const roleGroups = await prisma.user.groupBy({
        by: ['role'],
        where: { isDeleted: false },
        _count: { _all: true },
    });

    const userRoleDistribution: IChartDataPoint[] = roleGroups.map((g) => ({
        label: g.role,
        value: g._count._all,
    }));

    return {
        summary: {
            totalStudents,
            totalUsers,
            totalTeachers,
            totalAdmins,
            totalClasses,
            totalSections,
            totalSubjects,
            totalExams,
            publishedExams,
            totalResults,
            publishedResults,
            currentAcademicYear: currentAcademicYear?.title ?? null,
        },
        enrollmentByClass,
        gradeDistribution,
        genderDistribution,
        smsStats,
        resultPublishStatus: {
            published: publishedResults,
            unpublished: unpublishedResults,
        },
        userRoleDistribution,
    };
};

export const dashboardService = {
    getAdminDashboardMeta,
};