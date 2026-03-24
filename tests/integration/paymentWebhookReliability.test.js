import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../setup/testApp.js';
import '../setup/testDatabase.js';
import { paymentModel } from '../../src/models/paymentModel.js';
import { invoiceModel } from '../../src/models/invoiceModel.js';
import { resetWebhookReliabilityStateForTests } from '../../src/services/webhookReliabilityService.js';

async function bootstrapInvoiceContext() {
  const email = `payment-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const password = 'Test@1234';

  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password,
      organizationName: 'Payment Webhook Org',
      role: 'admin'
    });

  const token = registerRes.body.data.accessToken;
  const organizationId = registerRes.body.data.user.organizationId;

  const clientRes = await request(app)
    .post('/api/v1/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Webhook Payment Client',
      email: `client-${Date.now()}@test.com`
    });

  const invoiceRes = await request(app)
    .post('/api/v1/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clientRes.body.data.id,
      invoiceNumber: `INV-WEBHOOK-${Date.now()}`,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      lineItems: [
        {
          description: 'Webhook payment line item',
          quantity: 1,
          unitPrice: 1000,
          taxRate: 18
        }
      ]
    });

  const invoiceId = invoiceRes.body.data.id;

  const payment = await paymentModel.create({
    id: uuid(),
    organizationId,
    invoiceId,
    amount: invoiceRes.body.data.total,
    currency: invoiceRes.body.data.currency,
    status: 'pending',
    provider: 'mock'
  });

  return {
    organizationId,
    invoiceId,
    paymentId: payment.id
  };
}

describe('Payment webhook dedupe and replay handling', () => {
  beforeEach(() => {
    resetWebhookReliabilityStateForTests();
  });

  test('rejects replayed old payment webhook event', async () => {
    const payload = {
      id: `evt_old_${Date.now()}`,
      type: 'payment.succeeded',
      created_at: Math.floor(Date.now() / 1000) - 3600,
      data: {
        metadata: {
          invoiceId: 'inv-old',
          organizationId: 'org-old'
        }
      }
    };

    const res = await request(app)
      .post('/api/v1/webhooks/payment')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || '')).toMatch(/outside replay window/i);
  });

  test('dedupes duplicate payment webhook by event id', async () => {
    const { organizationId, invoiceId, paymentId } = await bootstrapInvoiceContext();

    const eventId = `evt_payment_dup_${Date.now()}`;
    const firstPayload = {
      id: eventId,
      type: 'payment.succeeded',
      data: {
        metadata: {
          invoiceId,
          organizationId,
          paymentId
        }
      }
    };

    const secondPayload = {
      id: eventId,
      type: 'payment.failed',
      data: {
        metadata: {
          invoiceId,
          organizationId,
          paymentId
        }
      }
    };

    const firstRes = await request(app)
      .post('/api/v1/webhooks/payment')
      .send(firstPayload);

    const secondRes = await request(app)
      .post('/api/v1/webhooks/payment')
      .send(secondPayload);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.duplicate).toBe(true);

    const payment = await paymentModel.findById(paymentId);
    const invoice = await invoiceModel.findById(invoiceId, organizationId);

    expect(payment.status).toBe('succeeded');
    expect(invoice.status).toBe('paid');
  });
});
