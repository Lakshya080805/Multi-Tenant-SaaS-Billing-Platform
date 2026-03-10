import { stripe } from '../config/stripe.js';

export const stripeService = {
  async createPaymentIntent({ amount, currency = 'inr', metadata = {} }) {
    const amountInMinorUnits = Math.round(Number(amount || 0) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInMinorUnits,
      currency,
      metadata
    });

    return {
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id
    };
  }
};

