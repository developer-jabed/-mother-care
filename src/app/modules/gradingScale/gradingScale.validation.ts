import { z } from 'zod';

const create = z
    .object({
        body: z.object({
            academicYearId: z.number({ error: 'academicYearId is required' }),
            minPercentage: z.number({ error: 'minPercentage is required' }),
            maxPercentage: z.number({ error: 'maxPercentage is required' }),
            grade: z.string({ error: 'grade is required' }),
            gradePoint: z.number({ error: 'gradePoint is required' }),
        }),
    })
    .refine(data => data.body.maxPercentage >= data.body.minPercentage, {
        error: 'maxPercentage cannot be less than minPercentage',
        path: ['body', 'maxPercentage'],
    });

const update = z.object({
    body: z
        .object({
            minPercentage: z.number().optional(),
            maxPercentage: z.number().optional(),
            grade: z.string().optional(),
            gradePoint: z.number().optional(),
        })
        .refine(
            data =>
                data.minPercentage === undefined ||
                data.maxPercentage === undefined ||
                data.maxPercentage >= data.minPercentage,
            {
                error: 'maxPercentage cannot be less than minPercentage',
                path: ['maxPercentage'],
            }
        ),
});

export const GradingScaleValidation = { create, update };