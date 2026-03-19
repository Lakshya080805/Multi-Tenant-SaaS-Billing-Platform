import { v4 as uuid } from 'uuid';

export const mockProvider = {
  name: 'mock',

  /**
   * Create a mock payment order (for testing)
   * @param {number} amount - Amount in smallest currency unit
   * @param {string} currency - Currency code
   * @param {string} invoiceId - Invoice ID for reference
   * @returns {Promise<{id: string, amount: number}>}
   */
  async createOrder(amount, currency, invoiceId) {
    // Generate a deterministic mock order ID based on invoiceId
    const mockOrderId = `mock_order_${invoiceId}_${uuid()}`;
    return {
      id: mockOrderId,
      amount
    };
  },

  /**
   * Verify a mock payment (always succeeds for testing)
   * @param {string} orderId - Order ID
   * @param {string} paymentId - Payment ID
   * @param {string} signature - Signature (ignored for mock)
   * @returns {Promise<boolean>}
   */
  async verifyPayment(orderId, paymentId, signature) {
    // Mock provider always verifies successfully
    // In tests, this allows payment flows to complete without hitting APIs
    return true;
  }
};

export default mockProvider;
