
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type { AcademicYear } from '@prisma/client';

const createAcademicYear = async (payload: {
  title: string;
  startDate: string | Date;
  endDate: string | Date;
  isCurrent?: boolean;
}): Promise<AcademicYear> => {
  if (payload.isCurrent) {
    await prisma.academicYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
  }

  return prisma.academicYear.create({
    data: {
      title: payload.title.trim(),
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      isCurrent: payload.isCurrent ?? false,
    },
  });
};

const updateAcademicYear = async (
  id: number,
  payload: {
    title?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    isCurrent?: boolean;
  }
): Promise<AcademicYear> => {
  const existing = await prisma.academicYear.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Academic year not found');
  }

  if (payload.isCurrent) {
    await prisma.academicYear.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
  }

  return prisma.academicYear.update({
    where: { id },
    data: {
      ...(payload.title && { title: payload.title.trim() }),
      ...(payload.startDate && { startDate: new Date(payload.startDate) }),
      ...(payload.endDate && { endDate: new Date(payload.endDate) }),
      ...(payload.isCurrent !== undefined && { isCurrent: payload.isCurrent }),
    },
  });
};

const getAcademicYearById = async (id: number): Promise<AcademicYear> => {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id },
  });

  if (!academicYear) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Academic year not found');
  }

  return academicYear;
};

const getCurrentAcademicYear = async (): Promise<AcademicYear> => {
  const currentYear = await prisma.academicYear.findFirst({
    where: { isCurrent: true },
  });

  if (!currentYear) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No current academic year is set');
  }

  return currentYear;
};

const getAllAcademicYears = async () => {
  return prisma.academicYear.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: {
        select: { enrollments: true },
      },
    },
  });
};

export const academicYearService = {
  createAcademicYear,
  updateAcademicYear,
  getAcademicYearById,
  getCurrentAcademicYear,
  getAllAcademicYears,
};