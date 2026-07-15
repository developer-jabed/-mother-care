import type { FastifyInstance } from "fastify";
import { studentEnrollmentController } from "./studentEnrollment.controller.js";

export default async function studentEnrollmentRoutes(fastify: FastifyInstance) {
    fastify.post("/create", studentEnrollmentController.createStudentEnrollment);
    fastify.post("/promote", studentEnrollmentController.promoteStudent);
    fastify.get("/performance-ranking", studentEnrollmentController.getPerformanceRanking);
    fastify.get("/by-section", studentEnrollmentController.getStudentsBySection); // ← added, and before /:id
    fastify.post("/bulk-promote", studentEnrollmentController.bulkPromote);
    fastify.patch("/:id", studentEnrollmentController.updateStudentEnrollment);
    fastify.get("/:id", studentEnrollmentController.getEnrollmentById);
    fastify.get("/", studentEnrollmentController.getAllEnrollments);
}