import { z } from 'zod';

const create = z.object({
    body: z.object({
        classId: z.number({ error: 'classId is required' }),
        sectionId: z.number().optional(),
        subjectId: z.number({ error: 'subjectId is required' }),
    }),
});

const update = z.object({
    body: z.object({
        classId: z.number().optional(),
        sectionId: z.number().optional(),
        subjectId: z.number().optional(),
    }),
});

export const ClassSubjectValidation = { create, update };