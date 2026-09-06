import { Prisma, FeeStatus } from '@prisma/client';
import httpStatus from 'http-status';
import { prisma } from '../../shared/prisma.js';
import ApiError from '../../errors/api.error.js';
import type { FastifyInstance } from 'fastify';
import type {
  ICreateFeeType,
  ICreateFeeStructure,
  IGenerateMonthlyFees,
  IRecordPayment,
  IFeeFilter,
  IFeeDashboardFilter,
} from './fee.interface.js';
import {
  buildPaginationMeta,
  calculatePagination,
  type PaginationQuery,
} from '../../helper/paginationHelper.js';

// ────────────────────────────────────────────────
// FeeType
// ────────────────────────────────────────────────
const createFeeType = async (payload: ICreateFeeType) => {
  const exists = await prisma.feeType.findUnique({
    where: { name: payload.name },
  });
  if (exists) {
    throw new ApiError(httpStatus.CONFLICT, 'Fee type already exists');
  }

  return prisma.feeType.create({ data: payload });
};

const getAllFeeTypes = async () => {
  return prisma.feeType.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });
};

// ────────────────────────────────────────────────
// FeeStructure
// ────────────────────────────────────────────────
const createFeeStructure = async (payload: ICreateFeeStructure) => {
  const exists = await prisma.feeStructure.findUnique({
    where: {
      feeTypeId_academicYearId_classId: {
        feeTypeId: payload.feeTypeId,
        academicYearId: payload.academicYearId,
        classId: payload.classId,
      },
    },
  });

  if (exists) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Fee structure already exists for this class & year'
    );
  }

  return prisma.feeStructure.create({
    data: payload,
    include: { feeType: true, class: true, academicYear: true },
  });
};

// ────────────────────────────────────────────────
// Generate Monthly Tuition Fees
// ────────────────────────────────────────────────
const generateMonthlyFees = async (payload: IGenerateMonthlyFees) => {
  const { academicYearId, classId, month, year, dueDate } = payload;

  const structure = await prisma.feeStructure.findFirst({
    where: {
      academicYearId,
      classId,
      isActive: true,
      feeType: { name: 'TUITION', isActive: true },
    },
    include: { feeType: true },
  });

  if (!structure) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No active TUITION fee structure found for this class'
    );
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicYearId,
      classId,
      isCurrent: true,
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  if (enrollments.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active students found');
  }

  const existing = await prisma.studentFee.findMany({
    where: {
      feeTypeId: structure.feeTypeId,
      month,
      year,
      studentEnrollmentId: { in: enrollments.map((e) => e.id) },
    },
    select: { studentEnrollmentId: true },
  });

  const existingSet = new Set(existing.map((e) => e.studentEnrollmentId));
  const toCreate = enrollments.filter((e) => !existingSet.has(e.id));

  if (toCreate.length === 0) {
    return {
      created: 0,
      message: 'All fees already generated for this month',
    };
  }

  const data = toCreate.map((e) => ({
    studentEnrollmentId: e.id,
    feeStructureId: structure.id,
    feeTypeId: structure.feeTypeId,
    amount: structure.amount,
    payableAmount: structure.amount,
    month,
    year,
    dueDate: dueDate ? new Date(dueDate) : null,
    status: FeeStatus.PENDING,
  }));

  const result = await prisma.studentFee.createMany({
    data,
    skipDuplicates: true,
  });

  return {
    created: result.count,
    totalStudents: enrollments.length,
    alreadyExisted: existingSet.size,
  };
};

// ────────────────────────────────────────────────
// Record Cash Payment + Automatic SMS
// ────────────────────────────────────────────────
const recordPayment = async (
  fastify: FastifyInstance,
  payload: IRecordPayment
) => {
  const { studentFeeId, amount, receivedById, remarks } = payload;

  if (amount <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Payment amount must be greater than 0'
    );
  }

  const studentFee = await prisma.studentFee.findUnique({
    where: { id: studentFeeId },
    include: {
      feeType: true,
      enrollment: {
        include: {
          student: true,
          class: true,
          section: true,
        },
      },
    },
  });

  if (!studentFee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Student fee not found');
  }

  if (studentFee.status === 'PAID' || studentFee.status === 'WAIVED') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This fee is already fully paid or waived'
    );
  }

  const remaining = studentFee.payableAmount - studentFee.paidAmount;

  if (amount > remaining + 0.01) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Payment amount exceeds remaining due (${remaining.toFixed(2)})`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.feePayment.create({
      data: {
        studentFeeId,
        amount,
        receivedById,
        remarks,
      },
    });

    const newPaidAmount = studentFee.paidAmount + amount;
    const newStatus: FeeStatus =
      newPaidAmount >= studentFee.payableAmount - 0.01
        ? FeeStatus.PAID
        : FeeStatus.PARTIAL;

    const updatedFee = await tx.studentFee.update({
      where: { id: studentFeeId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
      },
      include: {
        feeType: true,
        enrollment: {
          include: {
            student: true,
            class: true,
            section: true,
          },
        },
      },
    });

    return { payment, updatedFee };
  });

  // ── Automatic SMS ────────────────────────────────────────────────
  const phone = result.updatedFee.enrollment.student.phone;

  if (phone) {
    const message = buildPaymentSms({
      studentName: result.updatedFee.enrollment.student.fullName,
      feeName: result.updatedFee.feeType.displayName,
      amount,
      paidAmount: result.updatedFee.paidAmount,
      payableAmount: result.updatedFee.payableAmount,
      status: result.updatedFee.status,
      month: result.updatedFee.month,
      year: result.updatedFee.year,
      className: result.updatedFee.enrollment.class.name,
      sectionName: result.updatedFee.enrollment.section.name,
      roll: result.updatedFee.enrollment.rollNumber,
    });

    const smsLog = await prisma.smsLog.create({
      data: {
        studentEnrollmentId: result.updatedFee.studentEnrollmentId,
        studentFeeId: studentFeeId,
        type: 'FEE_PAYMENT',
        phone,
        message,
        status: 'PENDING',
      },
    });

    await fastify.smsQueue.add(
      'send-fee-sms',
      {
        type: 'FEE_PAYMENT',
        studentEnrollmentId: result.updatedFee.studentEnrollmentId,
        phone,
        message,
        studentFeeId,
        smsLogId: smsLog.id,
      },
      {
        attempts: 4,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      }
    );
  }

  return result;
};

// ────────────────────────────────────────────────
// Get Student Fees (paginated list — for the table)
// ────────────────────────────────────────────────
const getStudentFees = async (
  filters: IFeeFilter,
  query: PaginationQuery
) => {
  const { page, limit, skip, take, sortBy, sortOrder } =
    calculatePagination(query);

  const {
    searchTerm,
    studentEnrollmentId,
    feeTypeId,
    status,
    month,
    year,
    classId,
    sectionId,
  } = filters;

  const andConditions: Prisma.StudentFeeWhereInput[] = [];

  if (studentEnrollmentId) {
    andConditions.push({ studentEnrollmentId: Number(studentEnrollmentId) });
  }
  if (feeTypeId) {
    andConditions.push({ feeTypeId: Number(feeTypeId) });
  }
  if (status) {
    andConditions.push({ status: status as FeeStatus });
  }
  if (month) {
    andConditions.push({ month: Number(month) });
  }
  if (year) {
    andConditions.push({ year: Number(year) });
  }

  if (classId || sectionId) {
    andConditions.push({
      enrollment: {
        is: {
          ...(classId && { classId: Number(classId) }),
          ...(sectionId && { sectionId: Number(sectionId) }),
        },
      },
    });
  }

  if (searchTerm) {
    andConditions.push({
      OR: [
        {
          enrollment: {
            student: {
              fullName: { contains: searchTerm, mode: 'insensitive' },
            },
          },
        },
        {
          enrollment: {
            student: {
              admissionNumber: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
          },
        },
      ],
    });
  }

  const where: Prisma.StudentFeeWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const [data, total] = await Promise.all([
    prisma.studentFee.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
      include: {
        feeType: true,
        enrollment: {
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                admissionNumber: true,
              },
            },
            class: true,
            section: true,
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
          take: 5,
        },
      },
    }),
    prisma.studentFee.count({ where }),
  ]);

  return {
    meta: buildPaginationMeta(total, {
      page,
      limit,
      skip,
      take,
      sortBy,
      sortOrder,
    }),
    data,
  };
};

// ────────────────────────────────────────────────
// Dashboard — Monthly Snapshot Builder
// ────────────────────────────────────────────────
interface IMonthlySnapshot {
  month: number;
  year: number;
  totalStudents: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  totalPayable: number;
  totalCollected: number;
  totalDue: number;
  collectionPercentage: number;
  byFeeType: {
    feeTypeId: number;
    feeTypeName: string;
    paidCount: number;
    unpaidCount: number;
    payable: number;
    collected: number;
  }[];
}

type FeeTypeAgg = {
  feeTypeId: number;
  feeTypeName: string;
  paidCount: number;
  unpaidCount: number;
  payable: number;
  collected: number;
};

const buildMonthlySnapshot = async (
  month: number,
  year: number,
  classId?: number
): Promise<IMonthlySnapshot> => {
  const where: Prisma.StudentFeeWhereInput = {
    month,
    year,
    ...(classId && { enrollment: { is: { classId: Number(classId) } } }),
  };

  const [fees, feeTypes] = await Promise.all([
    prisma.studentFee.findMany({
      where,
      select: {
        id: true,
        status: true,
        payableAmount: true,
        paidAmount: true,
        feeTypeId: true,
      },
    }),
    prisma.feeType.findMany({ where: { isActive: true } }),
  ]);

  let totalPayable = 0;
  let totalCollected = 0;
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  const feeTypeMap = new Map<number, FeeTypeAgg>();

  for (const type of feeTypes) {
    feeTypeMap.set(type.id, {
      feeTypeId: type.id,
      feeTypeName: type.displayName,
      paidCount: 0,
      unpaidCount: 0,
      payable: 0,
      collected: 0,
    });
  }

  for (const fee of fees) {
    totalPayable += fee.payableAmount;
    totalCollected += fee.paidAmount;

    if (fee.status === 'PAID') paidCount++;
    else if (fee.status === 'PARTIAL') partialCount++;
    else unpaidCount++; // PENDING, OVERDUE, WAIVED

    const entry = feeTypeMap.get(fee.feeTypeId);
    if (entry) {
      entry.payable += fee.payableAmount;
      entry.collected += fee.paidAmount;
      if (fee.status === 'PAID') entry.paidCount++;
      else entry.unpaidCount++;
    }
  }

  const totalDue = totalPayable - totalCollected;

  return {
    month,
    year,
    totalStudents: fees.length,
    paidCount,
    partialCount,
    unpaidCount,
    totalPayable: Number(totalPayable.toFixed(2)),
    totalCollected: Number(totalCollected.toFixed(2)),
    totalDue: Number(totalDue.toFixed(2)),
    collectionPercentage:
      totalPayable > 0
        ? Number(((totalCollected / totalPayable) * 100).toFixed(2))
        : 0,
    byFeeType: Array.from(feeTypeMap.values()).filter(
      (t) => t.payable > 0 || t.paidCount > 0 || t.unpaidCount > 0
    ),
  };
};

// ────────────────────────────────────────────────
// Dashboard — Top Defaulters
// ────────────────────────────────────────────────
const getTopDefaulters = async (classId?: number, take = 10) => {
  const fees = await prisma.studentFee.findMany({
    where: {
      status: { in: ['OVERDUE', 'PARTIAL', 'PENDING'] },
      ...(classId && { enrollment: { is: { classId: Number(classId) } } }),
    },
    orderBy: [{ dueDate: 'asc' }, { payableAmount: 'desc' }],
    take,
    select: {
      id: true,
      status: true,
      payableAmount: true,
      paidAmount: true,
      dueDate: true,
      month: true,
      year: true,
      feeType: { select: { displayName: true } },
      enrollment: {
        select: {
          rollNumber: true,
          student: { select: { fullName: true, phone: true } },
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });

  return fees.map((f) => ({
    studentFeeId: f.id,
    studentName: f.enrollment.student.fullName,
    phone: f.enrollment.student.phone,
    className: f.enrollment.class.name,
    sectionName: f.enrollment.section.name,
    rollNumber: f.enrollment.rollNumber,
    feeTypeName: f.feeType.displayName,
    month: f.month,
    year: f.year,
    due: Number((f.payableAmount - f.paidAmount).toFixed(2)),
    dueDate: f.dueDate,
    status: f.status,
  }));
};

// ────────────────────────────────────────────────
// Dashboard — SMS Health (fee-related SMS only)
// ────────────────────────────────────────────────
const getFeeSmsHealth = async (fromDate: Date, toDate: Date) => {
  const grouped = await prisma.smsLog.groupBy({
    by: ['type', 'status'],
    where: {
      type: { in: ['FEE_PAYMENT'] },
      createdAt: { gte: fromDate, lte: toDate },
    },
    _count: { id: true },
  });

  const result = {
    FEE_PAYMENT: { PENDING: 0, SENT: 0, FAILED: 0, DELIVERED: 0 },
  };

  for (const row of grouped) {
    const type = row.type as 'FEE_PAYMENT';
    if (result[type]) {
      result[type][row.status] = row._count.id;
    }
  }

  return result;
};

// ────────────────────────────────────────────────
// Dashboard Summary — Current vs Previous Month
// ────────────────────────────────────────────────
const getDashboardSummary = async (filters: IFeeDashboardFilter = {}) => {
  const { classId } = filters;

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // JS months are 0-indexed
  const currentYear = now.getFullYear();

  const prevDate = new Date(currentYear, currentMonth - 2, 1);
  const previousMonth = prevDate.getMonth() + 1;
  const previousYear = prevDate.getFullYear();

  const startOfCurrentMonth = new Date(currentYear, currentMonth - 1, 1);
  const endOfCurrentMonth = new Date(
    currentYear,
    currentMonth,
    0,
    23,
    59,
    59,
    999
  );

  const [current, previous, topDefaulters, smsHealth] = await Promise.all([
    buildMonthlySnapshot(currentMonth, currentYear, classId),
    buildMonthlySnapshot(previousMonth, previousYear, classId),
    getTopDefaulters(classId, 10),
    getFeeSmsHealth(startOfCurrentMonth, endOfCurrentMonth),
  ]);

  return {
    current,
    previous,
    comparison: {
      collectedChange: Number(
        (current.totalCollected - previous.totalCollected).toFixed(2)
      ),
      collectedChangePercentage:
        previous.totalCollected > 0
          ? Number(
              (
                ((current.totalCollected - previous.totalCollected) /
                  previous.totalCollected) *
                100
              ).toFixed(2)
            )
          : null,
      paidCountChange: current.paidCount - previous.paidCount,
    },
    topDefaulters,
    smsHealth,
  };
};

function buildPaymentSms(params: {
  studentName: string;
  feeName: string;
  amount: number;
  paidAmount: number;
  payableAmount: number;
  status: string;
  month: number | null;
  year: number | null;
  className: string;
  sectionName: string;
  roll: number;
}) {
  const monthText =
    params.month && params.year ? ` (${params.month}/${params.year})` : '';
  const remaining = (params.payableAmount - params.paidAmount).toFixed(0);

  return `Dear Guardian, payment of Tk. ${params.amount} has been received for ${params.studentName} (${params.className}-${params.sectionName}, Roll: ${params.roll}) against ${params.feeName}${monthText}. Total paid: Tk. ${params.paidAmount}. Remaining: Tk. ${remaining}. Thank you. - Mother Care School`;
}

export const FeeService = {
  createFeeType,
  getAllFeeTypes,
  createFeeStructure,
  generateMonthlyFees,
  recordPayment,
  getStudentFees,
  getDashboardSummary,
};