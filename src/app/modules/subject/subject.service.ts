import { Prisma, type Subject } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type { ISubjectFilterRequest } from './subject.interface.js';
import { buildPaginationMeta, type PaginationResult } from '../../helper/paginationHelper.js';
import { subjectSearchableFields } from './subject.constants.js';

// Shared include for full class + section info
const subjectWithClassSectionInclude = {
  classSubjects: {
    include: {
      class: true,
      section: true, // will be null when the subject is class-level only
    },
  },
} satisfies Prisma.SubjectInclude;

const createSubject = async (
  payload: Prisma.SubjectCreateInput & { classId: number }
): Promise<Subject> => {
  const { classId, ...subjectData } = payload;

  const existing = await prisma.subject.findUnique({
    where: { code: subjectData.code },
  });

  if (existing) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'A subject with this code already exists'
    );
  }

  if (subjectData.passMarks > subjectData.fullMarks) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Pass marks cannot be greater than full marks'
    );
  }

  const classWithSections = await prisma.class.findUnique({
    where: { id: classId },
    include: { sections: true },
  });

  if (!classWithSections) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  }

  const result = await prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({ data: subjectData });

    if (classWithSections.sections.length > 0) {
      await tx.classSubject.createMany({
        data: classWithSections.sections.map((section) => ({
          classId,
          sectionId: section.id,
          subjectId: subject.id,
        })),
        skipDuplicates: true,
      });
    } else {
      await tx.classSubject.create({
        data: { classId, sectionId: null, subjectId: subject.id },
      });
    }

    return subject;
  });

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
      OR: subjectSearchableFields.map((field) => ({
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
    include: subjectWithClassSectionInclude, // ← full class + section
  });

  const total = await prisma.subject.count({ where: whereConditions });
  const meta = buildPaginationMeta(total, paginationOptions);

  return { meta, data: result };
};

const getSingleSubject = async (id: number) => {
  const result = await prisma.subject.findUnique({
    where: { id },
    include: subjectWithClassSectionInclude, // ← full class + section
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subject not found');
  }

  return result;
};

const getSubjectsByClassId = async (classId: number) => {
  // Check if class exists
  const classExists = await prisma.class.findUnique({
    where: { id: classId },
  });

  if (!classExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  }

  // Get all ClassSubject rows for this class (with subject + section)
  const classSubjects = await prisma.classSubject.findMany({
    where: { classId },
    include: {
      subject: true,
      section: true,          // null = class-level subject
      class: true,            // the class itself
    },
    // distinct is not needed when we keep the link rows
  });

  // Optional: group by subject if you prefer a flatter structure
  // or just return the full link objects so the caller knows
  // exactly which section each subject belongs to.
  return classSubjects.map((cs) => ({
    ...cs.subject,
    class: cs.class,
    section: cs.section,      // can be null
    classSubjectId: cs.id,    // useful if you ever need the junction row
  }));
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

  const result = await prisma.$transaction(async (tx) => {
    await tx.classSubject.deleteMany({ where: { subjectId: id } });
    return tx.subject.delete({ where: { id } });
  });

  return result;
};

export const SubjectService = {
  createSubject,
  getAllSubjects,
  getSubjectsByClassId,
  getSingleSubject,
  updateSubject,
  deleteSubject,
};