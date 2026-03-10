import express from 'express';
import { stripeWebhookMiddleware } from '../../middleware/stripeWebhookMiddleware.js';
import { handleStripeWebhook } from '../../webhooks/stripeWebhook.js';

export const webhookRouter = express.Router();

// Stripe signature verification requires the raw request body,
// so stripeWebhookMiddleware must run before handleStripeWebhook.
// No authentication middleware is applied to this route.
webhookRouter.post('/stripe', stripeWebhookMiddleware, handleStripeWebhook);
