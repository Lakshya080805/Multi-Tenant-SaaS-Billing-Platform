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

export async function handlePaymentWebhook(req, res) {
  const event = req.body || {};
  const eventId = event.id;
  const dedupeKey = buildWebhookDedupeKey({
    provider: 'payment',
    eventId,
    signature: req.headers['x-webhook-signature'],
    payload: event
  });

  if (!eventId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing webhook event id');
  }

  const alreadyProcessed = await isWebhookAlreadyProcessed(dedupeKey);
  if (alreadyProcessed) {
    recordDuplicateWebhook();
    return sendSuccess(res, StatusCodes.OK, {
      received: true,
      duplicate: true
    });
  }

  const lock = await acquireWebhookProcessingLock(dedupeKey);
  if (!lock.acquired) {
    recordDuplicateWebhook();
    return sendSuccess(res, StatusCodes.OK, {
      received: true,
      duplicate: true,
      inProgress: true
    });
  }

  try {
    const timestampMs = extractWebhookTimestampMs(event);
    if (!isWithinReplayWindow(timestampMs)) {
      recordReplayRejectedWebhook();
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Webhook event is outside replay window');
    }

    const metadata = event.data?.metadata || {};
    const invoiceId = metadata.invoiceId;
    const organizationId = metadata.organizationId;
    const paymentId = metadata.paymentId || event.data?.payment?.id;

    if (!invoiceId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing invoiceId metadata');
    }

    if (!organizationId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing organizationId metadata');
    }

    const invoice = await invoiceModel.findById(invoiceId, organizationId);
    if (!invoice) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    }

    if (event.type === 'payment.succeeded') {
      await invoiceModel.updateById(invoiceId, organizationId, {
        status: 'paid',
        paidAt: new Date()
      });

      if (paymentId) {
        await paymentModel.updateById(paymentId, { status: 'succeeded' });
      } else {
        await paymentModel.updateLatestByInvoice(invoiceId, organizationId, {
          status: 'succeeded'
        });
      }
    }

    if (event.type === 'payment.failed') {
      if (paymentId) {
        await paymentModel.updateById(paymentId, { status: 'failed' });
      } else {
        await paymentModel.updateLatestByInvoice(invoiceId, organizationId, {
          status: 'failed'
        });
      }
    }

    await markWebhookProcessed(dedupeKey);
    await clearWebhookRetryCount(dedupeKey);

    return sendSuccess(res, StatusCodes.OK, { received: true });
  } catch (error) {
    await handleWebhookFailure({
      dedupeKey,
      provider: 'payment',
      event,
      error,
      metadata: {
        path: req.path
      }
    });
    throw error;
  } finally {
    await releaseWebhookProcessingLock(lock);
  }
}
