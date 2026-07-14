import { z } from 'zod';

const create = z.object({
    body: z.object({
        name: z.string({ error: 'Exam type name is required' }),
        weight: z.number().optional(),
    }),
});

const update = z.object({
    body: z.object({
        name: z.string().optional(),
        weight: z.number().optional(),
    }),
});

export const ExamTypeValidation = { create, update };