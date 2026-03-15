import { StatusCodes } from 'http-status-codes';
import { paymentService } from '../services/paymentService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const paymentController = {
  createOrder: async (req, res) => {
    const organizationId = req.user.organizationId;
    const { invoiceId } = req.body;

    const order = await paymentService.createPaymentForInvoice(invoiceId, organizationId);

    sendSuccess(res, StatusCodes.OK, order);
  },

  verifyPayment: async (req, res) => {
    const organizationId = req.user.organizationId;
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    const payment = await paymentService.verifyRazorpayPayment(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      organizationId
    );

    sendSuccess(res, StatusCodes.OK, payment);
  },

  createInvoicePayment: async (req, res) => {
    const organizationId = req.user.organizationId;
    const { invoiceId } = req.params;

    const payment = await paymentService.createPaymentForInvoice(invoiceId, organizationId);

    sendSuccess(res, StatusCodes.OK, payment);
  },

  getInvoicePayments: async (req, res) => {
    const organizationId = req.user.organizationId;
    const { invoiceId } = req.params;

    const payments = await paymentService.getPaymentsForInvoice(invoiceId, organizationId);

    sendSuccess(res, StatusCodes.OK, { payments });
  }
};

