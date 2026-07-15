import { Prisma } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import { examTypeSearchableFields } from './examType.constant.js';
import { buildPaginationMeta } from '../../helper/paginationHelper.js';
import ApiError from '../../errors/api.error.js';
const createExamType = async (payload) => {
    const result = await prisma.examType.create({ data: payload });
    return result;
};
const getAllExamTypes = async (filters, paginationOptions) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, ...filterData } = filters;
    const andConditions = [];
    if (searchTerm) {
        andConditions.push({
            OR: examTypeSearchableFields.map(field => ({
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
    const result = await prisma.examType.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
    });
    const total = await prisma.examType.count({ where: whereConditions });
    const meta = buildPaginationMeta(total, paginationOptions);
    return { meta, data: result };
};
const getSingleExamType = async (id) => {
    const result = await prisma.examType.findUnique({ where: { id } });
    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam type not found');
    }
    return result;
};
const updateExamType = async (id, payload) => {
    await getSingleExamType(id);
    const result = await prisma.examType.update({
        where: { id },
        data: payload,
    });
    return result;
};
const deleteExamType = async (id) => {
    await getSingleExamType(id);
    const examCount = await prisma.exam.count({ where: { examTypeId: id } });
    if (examCount > 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete this exam type because it is used by existing exams');
    }
    const result = await prisma.examType.delete({ where: { id } });
    return result;
};
export const ExamTypeService = {
    createExamType,
    getAllExamTypes,
    getSingleExamType,
    updateExamType,
    deleteExamType,
};
//# sourceMappingURL=examType.service.js.map