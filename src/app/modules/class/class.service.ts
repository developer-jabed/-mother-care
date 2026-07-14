
import type { Class, Section } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';

const createClass = async (payload: {
  name: string;
  numericOrder?: number;
}): Promise<Class> => {
  return prisma.class.create({
    data: {
      name: payload.name.trim(),
      numericOrder: payload.numericOrder,
    },
    include: {
      sections: true,
    },
  });
};

const updateClass = async (
  id: number,
  payload: {
    name?: string;
    numericOrder?: number;
  }
): Promise<Class> => {
  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  }

  return prisma.class.update({
    where: { id },
    data: {
      ...(payload.name && { name: payload.name.trim() }),
      ...(payload.numericOrder !== undefined && { numericOrder: payload.numericOrder }),
    },
    include: { sections: true },
  });
};

const getClassById = async (id: number): Promise<Class> => {
  const classData = await prisma.class.findUnique({
    where: { id },
    include: {
      sections: true,
    },
  });

  if (!classData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  }

  return classData;
};

const getAllClasses = async () => {
  return prisma.class.findMany({
    orderBy: [{ numericOrder: 'asc' }, { name: 'asc' }],
    include: {
      sections: true,
      _count: {
        select: { enrollments: true },
      },
    },
  });
};

// ==================== SECTION ====================

const createSection = async (payload: {
  classId: number;
  name: string;
  capacity?: number;
}): Promise<Section> => {
  return prisma.section.create({
    data: {
      classId: payload.classId,
      name: payload.name.trim().toUpperCase(),
      capacity: payload.capacity,
    },
    include: {
      class: true,
    },
  });
};



const getAllSections = async () => {
  return prisma.section.findMany({
    orderBy: [{ classId: 'asc' }, { name: 'asc' }],
    include: {
      class: true,
      _count: {
        select: { enrollments: true },
      },
    },
  });
};

const getSectionsByClass = async (classId: number): Promise<Section[]> => {
  const classExists = await prisma.class.findUnique({ where: { id: classId } });
  if (!classExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  }

  return prisma.section.findMany({
    where: { classId },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { enrollments: true },
      },
    },
  });
};

const updateSection = async (
  id: number,
  payload: {
    name?: string;
    capacity?: number;
  }
): Promise<Section> => {
  const existing = await prisma.section.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
  }

  return prisma.section.update({
    where: { id },
    data: {
      ...(payload.name && { name: payload.name.trim().toUpperCase() }),
      ...(payload.capacity !== undefined && { capacity: payload.capacity }),
    },
    include: { class: true },
  });
};

export const classService = {
  createClass,
  updateClass,
  getClassById,
  getAllClasses,
  createSection,
  getAllSections,
  getSectionsByClass,
  updateSection,
};