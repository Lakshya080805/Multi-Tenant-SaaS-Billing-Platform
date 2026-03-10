import { StatusCodes } from 'http-status-codes';
import { paymentService } from '../services/paymentService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const paymentController = {
  createInvoicePayment: async (req, res) => {
    // const organizationId = req.user.organizationId;
    // const { invoiceId } = req.params;

    // const { clientSecret } = await paymentService.createPaymentForInvoice(invoiceId, organizationId);

    // sendSuccess(res, StatusCodes.CREATED, { clientSecret });

    // Mock implementation for testing without Stripe integration

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

