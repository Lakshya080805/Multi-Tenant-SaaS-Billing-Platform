// import Stripe from 'stripe';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

// const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
//   apiVersion: '2024-06-20'
// });

export const billingService = {
  async handleWebhook(req) {
    const sig = req.headers['stripe-signature'];
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Stripe webhook secret not configured');
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new ApiError(StatusCodes.BAD_REQUEST, `Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'invoice.paid':
      case 'customer.subscription.deleted':
      default:
    }
  },

  async createCheckoutSession({ user, organization, body }) {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: user.email,
      line_items: body.lineItems,
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: {
        organizationId: organization.id,
        userId: user.id
      }
    });
    return session;
  },

  async listSubscriptions(organization) {
    if (!organization.stripeCustomerId) {
      return [];
    }
    const list = await stripe.subscriptions.list({
      customer: organization.stripeCustomerId
    });
    return list.data;
  }
};
