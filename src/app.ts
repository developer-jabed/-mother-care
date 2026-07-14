import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import pinoPretty from "pino-pretty";
import { createRequire } from "module";
import redisPlugin from "./app/shared/redis.js";
import queuePlugin from "./app/shared/queue.js";
import globalErrorHandler from "./app/middlewares/globalErrorHandler.js";
import notFound from "./app/middlewares/notFound.js";
import registerRoutes from "./app/routes/index.js";

const require = createRequire(import.meta.url);

const isDev = process.env.NODE_ENV === "development";

const buildApp = async () => {
  const app = fastify({
    logger: isDev
      ? {
        level: "debug",
        stream: pinoPretty({
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        }),
      }
      : { level: "info" },
    trustProxy: true,
  });



  // ── Security ───────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: !isDev,
  });

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: 2000,
    timeWindow: 60 * 1000,
    errorResponseBuilder: () => ({
      success: false,
      message: "Too many requests, please try again later.",
    }),
  });

  // ── Cookies ────────────────────────────────────────────────
  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET,
  });

  // ── File uploads ───────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 5,
    },
  });

  // ── Redis ──────────────────────────────────────────────────
  await app.register(redisPlugin);

  await app.register(queuePlugin);




  // ── Lifecycle hooks ────────────────────────────────────────
  app.addHook("onReady", () => {
    app.log.info("✅ Server is ready and accepting connections");
  });

  app.addHook("onClose", (_instance, done) => {
    app.log.info("🛑 Server is shutting down...");
    done();
  });

  // ── Health check ───────────────────────────────────────────
  app.get("/health", async (_request, reply) => {
    reply.send({
      success: true,
      message: "Server is healthy 🚀",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
  });

  // ── Routes ─────────────────────────────────────────────────
  await app.register(async (instance) => {
    await registerRoutes(instance);
  }, { prefix: "/api/v1" });

  // ── Error handlers ─────────────────────────────────────────
  globalErrorHandler(app);
  app.setNotFoundHandler(notFound);

  return app;
};

export default buildApp;