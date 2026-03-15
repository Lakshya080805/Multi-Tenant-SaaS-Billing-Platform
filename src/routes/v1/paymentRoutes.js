import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/roleMiddleware.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';
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
 * /v1/payments/create-order:
 *   post:
 *     summary: Create a Razorpay payment order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceId]
 *             properties:
 *               invoiceId:
 *                 type: string
 *                 example: inv_123456
 *     responses:
 *       200:
 *         description: Razorpay order details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                       example: order_Q1a2b3c4d5
 *                     amount:
 *                       type: number
 *                       example: 49900
 *                     currency:
 *                       type: string
 *                       example: INR
 *                     razorpayKey:
 *                       type: string
 *                       example: rzp_test_1234567890
 *       400:
 *         description: Validation failed
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Authentication required
 */
paymentRouter.post(
  '/create-order',
  [body('invoiceId').isString().notEmpty()],
  validateRequest,
  asyncHandler(paymentController.createOrder)
);

/**
 * @swagger
 * /v1/payments/verify:
 *   post:
 *     summary: Verify a Razorpay payment signature and finalize payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpayOrderId, razorpayPaymentId, razorpaySignature]
 *             properties:
 *               razorpayOrderId:
 *                 type: string
 *                 example: order_Q1a2b3c4d5
 *               razorpayPaymentId:
 *                 type: string
 *                 example: pay_Q1a2b3c4d5
 *               razorpaySignature:
 *                 type: string
 *                 example: 2d9f6c1b3a9d4e7f6c1b3a9d4e7f6c1b3a9d4e7f6c1b3a9d4e7f6c1b3a9d
 *     responses:
 *       200:
 *         description: Payment verified and updated
 *       400:
 *         description: Invalid payment signature or validation error
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Payment not found
 */

paymentRouter.post(
  '/verify',
  [
    body('razorpayOrderId').isString().notEmpty(),
    body('razorpayPaymentId').isString().notEmpty(),
    body('razorpaySignature').isString().notEmpty()
  ],
  validateRequest,
  asyncHandler(paymentController.verifyPayment)
);

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

