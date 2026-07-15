import fp from "fastify-plugin";
import { Redis } from "ioredis";
export default fp(async (fastify) => {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (!redisUrl) {
        fastify.log.error("❌ UPSTASH_REDIS_URL is not defined in environment");
        throw new Error("UPSTASH_REDIS_URL is required");
    }
    fastify.log.info("🔌 Connecting to Upstash Redis...");
    const redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy(times) {
            if (times > 5) {
                fastify.log.error("❌ Redis max retries reached. Giving up.");
                return null;
            }
            const delay = Math.min(times * 800, 5000);
            fastify.log.warn(`🔄 Redis retry #${times} after ${delay}ms`);
            return delay;
        },
    });
    redis.on("error", (err) => {
        fastify.log.error({ err }, "Redis Error");
    });
    redis.on("ready", () => fastify.log.info("✅ Redis connected successfully"));
    redis.on("close", () => fastify.log.warn("⚠️ Redis connection closed"));
    redis.on("reconnecting", () => fastify.log.info("🔄 Redis reconnecting..."));
    try {
        await redis.connect();
    }
    catch (err) {
        fastify.log.error(err, "Failed to connect to Redis");
        // Don't throw here if you want the server to start anyway
    }
    fastify.decorate("redis", redis);
    fastify.addHook("onClose", async () => {
        await redis.quit();
        fastify.log.info("✅ Redis disconnected");
    });
});
//# sourceMappingURL=redis.js.map