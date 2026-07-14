
import type { FastifyInstance } from "fastify";
import { academicYearController } from "./academicYear.controller.js";

export default async function academicYearRoutes(fastify: FastifyInstance) {
  fastify.post("/create-academic-year", academicYearController.createAcademicYear);

  fastify.patch("/:id", academicYearController.updateAcademicYear);

  fastify.get("/:id", academicYearController.getAcademicYearById);

  
  fastify.get("/current", academicYearController.getCurrentAcademicYear);

  fastify.get("/", academicYearController.getAllAcademicYears);
}