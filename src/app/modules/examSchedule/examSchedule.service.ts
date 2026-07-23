import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type {
    ICreateExamSchedule,
    IUpdateExamSchedule,
    IExamScheduleFilters,
} from './examSchedule.interface.js';

const create = async (payload: ICreateExamSchedule) => {
    // exam, subject, class সব আছে কিনা ভ্যালিডেট
    const [exam, subject, cls] = await Promise.all([
        prisma.exam.findUnique({ where: { id: payload.examId } }),
        prisma.subject.findUnique({ where: { id: payload.subjectId } }),
        prisma.class.findUnique({ where: { id: payload.classId } }),
    ]);

    if (!exam) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
    if (!subject) throw new ApiError(httpStatus.NOT_FOUND, 'Subject not found');
    if (!cls) throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');

    if (payload.sectionId) {
        const section = await prisma.section.findUnique({ where: { id: payload.sectionId } });
        if (!section) throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
    }

    // duplicate চেক — schema-এর @@unique([examId, subjectId, classId]) অনুযায়ী
    const existing = await prisma.examSchedule.findUnique({
        where: {
            examId_subjectId_classId: {
                examId: payload.examId,
                subjectId: payload.subjectId,
                classId: payload.classId,
            },
        },
    });

    if (existing) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'A schedule for this exam, subject, and class already exists'
        );
    }

    return prisma.examSchedule.create({
        data: {
            examId: payload.examId,
            subjectId: payload.subjectId,
            classId: payload.classId,
            sectionId: payload.sectionId ?? null,
            examDate: new Date(payload.examDate),
            startTime: new Date(payload.startTime),
            endTime: new Date(payload.endTime),
            roomNumber: payload.roomNumber ?? null,
        },
        include: { exam: true, subject: true, class: true },
    });
};

const getMany = async (filters: IExamScheduleFilters) => {
    const where: Record<string, unknown> = {};

    if (filters.examId) where.examId = filters.examId;
    if (filters.classId) where.classId = filters.classId;
    if (filters.sectionId) where.sectionId = filters.sectionId;
    if (filters.subjectId) where.subjectId = filters.subjectId;

    return prisma.examSchedule.findMany({
        where,
        include: { exam: true, subject: true, class: true },
        orderBy: { examDate: 'asc' },
    });
};

const getSingle = async (id: number) => {
    const schedule = await prisma.examSchedule.findUnique({
        where: { id },
        include: { exam: true, subject: true, class: true },
    });

    if (!schedule) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam schedule not found');
    }

    return schedule;
};

const update = async (id: number, payload: IUpdateExamSchedule) => {
    const existing = await prisma.examSchedule.findUnique({ where: { id } });
    if (!existing) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam schedule not found');
    }

    // যদি examId/subjectId/classId বদলানো হয়, নতুন duplicate কম্বিনেশন চেক করা দরকার
    const nextExamId = payload.examId ?? existing.examId;
    const nextSubjectId = payload.subjectId ?? existing.subjectId;
    const nextClassId = payload.classId ?? existing.classId;

    const isKeyChanged =
        nextExamId !== existing.examId ||
        nextSubjectId !== existing.subjectId ||
        nextClassId !== existing.classId;

    if (isKeyChanged) {
        const duplicate = await prisma.examSchedule.findUnique({
            where: {
                examId_subjectId_classId: {
                    examId: nextExamId,
                    subjectId: nextSubjectId,
                    classId: nextClassId,
                },
            },
        });
        if (duplicate && duplicate.id !== id) {
            throw new ApiError(
                httpStatus.CONFLICT,
                'A schedule for this exam, subject, and class already exists'
            );
        }
    }

    const startTime = payload.startTime ? new Date(payload.startTime) : existing.startTime;
    const endTime = payload.endTime ? new Date(payload.endTime) : existing.endTime;

    if (endTime <= startTime) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'endTime must be after startTime');
    }

    return prisma.examSchedule.update({
        where: { id },
        data: {
            examId: payload.examId,
            subjectId: payload.subjectId,
            classId: payload.classId,
            sectionId: payload.sectionId,
            examDate: payload.examDate ? new Date(payload.examDate) : undefined,
            startTime: payload.startTime ? new Date(payload.startTime) : undefined,
            endTime: payload.endTime ? new Date(payload.endTime) : undefined,
            roomNumber: payload.roomNumber,
        },
        include: { exam: true, subject: true, class: true },
    });
};

const deleteSchedule = async (id: number) => {
    const existing = await prisma.examSchedule.findUnique({ where: { id } });
    if (!existing) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam schedule not found');
    }

    await prisma.examSchedule.delete({ where: { id } });
    return existing;
};

export const ExamScheduleService = {
    create,
    getMany,
    getSingle,
    update,
    deleteSchedule,
};