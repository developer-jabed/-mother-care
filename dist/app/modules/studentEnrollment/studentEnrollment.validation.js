import { z } from "zod";
const enrollmentStatusSchema = z.enum(["ACTIVE", "PROMOTED", "COMPLETED", "LEFT"]);
export const createStudentEnrollmentZodSchema = z.object({
    studentId: z.coerce.number().int().positive(),
    academicYearId: z.coerce.number().int().positive(),
    classId: z.coerce.number().int().positive(),
    sectionId: z.coerce.number().int().positive(),
    rollNumber: z.coerce.number().int().positive(),
    isCurrent: z.boolean().optional().default(true),
    status: enrollmentStatusSchema.optional().default("ACTIVE"),
});
export const updateStudentEnrollmentZodSchema = z.object({
    rollNumber: z.coerce.number().int().positive().optional(),
    isCurrent: z.boolean().optional(),
    status: enrollmentStatusSchema.optional(),
    promotedFromId: z.coerce.number().int().positive().optional(),
});
export const promoteStudentZodSchema = z.object({
    studentId: z.coerce.number().int().positive(),
    newAcademicYearId: z.coerce.number().int().positive(),
    newClassId: z.coerce.number().int().positive(),
    newSectionId: z.coerce.number().int().positive(),
    newRollNumber: z.coerce.number().int().positive(),
});
export const performanceRankingQueryZodSchema = z.object({
    academicYearId: z.coerce.number().int().positive(),
    classId: z.coerce.number().int().positive(),
    sectionId: z.coerce.number().int().positive(),
});
export const bulkPromoteZodSchema = z.object({
    sourceAcademicYearId: z.coerce.number().int().positive(),
    sourceClassId: z.coerce.number().int().positive(),
    sourceSectionId: z.coerce.number().int().positive(),
    targetAcademicYearId: z.coerce.number().int().positive(),
    targetClassId: z.coerce.number().int().positive(),
    targetSectionId: z.coerce.number().int().positive(),
    promotions: z
        .array(z.object({
        studentId: z.coerce.number().int().positive(),
        newRollNumber: z.coerce.number().int().positive(),
    }))
        .min(1, "অন্তত একজন শিক্ষার্থী নির্বাচন করুন"),
});
//# sourceMappingURL=studentEnrollment.validation.js.map