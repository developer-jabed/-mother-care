
import type { Class, Section } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';


export type StudentsBySectionParams = {
  academicYearId: number;
  classId: number;
  sectionId: number;
};

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


const getStudentsBySection = async (params: StudentsBySectionParams) => {
  const { academicYearId, classId, sectionId } = params;

  // Validate the class/section actually belong together — avoids silently
  // returning [] for a bad classId/sectionId combination without explanation.
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
  });

  if (!section) {
    throw new ApiError(httpStatus.NOT_FOUND, "শাখা পাওয়া যায়নি");
  }

  if (section.classId !== classId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "এই শাখাটি এই ক্লাসের অন্তর্ভুক্ত নয়");
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicYearId,
      classId,
      sectionId,
      isCurrent: true,
    },
    orderBy: { rollNumber: "asc" },
    include: {
      student: true,
    },
  });

  return enrollments;
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
  getStudentsBySection,
  getAllSections,
  getSectionsByClass,
  updateSection,
};