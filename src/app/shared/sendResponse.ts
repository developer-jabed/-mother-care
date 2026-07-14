import type { FastifyReply } from "fastify";
import type { PaginationMeta } from "../helper/paginationHelper.js";

type SendResponsePayload<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  meta?: PaginationMeta;
  data?: T | null;
};

const sendResponse = <T>(
  reply: FastifyReply,
  payload: SendResponsePayload<T>
): void => {
  reply.status(payload.statusCode).send({
    success: payload.success,
    message: payload.message,
    ...(payload.meta && { meta: payload.meta }),
    ...(payload.data !== undefined && { data: payload.data ?? null }),
  });
};

export default sendResponse;