import { Prisma, type ClassSubject, type Subject } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type { IClassSubjectFilterRequest } from './classSubject.interface.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import { classSubjectSearchableFields } from './classSubject.constants.js';


const createClassSubject = async (
    payload: Prisma.ClassSubjectUncheckedCreateInput
): Promise<ClassSubject> => {
    const existing = await prisma.classSubject.findFirst({
        where: {
            classId: payload.classId,
            sectionId: payload.sectionId ?? null,
            subjectId: payload.subjectId,
        },
    });

    if (existing) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'This subject is already assigned to this class/section'
        );
    }

    const result = await prisma.classSubject.create({
        data: payload,
        include: { class: true, section: true, subject: true },
    });

    return result;
};

const getAllClassSubjects = async (
    filters: IClassSubjectFilterRequest,
    paginationOptions: PaginationResult
) => {
    const { skip, take, sortBy, sortOrder } = paginationOptions;
    const { searchTerm, ...filterData } = filters;

    const andConditions: Prisma.ClassSubjectWhereInput[] = [];

    if (searchTerm) {
        andConditions.push({
            OR: classSubjectSearchableFields.map(field => ({
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

    const whereConditions: Prisma.ClassSubjectWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const result = await prisma.classSubject.findMany({
        where: whereConditions,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: { class: true, section: true, subject: true },
    });

    const total = await prisma.classSubject.count({ where: whereConditions });
    const meta = buildPaginationMeta(total, paginationOptions);

    return { meta, data: result };
};

const getSingleClassSubject = async (id: number): Promise<ClassSubject> => {
    const result = await prisma.classSubject.findUnique({
        where: { id },
        include: { class: true, section: true, subject: true },
    });

    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Class subject not found');
    }

    return result;
};

// ── New: subjects assigned to a specific class + section ───────────────────
// Includes class-wide assignments (sectionId === null) alongside any
// section-specific assignments, deduplicated by subject id. This is what
// powers the subject picker in the mark-entry sheet, so teachers only ever
// see subjects that actually apply to the section they're grading.
const getSubjectsByClassAndSection = async (
    classId: number,
    sectionId: number
): Promise<Subject[]> => {
    const classSubjects = await prisma.classSubject.findMany({
        where: {
            classId,
            OR: [{ sectionId: null }, { sectionId }],
        },
        include: { subject: true },
        orderBy: { subject: { name: 'asc' } },
    });

    const seen = new Set<number>();
    const subjects: Subject[] = [];

    for (const cs of classSubjects) {
        if (!seen.has(cs.subject.id)) {
            seen.add(cs.subject.id);
            subjects.push(cs.subject);
        }
    }

    return subjects;
};

const updateClassSubject = async (
    id: number,
    payload: Prisma.ClassSubjectUncheckedUpdateInput
): Promise<ClassSubject> => {
    const existing = await getSingleClassSubject(id);

    const classId = (payload.classId as number | undefined) ?? existing.classId;
    const sectionId =
        payload.sectionId !== undefined
            ? (payload.sectionId as number | null)
            : existing.sectionId;
    const subjectId =
        (payload.subjectId as number | undefined) ?? existing.subjectId;

    const duplicate = await prisma.classSubject.findFirst({
        where: {
            id: { not: id },
            classId,
            sectionId: sectionId ?? null,
            subjectId,
        },
    });

    if (duplicate) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'This subject is already assigned to this class/section'
        );
    }

    const result = await prisma.classSubject.update({
        where: { id },
        data: payload,
        include: { class: true, section: true, subject: true },
    });

    return result;
};

const deleteClassSubject = async (id: number): Promise<ClassSubject> => {
    await getSingleClassSubject(id);

    const result = await prisma.classSubject.delete({
        where: { id },
    });

    return result;
};

export const ClassSubjectService = {
    createClassSubject,
    getAllClassSubjects,
    getSingleClassSubject,
    getSubjectsByClassAndSection,
    updateClassSubject,
    deleteClassSubject,
};