import { z } from 'zod';
const resultDetailInput = z.object({
    subjectId: z.number({ error: 'subjectId is required' }),
    writtenMarks: z.number().optional(),
    mcqMarks: z.number().optional(),
    practicalMarks: z.number().optional(),
    vivaMarks: z.number().optional(),
});
const create = z.object({
    body: z.object({
        studentEnrollmentId: z.number({ error: 'studentEnrollmentId is required' }),
        examId: z.number({ error: 'examId is required' }),
        remarks: z.string().optional(),
        details: z
            .array(resultDetailInput)
            .min(1, { error: 'At least one subject result is required' }),
    }),
});
const update = z.object({
    body: z.object({
        remarks: z.string().optional(),
        details: z.array(resultDetailInput).optional(),
    }),
});
const publish = z.object({
    body: z.object({
        isPublished: z.boolean({ error: 'isPublished is required' }),
    }),
});
export const ResultValidation = { create, update, publish };
//# sourceMappingURL=result.validation.js.map