import { z } from 'zod';

const create = z.object({
    body: z.object({
        code: z.string({ error: 'Subject code is required' }),
        name: z.string({ error: 'Subject name is required' }),
        fullMarks: z.number({ error: 'Full marks is required' }),
        passMarks: z.number({ error: 'Pass marks is required' }),
        credit: z.number().optional(),
        isOptional: z.boolean().optional(),
    }),
});

const update = z.object({
    body: z.object({
        code: z.string().optional(),
        name: z.string().optional(),
        fullMarks: z.number().optional(),
        passMarks: z.number().optional(),
        credit: z.number().optional(),
        isOptional: z.boolean().optional(),
    }),
});

export const SubjectValidation = { create, update };