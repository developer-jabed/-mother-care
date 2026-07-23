import { z } from 'zod';

const generateSingle = z.object({
    query: z.object({
        examId: z.string({ error: 'examId is required' }),
        studentEnrollmentId: z.string({ error: 'studentEnrollmentId is required' }),
    }),
});

const generateSection = z.object({
    query: z.object({
        examId: z.string({ error: 'examId is required' }),
        classId: z.string({ error: 'classId is required' }),
        sectionId: z.string({ error: 'sectionId is required' }),
    }),
});

const retryFailed = z.object({
    body: z.object({
        examId: z.number({ error: 'examId is required' }),
        classId: z.number({ error: 'classId is required' }),
        sectionId: z.number({ error: 'sectionId is required' }),
        enrollmentIds: z
            .array(z.number())
            .min(1, { error: 'At least one enrollmentId is required' }),
    }),
});

const getJobStatus = z.object({
    params: z.object({
        jobId: z.string({ error: 'jobId is required' }),
    }),
});

const verify = z.object({
    params: z.object({
        enrollmentId: z.string().regex(/^\d+$/, 'Invalid enrollment id'),
        examId: z.string().regex(/^\d+$/, 'Invalid exam id'),
    }),
});

export const AdmitCardValidation = { generateSingle, generateSection, retryFailed, getJobStatus , verify};