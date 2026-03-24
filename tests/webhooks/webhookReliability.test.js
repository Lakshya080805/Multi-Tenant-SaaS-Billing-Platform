import crypto from 'crypto';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../setup/testApp.js';
import { paymentModel } from '../../src/models/paymentModel.js';
import { invoiceModel } from '../../src/models/invoiceModel.js';
import { resetWebhookReliabilityStateForTests } from '../../src/services/webhookReliabilityService.js';

function signPayload(rawBody, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
}

async function createAuthContext() {
  const email = `webhook-reliability-${Date.now()}@test.com`;
  const password = 'Test@1234';

  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      organizationName: 'Webhook Reliability Org',
      role: 'admin'
    });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  return {
    token: loginRes.body.data.accessToken,
    organizationId: registerRes.body.data.user.organizationId
  };
}

async function createClient(token) {
  const res = await request(app)
    .post('/api/v1/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Webhook Reliability Client',
      email: `client-${Date.now()}@test.com`
    });

  return res.body.data;
}

async function createSentInvoice(token, clientId) {
  const createRes = await request(app)
    .post('/api/v1/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId,
      invoiceNumber: `INV-RLY-${Date.now()}`,
      issueDate: '2026-03-16',
      dueDate: '2026-03-23',
      lineItems: [
        {
          description: 'Webhook reliability service',
          quantity: 1,
          unitPrice: 1000,
          taxRate: 18
        }
      ]
    });

  const invoiceId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/invoices/${invoiceId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'sent' });

  return createRes.body.data;
}

describe('Webhook reliability', () => {
  const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const webhookSecret = 'rzp_webhook_secret_reliability_test';

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  });

  beforeEach(() => {
    resetWebhookReliabilityStateForTests();
  });

  afterAll(() => {
    if (originalWebhookSecret === undefined) {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      return;
    }
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
  });

  test('replay window rejects old Razorpay event', async () => {
    const payload = {
      id: `evt_old_${Date.now()}`,
      event: 'payment.captured',
      created_at: Math.floor(Date.now() / 1000) - 3600,
      payload: {
        payment: {
          entity: {
            id: `pay_${uuid()}`,
            order_id: `order_${uuid()}`
          }
        }
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = signPayload(rawBody, webhookSecret);

    const response = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(rawBody);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/outside replay window/i);
  });

  test('duplicate Razorpay events are deduped by event id', async () => {
    const { token, organizationId } = await createAuthContext();
    const client = await createClient(token);
    const invoice = await createSentInvoice(token, client.id);

    const razorpayOrderId = `order_${uuid()}`;
    const payment = await paymentModel.create({
      id: uuid(),
      organizationId,
      invoiceId: invoice.id,
      razorpayOrderId,
      amount: invoice.total,
      currency: invoice.currency,
      status: 'pending',
      provider: 'razorpay'
    });

    const eventId = `evt_dedupe_${Date.now()}`;
    const firstPayload = {
      id: eventId,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${uuid()}`,
            order_id: razorpayOrderId
          }
        }
      }
    };

    const secondPayload = {
      id: eventId,
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_${uuid()}`,
            order_id: razorpayOrderId
          }
        }
      }
    };

    const firstRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signPayload(JSON.stringify(firstPayload), webhookSecret))
      .send(JSON.stringify(firstPayload));

    const secondRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signPayload(JSON.stringify(secondPayload), webhookSecret))
      .send(JSON.stringify(secondPayload));

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.duplicate).toBe(true);

    const updatedPayment = await paymentModel.findById(payment.id);
    const updatedInvoice = await invoiceModel.findById(invoice.id, organizationId);

    expect(updatedPayment.status).toBe('succeeded');
    expect(updatedInvoice.status).toBe('paid');
  });

  test('failed events are routed to DLQ after retry threshold', async () => {
    const eventId = `evt_missing_payment_${Date.now()}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const payload = {
        id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_${uuid()}`,
              order_id: `order_missing_${uuid()}`
            }
          }
        }
      };

      const rawBody = JSON.stringify(payload);
      const response = await request(app)
        .post('/api/v1/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signPayload(rawBody, webhookSecret))
        .send(rawBody);

      expect(response.status).toBe(404);
    }

    const dlqResponse = await request(app)
      .get('/dlq/webhooks')
      .query({ limit: 10 });

    expect(dlqResponse.status).toBe(200);
    expect(Array.isArray(dlqResponse.body.events)).toBe(true);
    expect(dlqResponse.body.events.length).toBeGreaterThan(0);

    const found = dlqResponse.body.events.find((entry) => entry.eventId === eventId);
    expect(found).toBeDefined();
    expect(found.retries).toBeGreaterThanOrEqual(3);

    const metricsResponse = await request(app).get('/metrics/webhooks');
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.metrics.dlqRouted).toBeGreaterThan(0);
    expect(metricsResponse.body.metrics.deadLetterDepth).toBeGreaterThan(0);
  });
});
