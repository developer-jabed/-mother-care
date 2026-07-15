const catchAsync = (fn) => {
    return async (request, reply) => {
        try {
            await fn(request, reply);
        }
        catch (err) {
            reply.send(err);
        }
    };
};
export default catchAsync;
//# sourceMappingURL=catchAsync.js.map