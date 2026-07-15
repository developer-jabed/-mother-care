import { z, ZodError } from "zod";
const validateRequest = (schema) => {
    return async (request, reply) => {
        try {
            await schema.parseAsync({
                body: request.body,
                query: request.query,
                params: request.params,
            });
        }
        catch (err) {
            if (err instanceof ZodError) {
                const errors = err.issues.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                }));
                reply.status(400).send({
                    success: false,
                    message: "Validation error",
                    error: errors,
                });
                return;
            }
            reply.send(err);
        }
    };
};
export default validateRequest;
//# sourceMappingURL=validateRequest.js.map