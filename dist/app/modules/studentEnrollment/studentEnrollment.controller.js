import { studentEnrollmentService } from "./studentEnrollment.service.js";
import sendResponse from "../../shared/sendResponse.js";
import catchAsync from "../../shared/catchAsync.js";
import ApiError from "../../errors/api.error.js";
import httpStatus from "http-status";
import { createStudentEnrollmentZodSchema, updateStudentEnrollmentZodSchema, promoteStudentZodSchema, performanceRankingQueryZodSchema, bulkPromoteZodSchema, } from "./studentEnrollment.validation.js";
const createStudentEnrollment = catchAsync(async (request, reply) => {
    const validated = createStudentEnrollmentZodSchema.parse(request.body);
    const result = await studentEnrollmentService.createStudentEnrollment(validated);
    sendResponse(reply, {
        statusCode: 201,
        success: true,
        message: "Student enrolled successfully",
        data: result,
    });
});
const promoteStudent = catchAsync(async (request, reply) => {
    const validated = promoteStudentZodSchema.parse(request.body);
    const result = await studentEnrollmentService.promoteStudent(validated);
    sendResponse(reply, {
        statusCode: 201,
        success: true,
        message: "Student promoted successfully",
        data: result,
    });
});
const getPerformanceRanking = catchAsync(async (request, reply) => {
    const validated = performanceRankingQueryZodSchema.parse(request.query);
    const result = await studentEnrollmentService.getStudentsWithPerformanceRanking(validated);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Performance ranking fetched successfully",
        data: result,
    });
});
const bulkPromote = catchAsync(async (request, reply) => {
    const validated = bulkPromoteZodSchema.parse(request.body);
    const result = await studentEnrollmentService.bulkPromoteStudents(validated);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: `${result.promoted} জন শিক্ষার্থী সফলভাবে উত্তীর্ণ হয়েছে`,
        data: result,
    });
});
const updateStudentEnrollment = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const validated = updateStudentEnrollmentZodSchema.parse(request.body);
    const result = await studentEnrollmentService.updateStudentEnrollment(Number(id), validated);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Enrollment updated successfully",
        data: result,
    });
});
const getEnrollmentById = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await studentEnrollmentService.getEnrollmentById(Number(id));
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Enrollment fetched successfully",
        data: result,
    });
});
const getAllEnrollments = catchAsync(async (request, reply) => {
    const result = await studentEnrollmentService.getAllEnrollments(request.query);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Enrollments fetched successfully",
        data: result.data,
        meta: result.meta,
    });
});
const getStudentsBySection = catchAsync(async (request, reply) => {
    const validated = performanceRankingQueryZodSchema.parse(request.query);
    const result = await studentEnrollmentService.getStudentsBySection(validated);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "শিক্ষার্থী তালিকা সফলভাবে আনা হয়েছে",
        data: result,
    });
});
export const studentEnrollmentController = {
    createStudentEnrollment,
    promoteStudent,
    getPerformanceRanking,
    bulkPromote,
    updateStudentEnrollment,
    getEnrollmentById,
    getAllEnrollments,
    getStudentsBySection,
};
//# sourceMappingURL=studentEnrollment.controller.js.map