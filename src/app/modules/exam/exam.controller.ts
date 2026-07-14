import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import sendResponse from '../../shared/sendResponse.js';
import { ExamService } from './exam.service.js';
import { examFilterableFields } from './exam.constant.js';
import { calculatePagination } from '../../helper/paginationHelper.js';
import pick from '../../helper/pick.js';
import type { IExamFilterRequest } from './exam.interface.js';


const createExam = catchAsync(async (request, reply) => {
    const result = await ExamService.createExam(request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam created successfully',
        data: result,
    });
});

const getAllExams = catchAsync(async (request, reply) => {
    const query = request.query as Record<string, string>;
    const rawFilters = pick(query, examFilterableFields);

    const filters: IExamFilterRequest = {
        ...rawFilters,
        isPublished:
            rawFilters.isPublished !== undefined
                ? rawFilters.isPublished === 'true'
                : undefined,
        academicYearId:
            rawFilters.academicYearId !== undefined
                ? Number(rawFilters.academicYearId)
                : undefined,
        examTypeId:
            rawFilters.examTypeId !== undefined
                ? Number(rawFilters.examTypeId)
                : undefined,
    };

    const paginationOptions = calculatePagination(request.query);

    const result = await ExamService.getAllExams(filters, paginationOptions);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exams retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
});
const getSingleExam = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamService.getSingleExam(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam retrieved successfully',
        data: result,
    });
});

const updateExam = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamService.updateExam(Number(id), request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam updated successfully',
        data: result,
    });
});

const deleteExam = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamService.deleteExam(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam deleted successfully',
        data: result,
    });
});

export const ExamController = {
    createExam,
    getAllExams,
    getSingleExam,
    updateExam,
    deleteExam,
};