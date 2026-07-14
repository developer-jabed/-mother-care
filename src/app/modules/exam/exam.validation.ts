import { z } from 'zod';

const create = z.object({
    body: z
        .object({
            academicYearId: z.number({ error: 'academicYearId is required' }),
            name: z.string({ error: 'Exam name is required' }),
            examTypeId: z.number({ error: 'examTypeId is required' }),
            startDate: z.coerce.date().optional(),
            endDate: z.coerce.date().optional(),
            isPublished: z.boolean().optional(),
        })
        .refine(
            data =>
                !data.startDate || !data.endDate || data.endDate >= data.startDate,
            {
                message: 'endDate cannot be before startDate',
                path: ['endDate'],
            }
        ),
});

const update = z.object({
    body: z
        .object({
            academicYearId: z.number().optional(),
            name: z.string().optional(),
            examTypeId: z.number().optional(),
            startDate: z.coerce.date().optional(),
            endDate: z.coerce.date().optional(),
            isPublished: z.boolean().optional(),
        })
        .refine(
            data =>
                !data.startDate || !data.endDate || data.endDate >= data.startDate,
            {
                message: 'endDate cannot be before startDate',
                path: ['endDate'],
            }
        ),
});

const getAllExams = z.object({
    query: z.object({
        searchTerm: z.string().optional(),
        academicYearId: z.coerce.number().optional(),
        examTypeId: z.coerce.number().optional(),
        isPublished: z
            .string()
            .optional()
            .transform(val => (val === undefined ? undefined : val === 'true')),
        page: z.string().optional(),
        limit: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
    }),
});

export const ExamValidation = { create, update, getAllExams };