// import { stripe } from '../config/stripe.js';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { invoiceModel } from '../models/invoiceModel.js';
import { paymentModel } from '../models/paymentModel.js';

/**
 * Handles incoming Stripe webhook events.
 * Requires the raw request body to be available at req.rawBody
 * (populated by stripeWebhookMiddleware before this handler runs).
 */
export async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    logger.warn('Stripe webhook received without a signature header');
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    logger.error('STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Verify the event signature using the raw body
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn(`Stripe webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  logger.info(`Stripe webhook received: ${event.type} [${event.id}]`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      }

      default:
        logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err) {
    logger.error(`Error processing Stripe webhook event ${event.type} [${event.id}]: ${err.message}`);
    // Return 500 so Stripe retries the event
    return res.status(500).json({ error: 'Internal error while processing webhook event' });
  }

  return res.status(200).json({ received: true });
}

/**
 * Handles the payment_intent.succeeded event.
 * Updates the associated invoice status to 'paid' and
 * the associated payment record status to 'succeeded'.
 *
 * @param {import('stripe').Stripe.PaymentIntent} paymentIntent
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const { invoiceId, organizationId } = paymentIntent.metadata ?? {};

  if (!invoiceId || !organizationId) {
    logger.warn(
      `payment_intent.succeeded [${paymentIntent.id}] is missing invoiceId or organizationId in metadata`
    );
    return;
  }

  logger.info(
    `Processing payment_intent.succeeded for invoice ${invoiceId} (org: ${organizationId})`
  );

  // Update invoice status to 'paid'
  const updatedInvoice = await invoiceModel.updateById(invoiceId, organizationId, {
    status: 'paid'
  });

  if (!updatedInvoice) {
    logger.warn(`Invoice ${invoiceId} not found for organization ${organizationId} — skipping update`);
  } else {
    logger.info(`Invoice ${invoiceId} marked as paid`);
  }

  // Update payment record status to 'succeeded'
  const updatedPayment = await paymentModel.updateByStripePaymentIntentId(
    paymentIntent.id,
    { status: 'succeeded' }
  );

  if (!updatedPayment) {
    logger.warn(`Payment record for Stripe PaymentIntent ${paymentIntent.id} not found — skipping update`);
  } else {
    logger.info(`Payment record for PaymentIntent ${paymentIntent.id} marked as succeeded`);
  }
}
