// src/plugins/queue.ts
import fp from "fastify-plugin";
import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
export default fp(async (fastify) => {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    if (!redisUrl)
        throw new Error("UPSTASH_REDIS_URL is required");
    const bullConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });
    const smsQueue = new Queue("result-sms", { connection: bullConnection });
    fastify.decorate("smsQueue", smsQueue);
    fastify.addHook("onClose", async () => {
        await smsQueue.close();
        await bullConnection.quit();
    });
});
//# sourceMappingURL=queue.js.map