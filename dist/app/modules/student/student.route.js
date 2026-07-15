import { studentController } from "./student.controller.js";
async function studentRoutes(fastify) {
    // Create Student
    fastify.post("/create-student", studentController.createStudent);
    // Update Student
    fastify.patch("/:id", studentController.updateStudent);
    // Get All Students
    fastify.get("/", studentController.getAllStudents);
    // Get Single Student
    fastify.get("/:id", studentController.getStudentById);
    // Delete Student
    fastify.delete("/:id", studentController.deleteStudent);
}
export default studentRoutes;
//# sourceMappingURL=student.route.js.map