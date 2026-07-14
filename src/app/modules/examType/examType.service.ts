import { Prisma, type ExamType } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import { examTypeSearchableFields } from './examType.constant.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import ApiError from '../../errors/api.error.js';
import type { IExamTypeFilterRequest } from './examType.interface.js';


const createExamType = async (
    payload: Prisma.ExamTypeCreateInput
): Promise<ExamType> => {
    const result = await prisma.examType.create({ data: payload });
    return result;
};

const getAllExamTypes = async (
    filters: IExamTypeFilterRequest,
    paginationOptions: PaginationResult
) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, ...filterData } = filters;

    const andConditions: Prisma.ExamTypeWhereInput[] = [];

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

    const whereConditions: Prisma.ExamTypeWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

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

const getSingleExamType = async (id: number): Promise<ExamType> => {
    const result = await prisma.examType.findUnique({ where: { id } });

    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Exam type not found');
    }

    return result;
};

const updateExamType = async (
    id: number,
    payload: Partial<ExamType>
): Promise<ExamType> => {
    await getSingleExamType(id);

    const result = await prisma.examType.update({
        where: { id },
        data: payload,
    });

    return result;
};

const deleteExamType = async (id: number): Promise<ExamType> => {
    await getSingleExamType(id);

    const examCount = await prisma.exam.count({ where: { examTypeId: id } });
    if (examCount > 0) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Cannot delete this exam type because it is used by existing exams'
        );
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