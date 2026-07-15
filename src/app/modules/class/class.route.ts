import type { FastifyInstance } from "fastify";
import { classController } from "./class.controller.js";

async function classRoutes(fastify: FastifyInstance): Promise<void> {
    // Class Routes
    fastify.post("/create-class", classController.createClass);
    fastify.patch("/class/:id", classController.updateClass);
    fastify.get("/class/:id", classController.getClassById);
    fastify.get("/classes", classController.getAllClasses);

    // Section Routes
    fastify.post("/create-section", classController.createSection);

    fastify.get("/sections/class/:classId", classController.getSectionsByClass);
    fastify.patch("/section/:id", classController.updateSection);
}

export default classRoutes;