import { razorpayService } from '../services/razorpayService.js';
import { verifyRazorpaySignature } from '../utils/razorpayVerify.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

export const razorpayProvider = {
  name: 'razorpay',

  /**
   * Create a payment order via Razorpay
   * @param {number} amount - Amount in smallest currency unit (paise for INR)
   * @param {string} currency - Currency code (INR, USD, etc.)
   * @param {string} invoiceId - Invoice ID for receipt reference
   * @returns {Promise<{id: string, amount: number}>}
   */
  async createOrder(amount, currency, invoiceId) {
    const order = await razorpayService.createOrder(amount, currency, invoiceId);
    return {
      id: order.id,
      amount: order.amount
    };
  },

  /**
   * Verify a payment against Razorpay signature
   * @param {string} razorpayOrderId - Order ID from Razorpay
   * @param {string} razorpayPaymentId - Payment ID from Razorpay
   * @param {string} razorpaySignature - Signature for verification
   * @returns {Promise<boolean>}
   */
  async verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpaySecret) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        'Razorpay key secret is not configured'
      );
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

    return true;
  }
};

export default razorpayProvider;
