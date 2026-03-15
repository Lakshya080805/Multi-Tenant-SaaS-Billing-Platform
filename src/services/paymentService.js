import { v4 as uuid } from 'uuid';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { razorpayService } from './razorpayService.js';
import { verifyRazorpaySignature } from '../utils/razorpayVerify.js';

const paymentProvider = process.env.PAYMENT_PROVIDER || 'mock';
const razorpayKey = process.env.RAZORPAY_KEY_ID;

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

    const currency = invoice.currency || 'INR';

    if (paymentProvider === 'razorpay') {
      const order = await razorpayService.createOrder(amount, currency, invoice.id);

      const payment = await paymentModel.create({
        id: uuid(),
        organizationId,
        invoiceId: invoice.id,
        razorpayOrderId: order.id,
        amount,
        currency,
        status: 'pending',
        provider: 'razorpay'
      });

      logger.info('Razorpay order created', {
        paymentId: payment.id,
        invoiceId: invoice.id,
        organizationId,
        orderId: order.id,
        amount,
        currency,
        provider: 'razorpay'
      });

      return {
        orderId: order.id,
        amount: order.amount,
        currency,
        razorpayKey
      };
    }

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
  },

  async verifyRazorpayPayment(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    organizationId
  ) {
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpaySecret) {
      throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Razorpay key secret is not configured');
    }

    const isValidSignature = verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      razorpaySecret
    );

    if (!isValidSignature) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid Razorpay payment signature');
    }

    const payment = await paymentModel.findByRazorpayOrderId(razorpayOrderId);

    if (!payment || payment.organizationId !== organizationId) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Payment not found');
    }

    const updatedPayment = await paymentModel.updateById(payment.id, {
      razorpayPaymentId,
      razorpaySignature,
      status: 'succeeded'
    });

    await invoiceModel.updateById(payment.invoiceId, organizationId, {
      status: 'paid',
      paidAt: new Date()
    });

    logger.info('Razorpay payment verified', {
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      organizationId,
      razorpayOrderId,
      razorpayPaymentId
    });

    return updatedPayment;
  }
};

