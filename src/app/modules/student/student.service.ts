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

// ── FIXED: Numeric-safe next admission number generator ────────────────────
const getNextAdmissionNumber = async (tx?: any): Promise<string> => {
    const prismaClient = tx || prisma;

    // Fetch all admission numbers and compute max numerically in JS.
    // Avoids string-sort bugs from mixed padding/lengths.
    const students = await prismaClient.student.findMany({
        select: { admissionNumber: true },
    });

    let maxNum = 0;
    for (const s of students) {
        const num = parseInt(s.admissionNumber, 10);
        if (!isNaN(num) && num > maxNum) {
            maxNum = num;
        }
    }

    return (maxNum + 1).toString().padStart(4, '0');
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
                fatherName: payload.fatherName,   // ✅ NEW
                motherName: payload.motherName,   // ✅ NEW
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



const createUserWithStudent = async (
    payload: CreateUserWithStudentInput,
    file?: UploadedFile
): Promise<Student> => {
    const { user: userPayload, student: studentPayload } = payload;

    const emailExists = await prisma.user.findUnique({ where: { email: userPayload.email } });
    if (emailExists) {
        throw new ApiError(httpStatus.CONFLICT, "Email is already in use");
    }

    // If user manually provided an admission number, validate it upfront
    const manualAdmissionNumber = studentPayload.admissionNumber?.trim();
    if (manualAdmissionNumber) {
        const admissionExists = await prisma.student.findUnique({
            where: { admissionNumber: manualAdmissionNumber },
        });
        if (admissionExists) {
            throw new ApiError(httpStatus.CONFLICT, "Admission number already exists");
        }
    }

    let photoUrl: string | undefined;
    if (file) {
        photoUrl = await uploadStudentPhoto(file);
    }

    const hashedPassword = await bcrypt.hash(userPayload.password, BCRYPT_SALT_ROUNDS);

    const MAX_RETRIES = 3;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const result = await prisma.$transaction(async (tx) => {
                // ✅ Generate INSIDE transaction, right before create — minimizes race window
                const admissionNumber = manualAdmissionNumber || await getNextAdmissionNumber(tx);

                const createdUser = await tx.user.create({
                    data: {
                        email: userPayload.email,
                        password: hashedPassword,
                        role: "STUDENT",
                    },
                });

                const createdStudent = await tx.student.create({
                    data: {
                        admissionNumber,
                        fullName: studentPayload.fullName,
                        fatherName: studentPayload.fatherName,
                        motherName: studentPayload.motherName,
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
        } catch (error: any) {
            lastError = error;
            // Prisma unique constraint violation code
            const isUniqueConflict = error?.code === "P2002";
            if (isUniqueConflict && !manualAdmissionNumber && attempt < MAX_RETRIES - 1) {
                continue; // retry with a freshly generated number
            }
            break;
        }
    }

    if (photoUrl) {
        const publicId = extractPublicId(photoUrl);
        if (publicId) await fileUploader.deleteFromCloudinary(publicId).catch(() => { });
    }

    if (lastError?.code === "P2002") {
        throw new ApiError(httpStatus.CONFLICT, "Admission number already exists");
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to create user and student record");
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
            ...(payload.fatherName !== undefined && { fatherName: payload.fatherName }),   // ✅ NEW
            ...(payload.motherName !== undefined && { motherName: payload.motherName }),   // ✅ NEW
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
                orderBy: { academicYear: { startDate: "desc" } },
                include: {
                    academicYear: true,
                    class: true,
                    section: true,
                    promotedFrom: true,
                    promotions: true,
                    results: {
                        orderBy: { createdAt: "desc" },
                        include: {
                            exam: {
                                include: { examType: true },
                            },
                            details: {
                                include: { subject: true },
                            },
                        },
                    },
                    smsLogs: {
                        orderBy: { createdAt: "desc" },
                        include: { exam: true },
                    },
                },
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