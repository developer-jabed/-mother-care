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

const getSectionWiseResults = z.object({
    query: z.object({
        examId: z.string({ error: 'examId is required' }),
        classId: z.string({ error: 'classId is required' }),
        sectionId: z.string({ error: 'sectionId is required' }),
    }),
});

const getCombinedRanking = z.object({
    query: z.object({
        classId: z.string({ error: 'classId is required' }),
        sectionId: z.string({ error: 'sectionId is required' }),
        examIds: z
            .string()
            .optional()
            .transform((val) => (val ? val.split(',').map(Number) : undefined)),
    }),
});


const calculatePositions = z.object({
    query: z.object({
        classId: z.string({ error: 'classId is required' }),
        sectionId: z.string({ error: 'sectionId is required' }),
    }),
});

const getResultsByRoll = z.object({
    params: z.object({
        classId: z.string({ error: 'classId is required' }),
        sectionId: z.string({ error: 'sectionId is required' }),
        roll: z.string({ error: 'roll is required' }),
    }),
    query: z.object({
        examId: z.string().optional(),
    }),
});

export const ResultValidation = { create, update, publish, getSectionWiseResults, getCombinedRanking, calculatePositions , getResultsByRoll};

