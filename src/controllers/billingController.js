import { StatusCodes } from 'http-status-codes';
import { billingService } from '../services/billingService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const billingController = {
  async handleWebhook(req, res, next) {
    try {
      await billingService.handleWebhook(req);
      res.status(StatusCodes.OK).send();
    } catch (err) {
      next(err);
    }
  },

  async createCheckoutSession(req, res, next) {
    try {
      const session = await billingService.createCheckoutSession({
        user: req.user,
        organization: req.organization,
        body: req.body
      });
      sendSuccess(res, StatusCodes.CREATED, { url: session.url });
    } catch (err) {
      next(err);
    }
  },

  async listSubscriptions(req, res, next) {
    try {
      const subscriptions = await billingService.listSubscriptions(req.organization);
      sendSuccess(res, StatusCodes.OK, subscriptions);
    } catch (err) {
      next(err);
    }
  }
};
