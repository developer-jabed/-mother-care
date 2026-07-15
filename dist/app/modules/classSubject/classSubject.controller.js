import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import { ClassSubjectService } from './classSubject.service.js';
import sendResponse from '../../shared/sendResponse.js';
import ApiError from '../../errors/api.error.js';
import { classSubjectFilterableFields } from './classSubject.constants.js';
import pick from '../../helper/pick.js';
import { calculatePagination } from '../../helper/paginationHelper.js';
const createClassSubject = catchAsync(async (request, reply) => {
    const result = await ClassSubjectService.createClassSubject(request.body);
    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Class subject created successfully',
        data: result,
    });
});
const getAllClassSubjects = catchAsync(async (request, reply) => {
    const filters = pick(request.query, classSubjectFilterableFields);
    const paginationOptions = calculatePagination(request.query);
    // ClassSubject has no `createdAt` field, so fall back to `id`
    if (!paginationOptions.sortBy || paginationOptions.sortBy === 'createdAt') {
        paginationOptions.sortBy = 'id';
    }
    const result = await ClassSubjectService.getAllClassSubjects(filters, paginationOptions);
    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Class subjects retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
});
const getSubjectsByClassAndSection = catchAsync(async (request, reply) => {
    const { classId, sectionId } = request.query;
    if (!classId || !sectionId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'classId and sectionId query params are required');
    }
    const result = await ClassSubjectService.getSubjectsByClassAndSection(Number(classId), Number(sectionId));
    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Subjects retrieved successfully',
        data: result,
    });
});
const getSingleClassSubject = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await ClassSubjectService.getSingleClassSubject(Number(id));
    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Class subject retrieved successfully',
        data: result,
    });
});
const updateClassSubject = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await ClassSubjectService.updateClassSubject(Number(id), request.body);
    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Class subject updated successfully',
        data: result,
    });
});
const deleteClassSubject = catchAsync(async (request, reply) => {
    const { id } = request.params;
    const result = await ClassSubjectService.deleteClassSubject(Number(id));
    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Class subject deleted successfully',
        data: result,
    });
});
export const ClassSubjectController = {
    createClassSubject,
    getAllClassSubjects,
    getSubjectsByClassAndSection,
    getSingleClassSubject,
    updateClassSubject,
    deleteClassSubject,
};
//# sourceMappingURL=classSubject.controller.js.map