import cron from "node-cron";
import axios from "axios";
import type { FastifyInstance } from "fastify";

const pingHealth = async (app: FastifyInstance, APP_URL: string) => {
    app.log.info("⏰ Keep-alive cron triggered — pinging server...");
    try {
        const res = await axios.get(`${APP_URL}/health`, { timeout: 10000 });
        app.log.info(
            { status: res.status, time: new Date().toISOString() },
            "✅ Keep-alive ping successful — server is awake"
        );
    } catch (err) {
        if (axios.isAxiosError(err)) {
            app.log.warn(
                { statusCode: err.response?.status, message: err.message },
                "⚠️ Keep-alive ping failed"
            );
        } else {
            app.log.warn({ err }, "⚠️ Keep-alive ping failed");
        }
    }
};

export const startKeepAliveCron = (app: FastifyInstance) => {
    const APP_URL = process.env.APP_URL;
    const isDev = process.env.NODE_ENV === "development";

    if (isDev || !APP_URL) {
        app.log.info("⏭️  Keep-alive cron skipped (dev mode or APP_URL not set)");
        return;
    }

    cron.schedule("*/10 * * * *", () => pingHealth(app, APP_URL));

    app.log.info(`⏰ Keep-alive cron scheduled — will ping ${APP_URL}/health every 10 minutes`);

    // fire once immediately so you can confirm it's working right away
    setTimeout(() => pingHealth(app, APP_URL), 5000);
};