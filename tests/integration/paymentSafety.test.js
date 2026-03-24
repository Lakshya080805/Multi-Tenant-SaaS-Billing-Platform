import request from 'supertest';
import app from '../setup/testApp.js';
import { paymentModel } from '../../src/models/paymentModel.js';

describe('Payment Safety', () => {
  let previousProvider;

  beforeAll(() => {
    previousProvider = process.env.PAYMENT_PROVIDER;
    process.env.PAYMENT_PROVIDER = 'mock';
  });

  afterAll(() => {
    if (previousProvider === undefined) {
      delete process.env.PAYMENT_PROVIDER;
      return;
    }

    process.env.PAYMENT_PROVIDER = previousProvider;
  });

  async function setupInvoice() {
    const email = `payment-safety-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const password = 'Test@1234';

    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        organizationName: 'Payment Safety Org',
        role: 'admin'
      });

    expect(registerRes.status).toBe(201);

    const token = registerRes.body.data.accessToken;

    const clientRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Safety Client',
        email: `client-${Date.now()}@test.com`
      });

    expect(clientRes.status).toBe(201);

    const invoiceRes = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: clientRes.body.data.id,
        invoiceNumber: `INV-${Date.now()}`,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          {
            description: 'Safety service',
            quantity: 1,
            unitPrice: 1000,
            taxRate: 18
          }
        ]
      });

    expect(invoiceRes.status).toBe(201);

    return {
      token,
      organizationId: registerRes.body.data.user.organizationId,
      invoiceId: invoiceRes.body.data.id
    };
  }

  test('replays create-order response for same idempotency key', async () => {
    const { token, organizationId, invoiceId } = await setupInvoice();
    const idempotencyKey = `idem-${Date.now()}-retry`;

    const first = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ invoiceId });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const second = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ invoiceId });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotency-replayed']).toBe('true');

    const payments = await paymentModel.findByInvoice(invoiceId, organizationId);
    expect(payments).toHaveLength(1);
  });

  test('rejects key reuse with different payload', async () => {
    const firstInvoice = await setupInvoice();
    const secondInvoice = await setupInvoice();
    const idempotencyKey = `idem-${Date.now()}-payload`;

    const first = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${firstInvoice.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ invoiceId: firstInvoice.invoiceId });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${firstInvoice.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ invoiceId: secondInvoice.invoiceId });

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
  });

  test('prevents duplicate charge on concurrent pay requests', async () => {
    const { token, organizationId, invoiceId } = await setupInvoice();

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/payments/invoice/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `idem-${Date.now()}-c1`),
      request(app)
        .post(`/api/v1/payments/invoice/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', `idem-${Date.now()}-c2`)
    ]);

    const statusSet = new Set([first.status, second.status]);

    expect(statusSet.has(200)).toBe(true);
    expect(statusSet.has(400) || statusSet.has(409)).toBe(true);

    const payments = await paymentModel.findByInvoice(invoiceId, organizationId);
    expect(payments).toHaveLength(1);
  });
});
