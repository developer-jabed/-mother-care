import { z } from "zod";

export const createSubjectZodSchema = z.object({
    body: z.object({
        code: z.string().min(1, { error: "বিষয় কোড আবশ্যক" }),
        name: z.string().min(1, { error: "বিষয়ের নাম আবশ্যক" }),
        fullMarks: z.coerce.number().positive({ error: "সঠিক পূর্ণ নম্বর দিন" }),
        passMarks: z.coerce.number().positive({ error: "সঠিক পাস নম্বর দিন" }),
        credit: z.coerce.number().positive().optional(),
        isOptional: z.boolean().optional().default(false),
        classId: z.coerce.number().int().positive({ error: "ক্লাস নির্বাচন করুন" }),
    }),
});

export const updateSubjectZodSchema = z.object({
    body: z.object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        fullMarks: z.coerce.number().positive().optional(),
        passMarks: z.coerce.number().positive().optional(),
        credit: z.coerce.number().positive().optional(),
        isOptional: z.boolean().optional(),
    }),
});

export type CreateSubjectInput = z.infer<typeof createSubjectZodSchema>["body"];
export type UpdateSubjectInput = z.infer<typeof updateSubjectZodSchema>["body"];

export const SubjectValidation = {
    create: createSubjectZodSchema,
    update: updateSubjectZodSchema,
};