import crypto from 'crypto';
import razorpay from '../config/razorpay.js';

const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

export const razorpayService = {
	async createOrder(amount, currency, invoiceId) {
		const order = await razorpay.orders.create({
			amount,
			currency,
			receipt: invoiceId,
			notes: {
				invoiceId
			}
		});

		return {
			id: order.id,
			amount: order.amount
		};
	},

	verifyPaymentSignature(orderId, paymentId, receivedSignature) {
		const generatedSignature = crypto
			.createHmac('sha256', razorpayKeySecret)
			.update(`${orderId}|${paymentId}`)
			.digest('hex');

		return generatedSignature === receivedSignature;
	}
};

export default razorpayService;
