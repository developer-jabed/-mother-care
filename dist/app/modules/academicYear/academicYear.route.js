import { academicYearController } from "./academicYear.controller.js";
export default async function academicYearRoutes(fastify) {
    fastify.post("/create-academic-year", academicYearController.createAcademicYear);
    fastify.patch("/:id", academicYearController.updateAcademicYear);
    fastify.get("/:id", academicYearController.getAcademicYearById);
    fastify.get("/current", academicYearController.getCurrentAcademicYear);
    fastify.get("/", academicYearController.getAllAcademicYears);
}
//# sourceMappingURL=academicYear.route.js.map