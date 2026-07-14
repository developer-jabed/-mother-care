import { Prisma, type Subject } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type { ISubjectFilterRequest } from './subject.interface.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import { subjectSearchableFields } from './subject.constants.js';


const createSubject = async (
    payload: Prisma.SubjectCreateInput
): Promise<Subject> => {
    const existing = await prisma.subject.findUnique({
        where: { code: payload.code },
    });

    if (existing) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'A subject with this code already exists'
        );
    }

    if (payload.passMarks > payload.fullMarks) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Pass marks cannot be greater than full marks'
        );
    }

    const result = await prisma.subject.create({ data: payload });

    return result;
};

const getAllSubjects = async (
    filters: ISubjectFilterRequest,
    paginationOptions: PaginationResult
) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, ...filterData } = filters;

    const andConditions: Prisma.SubjectWhereInput[] = [];

    if (searchTerm) {
        andConditions.push({
            OR: subjectSearchableFields.map(field => ({
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

    const whereConditions: Prisma.SubjectWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.subject.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
    });

    const total = await prisma.subject.count({ where: whereConditions });
    const meta = buildPaginationMeta(total, paginationOptions);

    return { meta, data: result };
};

const getSingleSubject = async (id: number): Promise<Subject> => {
    const result = await prisma.subject.findUnique({ where: { id } });

    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Subject not found');
    }

    return result;
};

const updateSubject = async (
    id: number,
    payload: Partial<Subject>
): Promise<Subject> => {
    await getSingleSubject(id);

    if (payload.code) {
        const existing = await prisma.subject.findUnique({
            where: { code: payload.code },
        });
        if (existing && existing.id !== id) {
            throw new ApiError(
                httpStatus.CONFLICT,
                'A subject with this code already exists'
            );
        }
    }

    const result = await prisma.subject.update({
        where: { id },
        data: payload,
    });

    return result;
};

const deleteSubject = async (id: number): Promise<Subject> => {
    await getSingleSubject(id);

    const result = await prisma.subject.delete({ where: { id } });

    return result;
};

export const SubjectService = {
    createSubject,
    getAllSubjects,
    getSingleSubject,
    updateSubject,
    deleteSubject,
};