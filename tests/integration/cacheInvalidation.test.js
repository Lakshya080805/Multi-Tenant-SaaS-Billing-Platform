import request from 'supertest';
import app from '../setup/testApp.js';
import '../setup/testDatabase.js';

describe('Cache Invalidation - Stale Read Prevention', () => {
  const testEmail = 'cache.invalidation@test.com';
  const testPassword = 'Test@1234';
  const organizationName = 'Cache Test Org';
  let authToken;
  let clientId;

  beforeEach(async () => {
    // Register user and create organization
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        organizationName,
        role: 'admin'
      });

    authToken = registerResponse.body.data.accessToken;

    // Create a client for invoice tests
    const clientResponse = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Client',
        email: 'client@test.com',
        company: 'Test Company'
      });

    clientId = clientResponse.body.data.id;
  });

  describe('Invoice Cache Invalidation', () => {
    it('should invalidate cache when creating an invoice', async () => {
      // Warm list path first
      const beforeListResponse = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(beforeListResponse.status).toBe(200);
      const beforeCount = beforeListResponse.body.data.length;

      // Create an invoice
      const createResponse = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId,
          invoiceNumber: 'INV-001',
          status: 'draft',
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lineItems: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 1000,
              taxRate: 18
            }
          ]
        });

      expect(createResponse.status).toBe(201);
      const invoiceId = createResponse.body.data.id;

      // Fetch list again - should include newly created invoice
      const afterListResponse = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(afterListResponse.status).toBe(200);
      expect(afterListResponse.body.data.length).toBe(beforeCount + 1);
      expect(afterListResponse.body.data.some((invoice) => invoice.id === invoiceId)).toBe(true);
    });

    it('should invalidate cache when updating an invoice', async () => {
      // Create an invoice
      const createResponse = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId,
          invoiceNumber: 'INV-UPDATE',
          status: 'draft',
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lineItems: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 1000,
              taxRate: 18
            }
          ]
        });

      const invoiceId = createResponse.body.data.id;

      // Warm list path before write
      const beforeListResponse = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(beforeListResponse.status).toBe(200);

      // Update the invoice
      const updateResponse = await request(app)
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoiceNumber: 'INV-UPDATED'
        });

      expect(updateResponse.status).toBe(200);

      // Fetch list again - should show updated data, not stale value
      const listResponse = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      const updatedInvoice = listResponse.body.data.find((invoice) => invoice.id === invoiceId);
      expect(updatedInvoice).toBeDefined();
      expect(updatedInvoice.invoiceNumber).toBe('INV-UPDATED');
    });

    it('should invalidate cache when deleting an invoice', async () => {
      // Create an invoice
      const createResponse = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId,
          invoiceNumber: 'INV-DELETE',
          status: 'draft',
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lineItems: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 1000,
              taxRate: 18
            }
          ]
        });

      const invoiceId = createResponse.body.data.id;

      // Warm list path before delete
      const beforeListResponse = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(beforeListResponse.status).toBe(200);
      expect(beforeListResponse.body.data.some((invoice) => invoice.id === invoiceId)).toBe(true);

      // Delete the invoice
      const deleteResponse = await request(app)
        .delete(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(204);

      // Fetch list again - should not include deleted invoice
      const listResponse = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.some((invoice) => invoice.id === invoiceId)).toBe(false);
    });
  });

  describe('Client Cache Invalidation', () => {
    it('should invalidate cache when creating a client', async () => {
      // Warm list path first
      const beforeListResponse = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${authToken}`);

      expect(beforeListResponse.status).toBe(200);
      const beforeCount = beforeListResponse.body.data.length;

      // Create a client
      const createResponse = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Client',
          email: 'newclient@test.com',
          company: 'New Company'
        });

      expect(createResponse.status).toBe(201);
      const newClientId = createResponse.body.data.id;

      // Fetch list again - should include newly created client
      const listResponse = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data.length).toBe(beforeCount + 1);
      expect(listResponse.body.data.some((client) => client.id === newClientId)).toBe(true);
    });

    it('should invalidate cache when updating a client', async () => {
      // Warm list path before write
      const beforeListResponse = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${authToken}`);

      expect(beforeListResponse.status).toBe(200);

      // Update existing client
      const updateResponse = await request(app)
        .patch(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Client Name'
        });

      expect(updateResponse.status).toBe(200);

      // Fetch list again - should show updated data
      const listResponse = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${authToken}`);

      expect(listResponse.status).toBe(200);
      const updatedClient = listResponse.body.data.find((client) => client.id === clientId);
      expect(updatedClient).toBeDefined();
      expect(updatedClient.name).toBe('Updated Client Name');
    });
  });

  describe('Payment Cache Invalidation', () => {
    it('should reflect paid status in list after payment write', async () => {
      const createResponse = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clientId,
          invoiceNumber: 'INV-PAY-001',
          status: 'draft',
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lineItems: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 1000,
              taxRate: 18
            }
          ]
        });

      expect(createResponse.status).toBe(201);
      const invoiceId = createResponse.body.data.id;

      // Warm invoices list before payment write
      const beforePayList = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(beforePayList.status).toBe(200);

      const payResponse = await request(app)
        .post(`/api/v1/payments/invoice/${invoiceId}/pay`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(payResponse.status).toBe(200);

      const detailAfterPay = await request(app)
        .get(`/api/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailAfterPay.status).toBe(200);

      const afterPayList = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(afterPayList.status).toBe(200);
      const paidInvoice = afterPayList.body.data.find((invoice) => invoice.id === invoiceId);
      expect(paidInvoice).toBeDefined();
      expect(paidInvoice.status).toBe(detailAfterPay.body.data.status);
    });
  });

  describe('Cache Metrics', () => {
    it('should provide cache metrics endpoint', async () => {
      // Get cache metrics
      const metricsResponse = await request(app)
        .get('/metrics/cache')
        .set('Authorization', `Bearer ${authToken}`);

      expect(metricsResponse.status).toBe(200);
      const metrics = metricsResponse.body.metrics;

      // Verify metrics structure
      expect(metrics).toHaveProperty('reads');
      expect(metrics).toHaveProperty('writes');
      expect(metrics).toHaveProperty('deletes');
      expect(metrics).toHaveProperty('directHitRatio');
    });
  });
});
