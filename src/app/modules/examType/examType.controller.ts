import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import { ExamTypeService } from './examType.service.js';
import sendResponse from '../../shared/sendResponse.js';
import { calculatePagination } from '../../helper/paginationHelper.js';
import pick from '../../helper/pick.js';
import { examTypeSearchableFields } from './examType.constant.js';

const createExamType = catchAsync(async (request, reply) => {
    const result = await ExamTypeService.createExamType(request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam type created successfully',
        data: result,
    });
});

const getAllExamTypes = catchAsync(async (request, reply) => {
    const filters = pick(request.query as any, examTypeSearchableFields);
    const paginationOptions = calculatePagination(request.query);

    if (!(request.query as any)?.sortBy) {
        paginationOptions.sortBy = "weight";
        paginationOptions.sortOrder = paginationOptions.sortOrder ?? "asc";
    }

    const result = await ExamTypeService.getAllExamTypes(filters, paginationOptions);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam types retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
});

const getSingleExamType = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamTypeService.getSingleExamType(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam type retrieved successfully',
        data: result,
    });
});

const updateExamType = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamTypeService.updateExamType(
        Number(id),
        request.body as any
    );

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam type updated successfully',
        data: result,
    });
});

const deleteExamType = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamTypeService.deleteExamType(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam type deleted successfully',
        data: result,
    });
});

export const ExamTypeController = {
    createExamType,
    getAllExamTypes,
    getSingleExamType,
    updateExamType,
    deleteExamType,
};