import crypto from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
	buildWebhookDedupeKey,
	extractWebhookTimestampMs,
	isWithinReplayWindow,
	isWebhookAlreadyProcessed,
	acquireWebhookProcessingLock,
	releaseWebhookProcessingLock,
	markWebhookProcessed,
	clearWebhookRetryCount,
	handleWebhookFailure,
	recordDuplicateWebhook,
	recordReplayRejectedWebhook
} from '../services/webhookReliabilityService.js';

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
	const dedupeKey = buildWebhookDedupeKey({
		provider: 'razorpay',
		eventId,
		signature,
		payload: event
	});

	if (!eventId) {
		throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing webhook event id');
	}

	const alreadyProcessed = await isWebhookAlreadyProcessed(dedupeKey);
	if (alreadyProcessed) {
		recordDuplicateWebhook();
		return sendSuccess(res, StatusCodes.OK, { received: true, duplicate: true });
	}

	const lock = await acquireWebhookProcessingLock(dedupeKey);
	if (!lock.acquired) {
		recordDuplicateWebhook();
		return sendSuccess(res, StatusCodes.OK, { received: true, duplicate: true, inProgress: true });
	}

	try {
		const timestampMs = extractWebhookTimestampMs(event);
		if (!isWithinReplayWindow(timestampMs)) {
			recordReplayRejectedWebhook();
			throw new ApiError(StatusCodes.BAD_REQUEST, 'Webhook event is outside replay window');
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

		await markWebhookProcessed(dedupeKey);
		await clearWebhookRetryCount(dedupeKey);

		return sendSuccess(res, StatusCodes.OK, { received: true });
	} catch (error) {
		await handleWebhookFailure({
			dedupeKey,
			provider: 'razorpay',
			event,
			error,
			metadata: {
				razorpaySignatureHash: crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16)
			}
		});
		throw error;
	} finally {
		await releaseWebhookProcessingLock(lock);
	}
}
