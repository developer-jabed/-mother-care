import { z } from 'zod';

const create = z.object({
    body: z.object({
        examId: z.number({ error: 'examId is required' }).int().positive(),
        subjectId: z.number({ error: 'subjectId is required' }).int().positive(),
        classId: z.number({ error: 'classId is required' }).int().positive(),
        sectionId: z.number().int().positive().nullable().optional(),
        examDate: z.coerce.date({ error: 'examDate is required' }),
        startTime: z.coerce.date({ error: 'startTime is required' }),
        endTime: z.coerce.date({ error: 'endTime is required' }),
        roomNumber: z.string().max(50).nullable().optional(),
    }).refine((data) => data.endTime > data.startTime, {
        message: 'endTime must be after startTime',
        path: ['endTime'],
    }),
});

const update = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'Invalid id'),
    }),
    body: z.object({
        examId: z.number().int().positive().optional(),
        subjectId: z.number().int().positive().optional(),
        classId: z.number().int().positive().optional(),
        sectionId: z.number().int().positive().nullable().optional(),
        examDate: z.coerce.date().optional(),
        startTime: z.coerce.date().optional(),
        endTime: z.coerce.date().optional(),
        roomNumber: z.string().max(50).nullable().optional(),
    }),
});

const getSingle = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'Invalid id'),
    }),
});

const deleteSchedule = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'Invalid id'),
    }),
});

const getMany = z.object({
    querystring: z.object({
        examId: z.string().regex(/^\d+$/).optional(),
        classId: z.string().regex(/^\d+$/).optional(),
        sectionId: z.string().regex(/^\d+$/).optional(),
        subjectId: z.string().regex(/^\d+$/).optional(),
    }),
});

export const ExamScheduleValidation = {
    create,
    update,
    getSingle,
    deleteSchedule,
    getMany,
};