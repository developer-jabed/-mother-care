import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import { GradingScaleService } from './gradingScale.service.js';
import sendResponse from '../../shared/sendResponse.js';
import { gradingScaleFilterableFields } from './gradingScale.constant.js';
import pick from '../../helper/pick.js';
import { calculatePagination } from '../../helper/paginationHelper.js';


const createGradingScale = catchAsync(async (request, reply) => {
    const result = await GradingScaleService.createGradingScale(request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Grading scale created successfully',
        data: result,
    });
});

const getAllGradingScales = catchAsync(async (request, reply) => {
    const filters = pick(request.query as any, gradingScaleFilterableFields);
    const paginationOptions = calculatePagination(request.query);

    const result = await GradingScaleService.getAllGradingScales(filters, paginationOptions);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Grading scales retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
});

const getGradingScalesByAcademicYear = catchAsync(async (request, reply) => {
    const { academicYearId } = request.params as { academicYearId: string };
    const result = await GradingScaleService.getGradingScalesByAcademicYear(
        Number(academicYearId)
    );

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Grading scales retrieved successfully',
        data: result,
    });
});

const getSingleGradingScale = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await GradingScaleService.getSingleGradingScale(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Grading scale retrieved successfully',
        data: result,
    });
});

const updateGradingScale = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await GradingScaleService.updateGradingScale(
        Number(id),
        request.body as any
    );

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Grading scale updated successfully',
        data: result,
    });
});

const deleteGradingScale = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await GradingScaleService.deleteGradingScale(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Grading scale deleted successfully',
        data: result,
    });
});

export const GradingScaleController = {
    createGradingScale,
    getAllGradingScales,
    getGradingScalesByAcademicYear,
    getSingleGradingScale,
    updateGradingScale,
    deleteGradingScale,
};