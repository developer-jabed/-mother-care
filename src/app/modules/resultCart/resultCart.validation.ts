import { z } from 'zod';

// Single result card: one student's result card for one exam
const generateSingle = z.object({
    params: z.object({
        studentEnrollmentId: z
            .string({ error: 'Student enrollment id is required' })
            .regex(/^\d+$/, { error: 'Student enrollment id must be a number' }),
        examId: z
            .string({ error: 'Exam id is required' })
            .regex(/^\d+$/, { error: 'Exam id must be a number' }),
    }),
});

// Batch by class + section for a given exam, with optional filter to a subset
// of enrollment ids within that section (e.g. re-run only the ones that failed)
const generateBatchBySection = z.object({
    body: z.object({
        classId: z.number({ error: 'Class id is required' }).int().positive(),
        sectionId: z.number({ error: 'Section id is required' }).int().positive(),
        examId: z.number({ error: 'Exam id is required' }).int().positive(),
        onlyEnrollmentIds: z
            .array(z.number().int().positive())
            .min(1, { error: 'onlyEnrollmentIds must contain at least one id if provided' })
            .optional(),
    }),
});

export const ResultCardValidation = {
    generateSingle,
    generateBatchBySection,
};