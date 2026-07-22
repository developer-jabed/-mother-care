import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import { SubjectService } from './subject.service.js';
import sendResponse from '../../shared/sendResponse.js';
import { subjectFilterableFields } from './subject.constants.js';
import { calculatePagination } from '../../helper/paginationHelper.js';
import pick from '../../helper/pick.js';


const createSubject = catchAsync(async (request, reply) => {
    const body = request.body as any;

    const payload = {
        ...body,
        fullMarks: Number(body.fullMarks),
        passMarks: Number(body.passMarks),
        credit: body.credit ? Number(body.credit) : undefined,
        classId: Number(body.classId),
        isOptional: body.isOptional === true || body.isOptional === "true",
    };

    const result = await SubjectService.createSubject(payload);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Subject created successfully and assigned to all sections of the class',
        data: result,
    });
});

const getAllSubjects = catchAsync(async (request, reply) => {
    const filters = pick(request.query as any, subjectFilterableFields);
    const paginationOptions = calculatePagination(request.query, "id");

    const result = await SubjectService.getAllSubjects(filters, paginationOptions);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Subjects retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
});
const getSingleSubject = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await SubjectService.getSingleSubject(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Subject retrieved successfully',
        data: result,
    });
});

const updateSubject = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await SubjectService.updateSubject(
        Number(id),
        request.body as any
    );

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Subject updated successfully',
        data: result,
    });
});

const deleteSubject = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await SubjectService.deleteSubject(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Subject deleted successfully',
        data: result,
    });
});

export const SubjectController = {
    createSubject,
    getAllSubjects,
    getSingleSubject,
    updateSubject,
    deleteSubject,
};