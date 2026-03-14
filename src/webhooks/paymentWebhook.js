import { StatusCodes } from 'http-status-codes';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';

const processedPaymentEvents = new Set();

export async function handlePaymentWebhook(req, res) {
  const event = req.body || {};
  const eventId = event.id;

  if (!eventId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Missing webhook event id');
  }

  if (processedPaymentEvents.has(eventId)) {
    return sendSuccess(res, StatusCodes.OK, {
      received: true,
      duplicate: true
    });
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

  processedPaymentEvents.add(eventId);

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

  return sendSuccess(res, StatusCodes.OK, { received: true });
}
