import { v4 as uuid } from 'uuid';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../config/logger.js';
import { getProvider } from '../providers/index.js';
import { invalidateInvoiceRelatedCache } from './cacheService.js';
import { withPaymentTransitionLock } from './paymentSafetyService.js';
import mongoose from 'mongoose';

const paymentProvider = process.env.PAYMENT_PROVIDER || 'mock';
const razorpayKey = process.env.RAZORPAY_KEY_ID;

export const paymentService = {
  async createPaymentForInvoice(invoiceId, organizationId) {
    return withPaymentTransitionLock({ organizationId, invoiceId }, async () => {
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

      if (paymentProvider === 'razorpay' && currency !== 'INR') {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          `Razorpay create-order requires INR currency for this setup. Invoice currency is ${currency}`
        );
      }

      // Get the configured payment provider
      const provider = getProvider(paymentProvider);

      // Create order via provider
      let order;
      try {
        order = await provider.createOrder(amount, currency, invoice.id);
      } catch (error) {
        const providerMessage =
          error?.error?.description ||
          error?.description ||
          error?.message ||
          'Failed to create payment order';

        logger.error('Payment provider create-order failed', {
          provider: paymentProvider,
          invoiceId: invoice.id,
          organizationId,
          amount,
          currency,
          providerMessage
        });

        if (paymentProvider === 'razorpay') {
          throw new ApiError(StatusCodes.BAD_REQUEST, `Razorpay order creation failed: ${providerMessage}`);
        }

        throw error;
      }

      // Create payment record with provider-specific order ID
      const paymentData = {
        id: uuid(),
        organizationId,
        invoiceId: invoice.id,
        amount,
        currency,
        status: paymentProvider === 'razorpay' ? 'pending' : 'succeeded',
        provider: paymentProvider
      };

      // Store provider-specific order ID
      if (paymentProvider === 'razorpay') {
        paymentData.razorpayOrderId = order.id;
      }

      const payment = await paymentModel.create(paymentData);

      logger.info(`${paymentProvider} order created`, {
        paymentId: payment.id,
        invoiceId: invoice.id,
        organizationId,
        orderId: order.id,
        amount,
        currency,
        provider: paymentProvider
      });

      // For Razorpay, return order details for client-side payment widget
      if (paymentProvider === 'razorpay') {
        return {
          orderId: order.id,
          amount: order.amount,
          currency,
          razorpayKey
        };
      }

      // For mock provider, auto-confirm payment and mark invoice as paid
      await invoiceModel.updateById(invoice.id, organizationId, {
        status: 'paid',
        paidAt: new Date()
      });

      logger.info('Invoice marked as paid', { invoiceId: invoice.id, organizationId });

      // Invalidate invoice-related cache for mock provider payment
      await invalidateInvoiceRelatedCache(organizationId, { action: 'createPaymentForInvoice', invoiceId: invoice.id, provider: 'mock' });

      return payment;
    });
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
    return withPaymentTransitionLock({ organizationId, razorpayOrderId }, async () => {
      // Get the Razorpay provider for signature verification
      const provider = getProvider('razorpay');

      // Verify the payment signature via provider
      await provider.verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);

      const payment = await paymentModel.findByRazorpayOrderId(razorpayOrderId);

      if (!payment || payment.organizationId !== organizationId) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Payment not found');
      }

      const paymentUpdate = {
        razorpayPaymentId,
        razorpaySignature,
        status: 'succeeded'
      };
      const invoiceUpdate = {
        status: 'paid',
        paidAt: new Date()
      };

      let updatedPayment;
      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          updatedPayment = await paymentModel.updateById(payment.id, paymentUpdate, { session });

          await invoiceModel.updateById(payment.invoiceId, organizationId, invoiceUpdate, { session });
        });
      } catch (error) {
        const transactionNotSupported =
          error?.codeName === 'IllegalOperation' ||
          error?.message?.includes('Transaction numbers are only allowed on a replica set member or mongos');

        if (!transactionNotSupported) {
          throw error;
        }

        // Known limitation: local standalone MongoDB does not support transactions.
        // We fall back to sequential writes for development compatibility.
        logger.warn('Mongo transactions unavailable; falling back to sequential payment verify updates', {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          organizationId
        });

        updatedPayment = await paymentModel.updateById(payment.id, paymentUpdate);
        await invoiceModel.updateById(payment.invoiceId, organizationId, invoiceUpdate);
      } finally {
        await session.endSession();
      }

      logger.info('Razorpay payment verified', {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        organizationId,
        razorpayOrderId,
        razorpayPaymentId
      });

      // Invalidate invoice-related cache after Razorpay payment verification
      await invalidateInvoiceRelatedCache(organizationId, { action: 'verifyRazorpayPayment', invoiceId: payment.invoiceId, paymentId: payment.id });

      return updatedPayment;
    });
  }
};

