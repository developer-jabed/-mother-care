import type { FastifyInstance } from "fastify";
import academicYearRoutes from "../modules/academicYear/academicYear.route.js";
import classRoutes from "../modules/class/class.route.js";
import studentRoutes from "../modules/student/student.route.js";
import studentEnrollmentRoutes from "../modules/studentEnrollment/studentEnrollment.route.js";
import subjectRoutes from "../modules/subject/subject.route.js";
import classSubjectRoutes from "../modules/classSubject/classSubject.route.js";
import examRoutes from "../modules/exam/exam.route.js";
import authRoutes from "../modules/auth/auth.route.js";
import examTypeRoutes from "../modules/examType/examType.route.js";
import resultRoutes from "../modules/result/result.route.js";
import gradingScaleRoutes from "../modules/gradingScale/gradingScale.route.js";
import smsRoutes from "../modules/Sms/sms.route.js";

async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health Check
  fastify.get("/health", async () => ({
    success: true,
    status: "OK",
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
  }));

  // Register Academic Year Routes
  fastify.register(academicYearRoutes, { 
    prefix: "/academic-years" 
  });

  fastify.register(classRoutes, {
    prefix: "/classes"
  });

  fastify.register(studentRoutes, {
    prefix: "/students"
  });

  
  fastify.register(studentEnrollmentRoutes, {
    prefix: "/student-enrollments"
  });

  fastify.register(subjectRoutes, {
    prefix: "/subjects"
  });

  fastify.register(classSubjectRoutes, {
    prefix: "/class-subjects"
  });

  fastify.register(examRoutes, {
    prefix: "/exams"
  });

  fastify.register(authRoutes, {
    prefix: "/auth"
  });
  fastify.register(examTypeRoutes, {
    prefix: "/exam-types"
  });

  fastify.register(resultRoutes, {
    prefix: "/results"
  });

  fastify.register(gradingScaleRoutes, {
    prefix: "/grades"
  });

  fastify.register(smsRoutes, {
    prefix: "/sms"
  });
}

export default registerRoutes;