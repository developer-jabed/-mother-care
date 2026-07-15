import { academicYearService } from "./academicYear.service.js";
import sendResponse from "../../shared/sendResponse.js";
import catchAsync from "../../shared/catchAsync.js";
const createAcademicYear = catchAsync(async (request, reply) => {
    const result = await academicYearService.createAcademicYear(request.body);
    sendResponse(reply, {
        statusCode: 201,
        success: true,
        message: "Academic year created successfully",
        data: result,
    });
});
const updateAcademicYear = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await academicYearService.updateAcademicYear(Number(id), request.body);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Academic year updated successfully",
        data: result,
    });
});
const getAcademicYearById = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await academicYearService.getAcademicYearById(Number(id));
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Academic year fetched successfully",
        data: result,
    });
});
const getCurrentAcademicYear = catchAsync(async (request, reply) => {
    const result = await academicYearService.getCurrentAcademicYear();
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Current academic year fetched successfully",
        data: result,
    });
});
const getAllAcademicYears = catchAsync(async (request, reply) => {
    const result = await academicYearService.getAllAcademicYears();
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Academic years fetched successfully",
        data: result,
    });
});
export const academicYearController = {
    createAcademicYear,
    updateAcademicYear,
    getAcademicYearById,
    getCurrentAcademicYear,
    getAllAcademicYears,
};
//# sourceMappingURL=academicYear.controller.js.map