
import { Queue } from "bullmq";
import { Redis } from "ioredis";

declare module "fastify" {
    interface FastifyInstance {
        redis: Redis;
        smsQueue: Queue;
    }
}