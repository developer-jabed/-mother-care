import type { FastifyRequest, FastifyReply, RouteGenericInterface } from "fastify";

const catchAsync = <T extends RouteGenericInterface = RouteGenericInterface>(
  fn: (request: FastifyRequest<T>, reply: FastifyReply) => Promise<void>,
) => {
  return async (request: FastifyRequest<T>, reply: FastifyReply): Promise<void> => {
    try {
      await fn(request, reply);
    } catch (err) {
      reply.send(err);
    }
  };
};

export default catchAsync;