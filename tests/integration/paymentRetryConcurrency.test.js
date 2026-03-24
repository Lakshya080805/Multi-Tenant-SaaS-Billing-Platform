import request from 'supertest';
import app from '../setup/testApp.js';
import '../setup/testDatabase.js';
import { paymentModel } from '../../src/models/paymentModel.js';

describe('Payment retry safety under concurrent requests', () => {
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
    const email = `retry-concurrency-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const password = 'Test@1234';

    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        organizationName: 'Retry Safety Org',
        role: 'admin'
      });

    const token = register.body.data.accessToken;
    const organizationId = register.body.data.user.organizationId;

    const client = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Retry Safety Client',
        email: `client-${Date.now()}@test.com`
      });

    const invoice = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: client.body.data.id,
        invoiceNumber: `INV-RTRY-${Date.now()}`,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          {
            description: 'Retry safety item',
            quantity: 1,
            unitPrice: 1500,
            taxRate: 18
          }
        ]
      });

    return {
      token,
      organizationId,
      invoiceId: invoice.body.data.id
    };
  }

  test('concurrent retries with same idempotency key return single stored result', async () => {
    const { token, organizationId, invoiceId } = await setupInvoice();
    const idempotencyKey = `idem-concurrent-${Date.now()}`;

    const [first, second] = await Promise.all([
      request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ invoiceId }),
      request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ invoiceId })
    ]);

    const statusSet = new Set([first.status, second.status]);
    expect(statusSet.has(200)).toBe(true);
    expect(statusSet.has(409)).toBe(true);

    const successResponse = first.status === 200 ? first : second;
    expect(successResponse.body.success).toBe(true);

    const payments = await paymentModel.findByInvoice(invoiceId, organizationId);
    expect(payments).toHaveLength(1);
  });
});
