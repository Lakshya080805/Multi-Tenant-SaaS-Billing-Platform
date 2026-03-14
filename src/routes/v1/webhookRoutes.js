import express from 'express';
import { stripeWebhookMiddleware } from '../../middleware/stripeWebhookMiddleware.js';
import { handleStripeWebhook } from '../../webhooks/stripeWebhook.js';
import { handlePaymentWebhook } from '../../webhooks/paymentWebhook.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const webhookRouter = express.Router();

// Stripe signature verification requires the raw request body,
// so stripeWebhookMiddleware must run before handleStripeWebhook.
// No authentication middleware is applied to this route.
webhookRouter.post('/stripe', stripeWebhookMiddleware, handleStripeWebhook);

// Mock provider webhook endpoint that accepts JSON payloads.
webhookRouter.post('/payment', asyncHandler(handlePaymentWebhook));
