import fastifyRateLimit from "@fastify/rate-limit";
export async function registerRateLimits(fastify) {
    // ── Global API limiter ─────────────────────────────────
    await fastify.register(fastifyRateLimit, {
        global: true,
        max: 100,
        timeWindow: 15 * 60 * 1000, // 15 minutes
        errorResponseBuilder: () => ({
            success: false,
            message: "Too many requests from this IP, please try again later.",
        }),
    });
}
// ── Auth limiter (use as preHandler on auth routes) ────
export const authLimiter = {
    config: {
        rateLimit: {
            max: 5,
            timeWindow: 15 * 60 * 1000,
            errorResponseBuilder: () => ({
                success: false,
                message: "Too many login attempts, please try again later.",
            }),
        },
    },
};
// ── Payment limiter (use as preHandler on payment routes) ─
export const paymentLimiter = {
    config: {
        rateLimit: {
            max: 10,
            timeWindow: 60 * 60 * 1000,
            errorResponseBuilder: () => ({
                success: false,
                message: "Too many payment attempts, please try again later.",
            }),
        },
    },
};
//# sourceMappingURL=rateLimiter.js.map