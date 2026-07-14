import type { FastifyRequest, FastifyReply } from "fastify";

const notFound = (request: FastifyRequest, reply: FastifyReply): void => {
  reply.status(404).send({
    success: false,
    message: "API NOT FOUND!",
    error: {
      path: request.url,
      message: "Your requested path is not found!",
    },
  });
};

export default notFound;