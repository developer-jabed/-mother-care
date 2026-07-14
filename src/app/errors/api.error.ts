import type { FastifyError } from "fastify";

class ApiError extends Error implements FastifyError {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code: string = "API_ERROR") {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default ApiError;