// student.service.ts
import type { Student } from '@prisma/client';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { buildPaginationMeta, calculatePagination } from '../../helper/paginationHelper.js';
import { fileUploader } from '../../helper/fileUploader.js';
import type {
    CreateStudentInput,
    CreateUserWithStudentInput,
    UpdateStudentInput,
} from './student.validation.js';
import type { UploadedFile } from './student.controller.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BCRYPT_SALT_ROUNDS = 12;

// ── Reusable upload guard with improved MIME detection ─────────────────────
const uploadStudentPhoto = async (file: UploadedFile): Promise<string> => {
    const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

    let mimetype = file.mimetype;

    // Enhanced detection for octet-stream (common with .webp, Postman, etc.)
    if (mimetype === "application/octet-stream" || !mimetype) {
        const ext = file.filename.split(".").pop()?.toLowerCase();
        const extToMime: Record<string, string> = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
        };
        mimetype = extToMime[ext || ""] || mimetype;
    }

    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}. Received: ${mimetype}`
        );
    }

    if (file.buffer.length > MAX_FILE_SIZE) {
        throw new ApiError(httpStatus.BAD_REQUEST, "File size exceeds 5MB limit");
    }

    try {
        const cloudinaryResult = await fileUploader.uploadToCloudinary(
            {
                buffer: file.buffer,
                filename: file.filename,
                mimetype: mimetype,   // Use the corrected mimetype
            },
            "school/students"
        );
        return cloudinaryResult.secure_url;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to upload student photo");
    }
};

// ── Utility: extract Cloudinary public_id from a secure_url ────────────────
const extractPublicId = (url: string): string | null => {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return match ? match[1] : null;
};

const createStudent = async (
    payload: CreateStudentInput,
    file?: UploadedFile
): Promise<Student> => {
    const existing = await prisma.student.findUnique({
        where: { admissionNumber: payload.admissionNumber },
    });

    if (existing) {
        throw new ApiError(httpStatus.CONFLICT, "Admission number already exists");
    }

    const userExists = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!userExists) {
        throw new ApiError(httpStatus.NOT_FOUND, "Associated user not found");
    }

    let photoUrl: string | undefined;
    if (file) {
        photoUrl = await uploadStudentPhoto(file);
    }

    try {
        return await prisma.student.create({
            data: {
                admissionNumber: payload.admissionNumber,
                fullName: payload.fullName,
                gender: payload.gender,
                dateOfBirth: new Date(payload.dateOfBirth),
                phone: payload.phone,
                address: payload.address,
                photo: photoUrl,
                isActive: payload.isActive ?? true,
                userId: payload.userId,
            },
            include: {
                user: true,
                enrollments: {
                    include: { academicYear: true, class: true, section: true },
                },
            },
        });
    } catch (error) {
        if (photoUrl) {
            const publicId = extractPublicId(photoUrl);
            if (publicId) await fileUploader.deleteFromCloudinary(publicId).catch(() => { });
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create student record");
    }
};

// ── Create User + Student together ──────────────────────────────────────────
const createUserWithStudent = async (
    payload: CreateUserWithStudentInput,
    file?: UploadedFile
): Promise<Student> => {
    const { user: userPayload, student: studentPayload } = payload;

    // Pre-checks BEFORE any upload/DB write, so we fail fast and cheap
    const [emailExists, admissionExists] = await Promise.all([
        prisma.user.findUnique({ where: { email: userPayload.email } }),
        prisma.student.findUnique({ where: { admissionNumber: studentPayload.admissionNumber } }),
    ]);

    if (emailExists) {
        throw new ApiError(httpStatus.CONFLICT, "Email is already in use");
    }
    if (admissionExists) {
        throw new ApiError(httpStatus.CONFLICT, "Admission number already exists");
    }

    // Upload photo (outside the transaction — Cloudinary isn't transactional)
    let photoUrl: string | undefined;
    if (file) {
        photoUrl = await uploadStudentPhoto(file);
    }

    const hashedPassword = await bcrypt.hash(userPayload.password, BCRYPT_SALT_ROUNDS);

    try {
        // Atomic: either both User and Student are created, or neither is
        const result = await prisma.$transaction(async (tx) => {
            const createdUser = await tx.user.create({
                data: {
                    email: userPayload.email,
                    password: hashedPassword,
                    role: "STUDENT",
                },
            });

            const createdStudent = await tx.student.create({
                data: {
                    admissionNumber: studentPayload.admissionNumber,
                    fullName: studentPayload.fullName,
                    gender: studentPayload.gender,
                    dateOfBirth: new Date(studentPayload.dateOfBirth),
                    phone: studentPayload.phone,
                    address: studentPayload.address,
                    photo: photoUrl,
                    isActive: studentPayload.isActive ?? true,
                    userId: createdUser.id,
                },
                include: {
                    user: true,
                    enrollments: {
                        include: { academicYear: true, class: true, section: true },
                    },
                },
            });

            return createdStudent;
        });

        return result;
    } catch (error) {
        // Roll back the uploaded photo if the DB transaction failed
        if (photoUrl) {
            const publicId = extractPublicId(photoUrl);
            if (publicId) await fileUploader.deleteFromCloudinary(publicId).catch(() => { });
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create user and student record");
    }
};

const updateStudent = async (
    id: number,
    payload: UpdateStudentInput,
    file?: UploadedFile
): Promise<Student> => {
    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) {
        throw new ApiError(httpStatus.NOT_FOUND, "Student not found");
    }

    let photoUrl: string | undefined;
    if (file) {
        photoUrl = await uploadStudentPhoto(file);
    }

    const updated = await prisma.student.update({
        where: { id },
        data: {
            ...(payload.fullName && { fullName: payload.fullName }),
            ...(payload.gender && { gender: payload.gender }),
            ...(payload.dateOfBirth && { dateOfBirth: new Date(payload.dateOfBirth) }),
            ...(payload.phone !== undefined && { phone: payload.phone }),
            ...(payload.address !== undefined && { address: payload.address }),
            ...(photoUrl && { photo: photoUrl }),
            ...(payload.isActive !== undefined && { isActive: payload.isActive }),
        },
        include: { user: true },
    });

    if (photoUrl && existing.photo) {
        const oldPublicId = extractPublicId(existing.photo);
        if (oldPublicId) await fileUploader.deleteFromCloudinary(oldPublicId).catch(() => { });
    }

    return updated;
};

const getStudentById = async (id: number) => {
    const student = await prisma.student.findUnique({
        where: { id },
        include: {
            user: true,
            enrollments: {
                include: { academicYear: true, class: true, section: true },
            },
        },
    });

    if (!student) {
        throw new ApiError(httpStatus.NOT_FOUND, "Student not found");
    }

    return student;
};

const getAllStudents = async (filters: any = {}) => {
    const { search, page = 1, limit = 10, gender, isActive } = filters;
    const pagination = calculatePagination({ page, limit });

    const whereCondition: any = {};

    // isActive filter — coerce string query param to boolean, default to true if not specified
    if (isActive !== undefined) {
        whereCondition.isActive = isActive === "true" || isActive === true;
    } else {
        whereCondition.isActive = true; // preserve your original default behavior
    }

    if (gender) {
        whereCondition.gender = gender; // "MALE" | "FEMALE" | "OTHER" — matches your Gender enum
    }

    if (search) {
        whereCondition.OR = [
            { fullName: { contains: search, mode: 'insensitive' } },
            { admissionNumber: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
        ];
    }

    const [students, total] = await Promise.all([
        prisma.student.findMany({
            where: whereCondition,
            skip: pagination.skip,
            take: pagination.take,
            orderBy: { createdAt: 'desc' },
            include: {
                user: true,
                enrollments: {
                    where: { isCurrent: true },
                    include: { class: true, section: true },
                },
            },
        }),
        prisma.student.count({ where: whereCondition }),
    ]);

    return { meta: buildPaginationMeta(total, pagination), data: students };
};

const deleteStudent = async (id: number) => {
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) {
        throw new ApiError(httpStatus.NOT_FOUND, "Student not found");
    }

    return prisma.student.update({
        where: { id },
        data: { isActive: false },
    });
};

export const studentService = {
    createStudent,
    createUserWithStudent,
    updateStudent,
    getStudentById,
    getAllStudents,
    deleteStudent,
};