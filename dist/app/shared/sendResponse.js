const sendResponse = (reply, payload) => {
    reply.status(payload.statusCode).send({
        success: payload.success,
        message: payload.message,
        ...(payload.meta && { meta: payload.meta }),
        ...(payload.data !== undefined && { data: payload.data ?? null }),
    });
};
export default sendResponse;
//# sourceMappingURL=sendResponse.js.map