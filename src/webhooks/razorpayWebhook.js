import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';

const processedRazorpayEvents = new Set();

export async function handleRazorpayWebhook(req, res) {
	const signature = req.headers['x-razorpay-signature'];
	const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

	if (!signature) {
		throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing x-razorpay-signature header');
	}

	if (!webhookSecret) {
		throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'RAZORPAY_WEBHOOK_SECRET is not configured');
	}

	const rawBody = req.rawBody || JSON.stringify(req.body || {});
	const expectedSignature = crypto
		.createHmac('sha256', webhookSecret)
		.update(rawBody)
		.digest('hex');

	if (expectedSignature !== signature) {
		throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid Razorpay webhook signature');
	}

	const event = req.body || {};
	const eventId = event.id;

	if (!eventId) {
		throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing webhook event id');
	}

	if (processedRazorpayEvents.has(eventId)) {
		return sendSuccess(res, StatusCodes.OK, { received: true, duplicate: true });
	}

	const eventType = event.event;
	const paymentEntity = event.payload?.payment?.entity;
	const razorpayOrderId = paymentEntity?.order_id;

	if (!razorpayOrderId) {
		throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing Razorpay order id in webhook payload');
	}

	const payment = await paymentModel.findByRazorpayOrderId(razorpayOrderId);

	if (!payment) {
		throw new ApiError(StatusCodes.NOT_FOUND, 'Payment not found');
	}

	processedRazorpayEvents.add(eventId);

	if (eventType === 'payment.captured') {
		await paymentModel.updateByRazorpayOrderId(razorpayOrderId, {
			status: 'succeeded'
		});

		await invoiceModel.updateById(payment.invoiceId, payment.organizationId, {
			status: 'paid',
			paidAt: new Date()
		});
	}

	if (eventType === 'payment.failed') {
		await paymentModel.updateByRazorpayOrderId(razorpayOrderId, {
			status: 'failed'
		});
	}

	return sendSuccess(res, StatusCodes.OK, { received: true });
}
