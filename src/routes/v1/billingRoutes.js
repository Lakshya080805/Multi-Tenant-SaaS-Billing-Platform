import express from 'express';
import { billingController } from '../../controllers/billingController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { withOrganization } from '../../middleware/orgMiddleware.js';
import { stripeWebhookMiddleware } from '../../middleware/stripeWebhookMiddleware.js';

export const billingRouter = express.Router();

billingRouter.post('/webhook', stripeWebhookMiddleware, billingController.handleWebhook);

billingRouter.use(authenticate, withOrganization);

billingRouter.post('/checkout-session', billingController.createCheckoutSession);
billingRouter.get('/subscriptions', billingController.listSubscriptions);
