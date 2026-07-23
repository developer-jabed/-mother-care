import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import { ResultService } from './result.service.js';
import sendResponse from '../../shared/sendResponse.js';
import { resultFilterableFields } from './result.constant.js';
import { calculatePagination } from '../../helper/paginationHelper.js';
import pick from '../../helper/pick.js';

const createResult = catchAsync(async (request, reply) => {
    const result = await ResultService.createResult(request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Result created successfully',
        data: result,
    });
});

const getAllResults = catchAsync(async (request, reply) => {
    const filters = pick(request.query as any, resultFilterableFields);
    const paginationOptions = calculatePagination(request.query);

    const result = await ResultService.getAllResults(filters, paginationOptions);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Results retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
});

const getSingleResult = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ResultService.getSingleResult(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Result retrieved successfully',
        data: result,
    });
});

const updateResult = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ResultService.updateResult(Number(id), request.body as any);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Result updated successfully',
        data: result,
    });
});

const publishResult = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isPublished } = request.body as { isPublished: boolean };
    const result = await ResultService.publishResult(Number(id), isPublished);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Result ${isPublished ? 'published' : 'unpublished'} successfully`,
        data: result,
    });
});


const getCombinedRanking = catchAsync(async (request, reply) => {
    const { classId, sectionId, examIds } = request.query as {
        classId: string;
        sectionId: string;
        examIds?: number[];
    };

    const result = await ResultService.getCombinedRanking({
        classId: Number(classId),
        sectionId: Number(sectionId),
        examIds,
    });

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Combined ranking retrieved successfully',
        data: result,
    });
});



const getSectionWiseResults = catchAsync(async (request, reply) => {
    const { examId, classId, sectionId } = request.query as {
        examId: string;
        classId: string;
        sectionId: string;
    };

    const result = await ResultService.getSectionWiseResults({
        examId: Number(examId),
        classId: Number(classId),
        sectionId: Number(sectionId),
    });

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Section-wise results retrieved successfully',
        data: result,
    });
});


const calculatePositions = catchAsync(async (request, reply) => {
    const { examId } = request.params as { examId: string };
    const { classId, sectionId } = request.query as { classId: string; sectionId: string };

    const result = await ResultService.calculatePositions(
        Number(examId),
        Number(classId),
        Number(sectionId)
    );

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Positions calculated for ${result.updated} result(s)`,
        data: result,
    });
});

const deleteResult = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ResultService.deleteResult(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Result deleted successfully',
        data: result,
    });
});

export const ResultController = {
    createResult,
    getAllResults,
    getSingleResult,
    getSectionWiseResults,
    updateResult,
    getCombinedRanking,
    publishResult,
    calculatePositions,
    deleteResult,
};