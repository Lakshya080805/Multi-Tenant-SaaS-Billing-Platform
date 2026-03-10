import { v4 as uuid } from 'uuid';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';

export const paymentService = {
  async createPaymentForInvoice(invoiceId, organizationId) {
    const invoice = await invoiceModel.findById(invoiceId, organizationId);

    if (!invoice) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    }

    if (invoice.status === 'paid') {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invoice is already paid');
    }

    if (!invoice.total || invoice.total <= 0) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invoice total must be greater than zero');
    }

    const amount = invoice.total;

    // const currency = (invoice.currency || 'INR').toLowerCase();

    const currency = invoice.currency || 'INR';

  //   const { clientSecret, id: paymentIntentId } = await stripeService.createPaymentIntent({
  //     amount,
  //     currency,
  //     metadata: {
  //       invoiceId: invoice.id,
  //       organizationId
  //     }
  //   });

  //   await paymentModel.create({
  //     id: uuid(),
  //     organizationId,
  //     invoiceId: invoice.id,
  //     stripePaymentIntentId: paymentIntentId,
  //     amount,
  //     currency,
  //     status: 'pending',
  //     paymentMethod: null
  //   });

  //   return { clientSecret };
  // },

  // mock payment 

  const payment = await paymentModel.create({
      id: uuid(),
      organizationId,
      invoiceId: invoice.id,
      amount,
      currency,
      status: 'succeeded',
      provider: 'mock'
    });

    logger.info('Payment created', {
      paymentId: payment.id,
      invoiceId: invoice.id,
      organizationId,
      amount,
      currency,
      provider: 'mock'
    });

    // update invoice status
    await invoiceModel.updateById(invoice.id, organizationId, {
      status: 'paid',
      paidAt: new Date()
    });

    logger.info('Invoice marked as paid', { invoiceId: invoice.id, organizationId });

    return payment;
  },

  async getPaymentsForInvoice(invoiceId, organizationId) {
    const invoice = await invoiceModel.findById(invoiceId, organizationId);

    if (!invoice) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    }

    const payments = await paymentModel.findByInvoice(invoiceId);

    return payments;
  }
};

