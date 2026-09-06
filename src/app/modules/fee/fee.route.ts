import type { FastifyInstance } from 'fastify';
import { FeeController } from './fee.controller.js';

export default async function feeRoutes(fastify: FastifyInstance) {
  // Fee Type
  fastify.post('/fee-types', FeeController.createFeeType);
  fastify.get('/fee-types', FeeController.getAllFeeTypes);

  // Fee Structure
  fastify.post('/fee-structures', FeeController.createFeeStructure);

  // Generate Monthly Fees
  fastify.post('/fees/generate-monthly', FeeController.generateMonthlyFees);

  // Student Fees List
  fastify.get('/fees', FeeController.getStudentFees);

  fastify.post('/fees/payment', FeeController.recordPayment);

  fastify.get('/dashboard', FeeController.getDashboardSummary);

  // Receipt PDF
  fastify.get(
    '/payment/:paymentId/receipt',
    FeeController.downloadReceipt
  );
}