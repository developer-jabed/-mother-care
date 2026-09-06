import type { FastifyRequest, FastifyReply } from 'fastify';
import { FeeService } from './fee.service.js';
import catchAsync from '../../shared/catchAsync.js';
import sendResponse from '../../shared/sendResponse.js';
import httpStatus from 'http-status';
import { generateFeeReceiptPDF } from './fee.receipt.js';
import ApiError from '../../errors/api.error.js';

const createFeeType = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.createFeeType(req.body as any);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Fee type created successfully',
      data: result,
    });
  }
);

const getAllFeeTypes = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.getAllFeeTypes();
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Fee types retrieved successfully',
      data: result,
    });
  }
);

const createFeeStructure = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.createFeeStructure(req.body as any);
    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Fee structure created successfully',
      data: result,
    });
  }
);

const generateMonthlyFees = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.generateMonthlyFees(req.body as any);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Monthly fees generated successfully',
      data: result,
    });
  }
);

const recordPayment = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.recordPayment(req.server, req.body as any);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Payment recorded successfully. SMS has been queued.',
      data: result,
    });
  }
);

const getStudentFees = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.getStudentFees(
      req.query as any,
      req.query as any
    );
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Student fees retrieved successfully',
      meta: result.meta,
      data: result.data,
    });
  }
);

const getDashboardSummary = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const result = await FeeService.getDashboardSummary(req.query as any);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Fee dashboard summary retrieved successfully',
      data: result,
    });
  }
);

const downloadReceipt = catchAsync(
  async (req: FastifyRequest, res: FastifyReply) => {
    const paymentId = Number((req.params as any).paymentId);

    if (!paymentId || Number.isNaN(paymentId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment ID');
    }

    const buffer = await generateFeeReceiptPDF(paymentId);

    res.header('Content-Type', 'application/pdf');
    res.header(
      'Content-Disposition',
      `attachment; filename="fee-receipt-${paymentId}.pdf"`
    );
    res.header('Content-Length', buffer.length);

    return res.send(buffer);
  }
);

export const FeeController = {
  createFeeType,
  getAllFeeTypes,
  createFeeStructure,
  generateMonthlyFees,
  recordPayment,
  getStudentFees,
  getDashboardSummary,
  downloadReceipt,
};