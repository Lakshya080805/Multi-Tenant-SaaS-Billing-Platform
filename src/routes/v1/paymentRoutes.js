import express from 'express';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/roleMiddleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { paymentController } from '../../controllers/paymentController.js';

export const paymentRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment management
 */

paymentRouter.use(authenticate);

/**
 * @swagger
 * /v1/payments/invoice/{invoiceId}/pay:
 *   post:
 *     summary: Record a payment for an invoice
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, method]
 *             properties:
 *               amount:
 *                 type: number
 *               method:
 *                 type: string
 *                 enum: [cash, bank_transfer, card, cheque]
 *               note:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment recorded
 *       404:
 *         description: Invoice not found
 */
paymentRouter.post(
  '/invoice/:invoiceId/pay',
  requireRole('admin', 'accountant'),
  asyncHandler(paymentController.createInvoicePayment)
);

/**
 * @swagger
 * /v1/payments/invoice/{invoiceId}/payments:
 *   get:
 *     summary: Get all payments for an invoice
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of payments
 *       404:
 *         description: Invoice not found
 */
paymentRouter.get(
  '/invoice/:invoiceId/payments',
  requireRole('admin', 'accountant', 'viewer'),
  asyncHandler(paymentController.getInvoicePayments)
);

