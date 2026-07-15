import { classService } from "./class.service.js";
import sendResponse from "../../shared/sendResponse.js";
import catchAsync from "../../shared/catchAsync.js";
const createClass = catchAsync(async (request, reply) => {
    const result = await classService.createClass(request.body);
    sendResponse(reply, {
        statusCode: 201,
        success: true,
        message: "Class created successfully",
        data: result,
    });
});
const updateClass = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await classService.updateClass(Number(id), request.body);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Class updated successfully",
        data: result,
    });
});
const getClassById = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await classService.getClassById(Number(id));
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Class fetched successfully",
        data: result,
    });
});
const getAllClasses = catchAsync(async (request, reply) => {
    const result = await classService.getAllClasses();
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Classes fetched successfully",
        data: result,
    });
});
// Section Controllers
const createSection = catchAsync(async (request, reply) => {
    const result = await classService.createSection(request.body);
    sendResponse(reply, {
        statusCode: 201,
        success: true,
        message: "Section created successfully",
        data: result,
    });
});
const getAllSections = catchAsync(async (request, reply) => {
    const result = await classService.getAllSections();
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Sections fetched successfully",
        data: result,
    });
});
const getSectionsByClass = catchAsync(async (request, reply) => {
    const { classId } = request.params;
    const result = await classService.getSectionsByClass(Number(classId));
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Sections fetched successfully",
        data: result,
    });
});
const updateSection = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await classService.updateSection(Number(id), request.body);
    sendResponse(reply, {
        statusCode: 200,
        success: true,
        message: "Section updated successfully",
        data: result,
    });
});
export const classController = {
    createClass,
    updateClass,
    getClassById,
    getAllClasses,
    createSection,
    getSectionsByClass,
    updateSection,
};
//# sourceMappingURL=class.controller.js.map