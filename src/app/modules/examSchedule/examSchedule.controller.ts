import httpStatus from 'http-status';
import catchAsync from '../../shared/catchAsync.js';
import sendResponse from '../../shared/sendResponse.js';
import { ExamScheduleService } from './examSchedule.service.js';
import type { ICreateExamSchedule, IUpdateExamSchedule } from './examSchedule.interface.js';

const create = catchAsync(async (request, reply) => {
    const payload = request.body as ICreateExamSchedule;
    const result = await ExamScheduleService.create(payload);

    return sendResponse(reply, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Exam schedule created successfully',
        data: result,
    });
});

const getMany = catchAsync(async (request, reply) => {
    const { examId, classId, sectionId, subjectId } = request.query as {
        examId?: string;
        classId?: string;
        sectionId?: string;
        subjectId?: string;
    };

    const result = await ExamScheduleService.getMany({
        examId: examId ? Number(examId) : undefined,
        classId: classId ? Number(classId) : undefined,
        sectionId: sectionId ? Number(sectionId) : undefined,
        subjectId: subjectId ? Number(subjectId) : undefined,
    });

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam schedules retrieved successfully',
        data: result,
    });
});

const getSingle = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamScheduleService.getSingle(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam schedule retrieved successfully',
        data: result,
    });
});

const update = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = request.body as IUpdateExamSchedule;

    const result = await ExamScheduleService.update(Number(id), payload);

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam schedule updated successfully',
        data: result,
    });
});

const deleteSchedule = catchAsync(async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ExamScheduleService.deleteSchedule(Number(id));

    return sendResponse(reply, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Exam schedule deleted successfully',
        data: result,
    });
});

export const ExamScheduleController = {
    create,
    getMany,
    getSingle,
    update,
    deleteSchedule,
};