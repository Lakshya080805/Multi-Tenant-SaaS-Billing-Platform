import express from 'express';
import { authRouter } from './v1/authRoutes.js';
import { orgRouter } from './v1/orgRoutes.js';
import { billingRouter } from './v1/billingRoutes.js';
import { clientRouter } from './v1/clientRoutes.js';
import { invoiceRouter } from './v1/invoiceRoutes.js';
import { paymentRouter } from './v1/paymentRoutes.js';
import { webhookRouter } from './v1/webhookRoutes.js';
import { dashboardRouter } from './v1/dashboardRoutes.js';
import { authenticate } from '../middleware/authMiddleware.js';

export const apiRouter = express.Router();

apiRouter.get("/", (req, res) => {
  res.json({
    success: true,
    message: "API v1 working 🚀"
  });
});

apiRouter.get('/protected', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Access granted',
    user: req.user
  });
});

apiRouter.use('/v1/auth', authRouter);
apiRouter.use('/v1/orgs', orgRouter);
apiRouter.use('/v1/billing', billingRouter);
apiRouter.use('/v1/clients', clientRouter);
apiRouter.use('/v1/invoices', invoiceRouter);
apiRouter.use('/v1/payments', paymentRouter);
apiRouter.use('/v1/webhooks', webhookRouter);
apiRouter.use('/v1/dashboard', dashboardRouter);

