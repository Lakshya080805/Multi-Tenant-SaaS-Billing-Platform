import request from 'supertest';
import app from '../setup/testApp.js';
import '../setup/testDatabase.js';

describe('Cache behavior with Mongo fallback', () => {
  async function bootstrapTenant() {
    const email = `cache-fallback-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const password = 'Test@1234';

    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        organizationName: 'Cache Fallback Org',
        role: 'admin'
      });

    const token = registerRes.body.data.accessToken;

    const clientRes = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Cache Fallback Client',
        email: `client-${Date.now()}@test.com`
      });

    return {
      token,
      clientId: clientRes.body.data.id
    };
  }

  test('records cache misses and serves fresh reads via Mongo fallback', async () => {
    const { token, clientId } = await bootstrapTenant();

    const metricsBefore = await request(app).get('/metrics/cache');
    expect(metricsBefore.status).toBe(200);
    const baselineMisses = metricsBefore.body.metrics.misses;

    const createInvoice = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId,
        invoiceNumber: `INV-CACHE-${Date.now()}`,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        lineItems: [
          {
            description: 'Cache fallback line item',
            quantity: 1,
            unitPrice: 1000,
            taxRate: 18
          }
        ]
      });

    expect(createInvoice.status).toBe(201);
    const invoiceId = createInvoice.body.data.id;

    const firstList = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`);

    expect(firstList.status).toBe(200);
    expect(firstList.body.data.some((item) => item.id === invoiceId)).toBe(true);

    const updateInvoice = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ invoiceNumber: 'INV-CACHE-UPDATED' });

    expect(updateInvoice.status).toBe(200);

    const secondList = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`);

    expect(secondList.status).toBe(200);
    const updated = secondList.body.data.find((item) => item.id === invoiceId);
    expect(updated).toBeDefined();
    expect(updated.invoiceNumber).toBe('INV-CACHE-UPDATED');

    const metricsAfter = await request(app).get('/metrics/cache');
    expect(metricsAfter.status).toBe(200);
    expect(metricsAfter.body.metrics.misses).toBeGreaterThanOrEqual(baselineMisses + 2);
  });
});
