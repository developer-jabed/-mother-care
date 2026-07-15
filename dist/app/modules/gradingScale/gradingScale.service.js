import { Prisma } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import { buildPaginationMeta } from '../../helper/paginationHelper.js';
import { gradingScaleSearchableFields } from './gradingScale.constant.js';
// Checks whether a new/updated range [minPercentage, maxPercentage] overlaps
// with any existing range for the same academic year (excluding itself on update)
const assertNoOverlap = async (academicYearId, minPercentage, maxPercentage, excludeId) => {
    const overlapping = await prisma.gradingScale.findFirst({
        where: {
            academicYearId,
            id: excludeId ? { not: excludeId } : undefined,
            // Two ranges [a,b] and [c,d] overlap if a <= d AND c <= b
            AND: [
                { minPercentage: { lte: maxPercentage } },
                { maxPercentage: { gte: minPercentage } },
            ],
        },
    });
    if (overlapping) {
        throw new ApiError(httpStatus.CONFLICT, `This range overlaps with an existing grade "${overlapping.grade}" (${overlapping.minPercentage}-${overlapping.maxPercentage}) for this academic year`);
    }
};
const createGradingScale = async (payload) => {
    await assertNoOverlap(payload.academicYearId, payload.minPercentage, payload.maxPercentage);
    const result = await prisma.gradingScale.create({ data: payload });
    return result;
};
const getAllGradingScales = async (filters, paginationOptions) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, ...filterData } = filters;
    const andConditions = [];
    if (searchTerm) {
        andConditions.push({
            OR: gradingScaleSearchableFields.map(field => ({
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
    const result = await prisma.gradingScale.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: sortBy === 'id' || sortBy === 'createdAt'
            ? { [sortBy]: sortOrder }
            : { minPercentage: 'desc' },
        include: { academicYear: true },
    });
    const total = await prisma.gradingScale.count({ where: whereConditions });
    const meta = buildPaginationMeta(total, paginationOptions);
    return { meta, data: result };
};
const getGradingScalesByAcademicYear = async (academicYearId) => {
    const result = await prisma.gradingScale.findMany({
        where: { academicYearId },
        orderBy: { minPercentage: 'desc' },
    });
    return result;
};
const getSingleGradingScale = async (id) => {
    const result = await prisma.gradingScale.findUnique({
        where: { id },
        include: { academicYear: true },
    });
    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Grading scale not found');
    }
    return result;
};
const updateGradingScale = async (id, payload) => {
    const existing = await getSingleGradingScale(id);
    const minPercentage = payload.minPercentage ?? existing.minPercentage;
    const maxPercentage = payload.maxPercentage ?? existing.maxPercentage;
    await assertNoOverlap(existing.academicYearId, minPercentage, maxPercentage, id);
    const result = await prisma.gradingScale.update({
        where: { id },
        data: payload,
    });
    return result;
};
const deleteGradingScale = async (id) => {
    await getSingleGradingScale(id);
    const result = await prisma.gradingScale.delete({ where: { id } });
    return result;
};
export const GradingScaleService = {
    createGradingScale,
    getAllGradingScales,
    getGradingScalesByAcademicYear,
    getSingleGradingScale,
    updateGradingScale,
    deleteGradingScale,
};
//# sourceMappingURL=gradingScale.service.js.map