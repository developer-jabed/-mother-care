import { z } from "zod";

// ── Helpers ────────────────────────────────────────────────────────────────
const stringToBoolean = z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((val) => {
        if (val === undefined) return true;
        if (typeof val === "boolean") return val;
        return val === "true" || val === "1";
    });

const dateOfBirthSchema = z
    .string()
    .min(1, "Date of birth is required")
    .refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
    });

const phoneSchema = z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, "Invalid phone number format")
    .optional();

const addressSchema = z.string().trim().min(1).max(255).optional();

// ── Create Student ─────────────────────────────────────────────────────────
export const createStudentZodSchema = z.object({
    userId: z.coerce.number().int().positive().optional(),
    admissionNumber: z.string().trim().min(1, "Admission number is required"),
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]),
    dateOfBirth: dateOfBirthSchema,
    phone: phoneSchema,
    address: addressSchema,
    isActive: stringToBoolean.optional().default(true),
}).strip(); // remove unknown fields

// ── Create User + Student ──────────────────────────────────────────────────
export const createUserWithStudentZodSchema = z.object({
    user: z.object({
        email: z.string().trim().toLowerCase().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
    }),
    student: z.object({
        admissionNumber: z.string().trim().min(1, "Admission number is required"),
        fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]),
        dateOfBirth: dateOfBirthSchema,
        phone: phoneSchema,
        address: addressSchema,
        isActive: stringToBoolean.optional().default(true),
    }),
}).strip();

// ── Update Student ─────────────────────────────────────────────────────────
export const updateStudentZodSchema = z.object({
    fullName: z.string().trim().min(2).optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    phone: phoneSchema,
    address: addressSchema,
    isActive: stringToBoolean.optional(),
}).strip();

export const studentQuerySchema = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().optional(),
});

// ── Types ──────────────────────────────────────────────────────────────────
export type CreateStudentInput = z.infer<typeof createStudentZodSchema>;
export type CreateUserWithStudentInput = z.infer<typeof createUserWithStudentZodSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentZodSchema>;
export type StudentQueryInput = z.infer<typeof studentQuerySchema>;