import "dotenv/config";

import buildApp from "./app.js";
import { prisma } from "./app/shared/prisma.js";
import { verifyCloudinary } from "./app/helper/fileUploader.js";
import { seedAdmin } from "./app/helper/seedAdmin.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST ?? "0.0.0.0";

const start = async (): Promise<void> => {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`⚠️ Received ${signal}. Shutting down...`);

    try {
      await app.close();
      app.log.info("✅ Fastify server closed");

      await prisma.$disconnect();
      app.log.info("✅ Prisma disconnected");

      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    app.log.error(reason);
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    app.log.error(error);
    process.exit(1);
  });

  try {
    // Connect Database
    await prisma.$connect();
    app.log.info("✅ Database connected");

    // Seed Default Admin
    await seedAdmin();
    app.log.info("✅ Admin seeding completed");

    // Verify Cloudinary
    try {
      await verifyCloudinary();
      app.log.info("✅ Cloudinary connected");
    } catch (error) {
      app.log.warn("⚠️ Cloudinary connection failed");
    }

    // Start Server
    await app.listen({
      port: PORT,
      host: HOST,
    });

    app.log.info(`🚀 Server running at http://localhost:${PORT}`);
    app.log.info(`🌍 Environment: ${process.env.NODE_ENV ?? "development"}`);
    app.log.info(`🏥 Health Check: http://localhost:${PORT}/health`);
  } catch (error) {
    app.log.error(error);

    await prisma.$disconnect();

    process.exit(1);
  }
};

void start();