import type { FastifyRequest, FastifyReply } from "fastify";
import { studentService } from "./student.service.js";
import sendResponse from "../../shared/sendResponse.js";
import catchAsync from "../../shared/catchAsync.js";
import ApiError from "../../errors/api.error.js";
import httpStatus from "http-status";
import { createStudentZodSchema, createUserWithStudentZodSchema, updateStudentZodSchema } from "./student.validation.js";

// ── Type for consumed multipart file ───────────────────────────────────────
export interface UploadedFile {
    fieldname: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
}
export interface UploadedFile {
    fieldname: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
}

const parseMultipart = async (request: FastifyRequest) => {
    const fields: Record<string, any> = {};
    let file: UploadedFile | undefined;

    try {
        const parts = request.parts();

        for await (const part of parts) {
            if (part.type === "file") {
                if (part.fieldname === "file" && !file) {
                    const buffer = await part.toBuffer();
                    file = {
                        fieldname: part.fieldname,
                        filename: part.filename || "unknown",
                        mimetype: part.mimetype,
                        buffer,
                    };
                } else {
                    await part.toBuffer().catch(() => { });
                }
            } else {
                let value = part.value;
                if (typeof value === "string") {
                    if (value.trim().startsWith("{") || value.trim().startsWith("[")) {
                        try {
                            value = JSON.parse(value);
                        } catch (_) { }
                    }
                }
                fields[part.fieldname] = value;
            }
        }
    } catch (err: any) {
        console.error("Multipart parse error:", err.message);
        throw new ApiError(httpStatus.BAD_REQUEST, "Failed to parse form data");
    }

    return { fields, file };
};

// ── Create Student (with User) ─────────────────────────────────────────────

const createStudent = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    let body: any;
    let file: UploadedFile | undefined;

    if (request.isMultipart()) {
        const parsed = await parseMultipart(request);
        body = parsed.fields;
        file = parsed.file;

        if (body.data) {
            if (typeof body.data === "string") {
                try {
                    body = JSON.parse(body.data);
                } catch {
                    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid JSON format in 'data' field");
                }
            } else if (typeof body.data === "object" && body.data !== null) {
                body = body.data;
            }
        }
    } else {
        body = request.body;
    }

    console.log("✅ Final body before validation:", JSON.stringify(body, null, 2));

    const hasUserField = body.user && typeof body.user === "object";
    const hasStudentField = body.student && typeof body.student === "object";

    let validated: any;
    let result: any;

    if (hasUserField && hasStudentField) {
        validated = createUserWithStudentZodSchema.parse(body);
        result = await studentService.createUserWithStudent(validated, file);
        sendResponse(reply, {
            statusCode: 201,
            success: true,
            message: "User and Student created successfully",
            data: result,
        });
    } else {
        validated = createStudentZodSchema.parse(body);
        result = await studentService.createStudent(validated, file);
        sendResponse(reply, {
            statusCode: 201,
            success: true,
            message: "Student created successfully",
            data: result,
        });
    }
});
// ── Update Student ─────────────────────────────────────────────────────────
const updateStudent = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    let body: any;
    let file: UploadedFile | undefined;

    if (request.isMultipart()) {
        const parsed = await parseMultipart(request);
        body = parsed.fields;
        file = parsed.file;

        if (body.data) {
            if (typeof body.data === "string") {
                try {
                    body = JSON.parse(body.data);
                } catch {
                    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid JSON format in 'data' field");
                }
            } else if (typeof body.data === "object" && body.data !== null) {
                body = body.data;
            }
        }
    } else {
        body = request.body;
    }

    const validated = updateStudentZodSchema.parse(body);

    const result = await studentService.updateStudent(Number(id), validated, file);

    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Student updated successfully",
        data: result,
    });
});

// ── Other Controllers (unchanged) ──────────────────────────────────────────
const getStudentById = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await studentService.getStudentById(Number(id));

    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Student fetched successfully",
        data: result,
    });
});

const getAllStudents = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await studentService.getAllStudents(request.query);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Students fetched successfully",
        data: result.data,
        meta: result.meta,
    });
});

const deleteStudent = catchAsync(async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await studentService.deleteStudent(Number(id));

    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Student deleted successfully (Soft Delete)",
    });
});

export const studentController = {
    createStudent,
    updateStudent,
    getStudentById,
    getAllStudents,
    deleteStudent,
};