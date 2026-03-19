import { razorpayProvider } from './razorpayProvider.js';
import { mockProvider } from './mockProvider.js';
import { logger } from '../config/logger.js';

/**
 * Get the configured payment provider
 * @param {string} providerName - Provider name from env (default: 'mock')
 * @returns {Object} Provider instance with createOrder and verifyPayment methods
 */
export function getProvider(providerName = 'mock') {
  const provider = providerName.toLowerCase();

  switch (provider) {
    case 'razorpay':
      logger.info('Using Razorpay payment provider');
      return razorpayProvider;

    case 'mock':
    default:
      logger.info('Using mock payment provider');
      return mockProvider;
  }
}

export { razorpayProvider, mockProvider };
