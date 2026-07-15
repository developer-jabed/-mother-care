import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import ApiError from "../errors/api.error.js";
// ── Known Fastify multipart error codes ─────────────────────────────────────
const MULTIPART_ERROR_CODES = {
    FST_REQ_FILE_TOO_LARGE: "Uploaded file exceeds the maximum allowed size",
    FST_FILES_LIMIT: "Too many files uploaded in a single request",
    FST_FIELDS_LIMIT: "Too many form fields in a single request",
    FST_PARTS_LIMIT: "Too many parts in the multipart request",
    FST_INVALID_MULTIPART_CONTENT_TYPE: "Request must use multipart/form-data content type",
};
const globalErrorHandler = (fastify) => {
    fastify.setErrorHandler((err, request, reply) => {
        fastify.log.error(err);
        let statusCode = 500;
        let message = "Something went wrong!";
        let error = err;
        // ── ApiError ───────────────────────────────────────────
        if (err instanceof ApiError) {
            statusCode = err.statusCode;
            message = err.message;
            error = null;
        }
        // ── Zod validation error ────────────────────────────────
        else if (err instanceof ZodError) {
            statusCode = 400;
            message = "Validation error";
            error = err.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
            }));
        }
        // ── Fastify built-in schema validation error ────────────
        else if ("validation" in err && err.validation) {
            statusCode = 400;
            message = "Validation error";
            error = err.validation;
        }
        // ── Multipart / file upload error (matched by code, not message) ──
        else if ("code" in err && typeof err.code === "string" && MULTIPART_ERROR_CODES[err.code]) {
            statusCode = err.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400;
            message = MULTIPART_ERROR_CODES[err.code];
            error = null;
        }
        // ── Prisma known errors ────────────────────────────────
        else if (err instanceof Prisma.PrismaClientKnownRequestError) {
            switch (err.code) {
                case "P2002":
                    statusCode = 409;
                    message = "Record already exists";
                    error = err.meta;
                    break;
                case "P1000":
                    statusCode = 502;
                    message = "Authentication failed against database server";
                    error = err.meta;
                    break;
                case "P2003":
                    statusCode = 400;
                    message = "Foreign key constraint failed";
                    error = err.meta;
                    break;
                case "P2025":
                    statusCode = 404;
                    message = "Record not found";
                    error = err.meta;
                    break;
                case "P2023":
                    statusCode = 409;
                    message = "Prisma type mismatch error";
                    error = err.meta;
                    break;
                default:
                    statusCode = 400;
                    message = err.message;
                    error = err.meta;
            }
        }
        // ── Prisma validation error ────────────────────────────
        else if (err instanceof Prisma.PrismaClientValidationError) {
            statusCode = 400;
            message = "Validation error";
            error = err.message;
        }
        // ── Prisma unknown error ───────────────────────────────
        else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
            statusCode = 500;
            message = "Unknown database error occurred";
            error = err.message;
        }
        // ── Prisma initialization error ────────────────────────
        else if (err instanceof Prisma.PrismaClientInitializationError) {
            statusCode = 500;
            message = "Database client failed to initialize";
            error = err.message;
        }
        // ── Don't leak internals in production for unhandled 500s ──────────
        if (statusCode === 500 && process.env.NODE_ENV === "production") {
            error = null;
        }
        reply.status(statusCode).send({
            success: false,
            message,
            error,
        });
    });
};
export default globalErrorHandler;
//# sourceMappingURL=globalErrorHandler.js.map