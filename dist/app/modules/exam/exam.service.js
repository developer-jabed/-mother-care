import { Prisma } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import { buildPaginationMeta } from '../../helper/paginationHelper.js';
import { examSearchableFields } from './exam.constant.js';
import ApiError from '../../errors/api.error.js';
const createExam = async (payload) => {
    const result = await prisma.exam.create({
        data: {
            ...payload,
            startDate: new Date(payload.startDate),
            endDate: new Date(payload.endDate),
        },
        include: {
            academicYear: true,
            examType: true,
        },
    });
    return result;
};
const getAllExams = async (filters, paginationOptions) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, ...filterData } = filters;
    const andConditions = [];
    if (searchTerm) {
        andConditions.push({
            OR: examSearchableFields.map(field => ({
                [field]: { contains: searchTerm, mode: 'insensitive' },
            })),
        });
    }
    if (Object.keys(filterData).length > 0) {
        andConditions.push({
            AND: Object.entries(filterData).map(([key, value]) => ({
                [key]: value,
            })),
        });
    }
    const whereConditions = andConditions.length > 0 ? { AND: andConditions } : {};
    const result = await prisma.exam.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: { academicYear: true, examType: true },
    });
    const total = await prisma.exam.count({ where: whereConditions });
    const meta = buildPaginationMeta(total, paginationOptions);
    return { meta, data: result };
};
const getSingleExam = async (id) => {
    const result = await prisma.exam.findUnique({
        where: { id },
        include: { academicYear: true, examType: true },
    });
    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
    }
    return result;
};
const updateExam = async (id, payload) => {
    const existing = await getSingleExam(id);
    if (existing.isPublished && payload.isPublished !== false) {
        const restrictedFields = ['academicYearId', 'examTypeId', 'startDate', 'endDate', 'name'];
        const attemptingRestrictedChange = restrictedFields.some(field => payload[field] !== undefined);
        if (attemptingRestrictedChange) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot modify core details of a published exam. Unpublish it first.');
        }
    }
    const data = {
        ...payload,
        startDate: typeof payload.startDate === 'string' ? new Date(payload.startDate) : payload.startDate,
        endDate: typeof payload.endDate === 'string' ? new Date(payload.endDate) : payload.endDate,
    };
    const result = await prisma.exam.update({
        where: { id },
        data,
        include: { academicYear: true, examType: true },
    });
    return result;
};
const deleteExam = async (id) => {
    const resultCount = await prisma.result.count({ where: { examId: id } });
    if (resultCount > 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete this exam because results already exist for it');
    }
    const result = await prisma.exam.delete({ where: { id } });
    return result;
};
export const ExamService = {
    createExam,
    getAllExams,
    getSingleExam,
    updateExam,
    deleteExam,
};
//# sourceMappingURL=exam.service.js.map