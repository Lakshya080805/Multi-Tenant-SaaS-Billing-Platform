import crypto from 'crypto';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../setup/testApp.js';
import { createTestUser } from '../fixtures/userFactory.js';
import { clientModel } from '../../src/models/clientModel.js';
import { invoiceModel } from '../../src/models/invoiceModel.js';
import { paymentModel } from '../../src/models/paymentModel.js';

const originalRazorpaySecret = process.env.RAZORPAY_KEY_SECRET;

function signPayment(orderId, paymentId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function registerAdmin() {
  const user = createTestUser();
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      ...user,
      role: 'admin'
    });

  return {
    token: response.body.data.accessToken,
    organizationId: response.body.data.user.organizationId
  };
}

async function seedPendingRazorpayPayment(organizationId) {
  const clientId = uuid();
  const invoiceId = uuid();
  const orderId = `order_${uuid()}`;

  await clientModel.create({
    id: clientId,
    organizationId,
    name: 'Verify Payment Client',
    email: `verify-client-${Date.now()}@example.com`
  });

  await invoiceModel.create({
    id: invoiceId,
    organizationId,
    clientId,
    invoiceNumber: `INV-VERIFY-${Date.now()}`,
    status: 'sent',
    issueDate: new Date('2026-03-15T00:00:00.000Z'),
    dueDate: new Date('2026-03-25T00:00:00.000Z'),
    lineItems: [
      {
        description: 'Plan charge',
        quantity: 1,
        unitPrice: 1999,
        taxRate: 0
      }
    ],
    subtotal: 1999,
    taxTotal: 0,
    total: 1999,
    currency: 'INR'
  });

  const payment = await paymentModel.create({
    id: uuid(),
    organizationId,
    invoiceId,
    razorpayOrderId: orderId,
    amount: 1999,
    currency: 'INR',
    status: 'pending',
    provider: 'razorpay'
  });

  return { payment, invoiceId, orderId };
}

describe('Razorpay payment verify API', () => {
  const testSecret = 'rzp_key_secret_test_verify';

  beforeAll(() => {
    process.env.RAZORPAY_KEY_SECRET = testSecret;
  });

  afterAll(() => {
    if (originalRazorpaySecret === undefined) {
      delete process.env.RAZORPAY_KEY_SECRET;
      return;
    }

    process.env.RAZORPAY_KEY_SECRET = originalRazorpaySecret;
  });

  test('valid signature success', async () => {
    const { token, organizationId } = await registerAdmin();
    const { payment, invoiceId, orderId } = await seedPendingRazorpayPayment(organizationId);

    const razorpayPaymentId = `pay_${uuid()}`;
    const razorpaySignature = signPayment(orderId, razorpayPaymentId, testSecret);

    const response = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId,
        razorpaySignature
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: payment.id,
      razorpayOrderId: orderId,
      razorpayPaymentId,
      razorpaySignature,
      status: 'succeeded'
    });

    const updatedPayment = await paymentModel.findById(payment.id);
    const updatedInvoice = await invoiceModel.findById(invoiceId, organizationId);

    expect(updatedPayment.status).toBe('succeeded');
    expect(updatedPayment.razorpayPaymentId).toBe(razorpayPaymentId);
    expect(updatedPayment.razorpaySignature).toBe(razorpaySignature);
    expect(updatedInvoice.status).toBe('paid');
    expect(updatedInvoice.paidAt).toBeTruthy();
  });

  test('invalid signature returns 400', async () => {
    const { token, organizationId } = await registerAdmin();
    const { payment, orderId } = await seedPendingRazorpayPayment(organizationId);

    const response = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: `pay_${uuid()}`,
        razorpaySignature: 'invalid_signature'
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Invalid Razorpay payment signature/i);

    const unchangedPayment = await paymentModel.findById(payment.id);
    expect(unchangedPayment.status).toBe('pending');
  });

  test('payment not found for wrong org returns 404', async () => {
    const owner = await registerAdmin();
    const otherOrg = await registerAdmin();
    const { orderId } = await seedPendingRazorpayPayment(owner.organizationId);

    const razorpayPaymentId = `pay_${uuid()}`;
    const razorpaySignature = signPayment(orderId, razorpayPaymentId, testSecret);

    const response = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId,
        razorpaySignature
      });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Payment not found');
  });
});
