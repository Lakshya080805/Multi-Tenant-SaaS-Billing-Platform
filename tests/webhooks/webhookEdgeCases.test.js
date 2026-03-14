import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../setup/testApp.js';
import { paymentModel } from '../../src/models/paymentModel.js';
import { invoiceModel } from '../../src/models/invoiceModel.js';

async function createAuthContext() {
	const email = `webhook-${Date.now()}@test.com`;
	const password = 'Test@1234';

	const registerRes = await request(app)
		.post('/api/v1/auth/register')
		.send({
			email,
			password,
			organizationName: 'Webhook Org',
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
			name: 'Webhook Test Client',
			email: `client-${Date.now()}@test.com`
		});

	return res.body.data;
}

async function createSentInvoice(token, clientId, invoiceNumber = `INV-WH-${Date.now()}`) {
	const createRes = await request(app)
		.post('/api/v1/invoices')
		.set('Authorization', `Bearer ${token}`)
		.send({
			clientId,
			invoiceNumber,
			issueDate: '2026-03-14',
			dueDate: '2026-03-20',
			lineItems: [
				{
					description: 'Webhook service',
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

describe('Payment webhook edge cases', () => {
	test('webhook with missing invoiceId metadata should return 400', async () => {
		const response = await request(app)
			.post('/api/v1/webhooks/payment')
			.send({
				id: `evt-missing-invoice-${Date.now()}`,
				type: 'payment.succeeded',
				data: {
					metadata: {
						organizationId: 'org_123',
						paymentId: 'pay_123'
					}
				}
			});

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Missing invoiceId metadata/i);
	});

	test('webhook with unknown invoiceId should return 404', async () => {
		const { organizationId } = await createAuthContext();

		const response = await request(app)
			.post('/api/v1/webhooks/payment')
			.send({
				id: `evt-unknown-invoice-${Date.now()}`,
				type: 'payment.succeeded',
				data: {
					metadata: {
						invoiceId: 'inv_unknown_123',
						organizationId,
						paymentId: 'pay_unknown_123'
					}
				}
			});

		expect(response.status).toBe(404);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Invoice not found/i);
	});

	test('duplicate webhook event should be ignored (idempotency)', async () => {
		const { token, organizationId } = await createAuthContext();
		const client = await createClient(token);
		const invoice = await createSentInvoice(token, client.id);

		const payment = await paymentModel.create({
			id: uuid(),
			organizationId,
			invoiceId: invoice.id,
			amount: invoice.total,
			currency: invoice.currency,
			status: 'pending',
			provider: 'mock'
		});

		const eventId = `evt-duplicate-${Date.now()}`;
		const payload = {
			id: eventId,
			type: 'payment.succeeded',
			data: {
				metadata: {
					invoiceId: invoice.id,
					organizationId,
					paymentId: payment.id
				}
			}
		};

		const firstResponse = await request(app)
			.post('/api/v1/webhooks/payment')
			.send(payload);

		const secondResponse = await request(app)
			.post('/api/v1/webhooks/payment')
			.send(payload);

		expect(firstResponse.status).toBe(200);
		expect(firstResponse.body.success).toBe(true);
		expect(firstResponse.body.data.received).toBe(true);

		expect(secondResponse.status).toBe(200);
		expect(secondResponse.body.success).toBe(true);
		expect(secondResponse.body.data.duplicate).toBe(true);
	});

	test('payment success event should mark invoice as paid', async () => {
		const { token, organizationId } = await createAuthContext();
		const client = await createClient(token);
		const invoice = await createSentInvoice(token, client.id);

		const payment = await paymentModel.create({
			id: uuid(),
			organizationId,
			invoiceId: invoice.id,
			amount: invoice.total,
			currency: invoice.currency,
			status: 'pending',
			provider: 'mock'
		});

		const response = await request(app)
			.post('/api/v1/webhooks/payment')
			.send({
				id: `evt-success-${Date.now()}`,
				type: 'payment.succeeded',
				data: {
					metadata: {
						invoiceId: invoice.id,
						organizationId,
						paymentId: payment.id
					}
				}
			});

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);

		const updatedInvoice = await invoiceModel.findById(invoice.id, organizationId);
		const updatedPayment = await paymentModel.findById(payment.id);

		expect(updatedInvoice.status).toBe('paid');
		expect(updatedPayment.status).toBe('succeeded');
	});

	test('payment failure event should mark payment status as failed', async () => {
		const { token, organizationId } = await createAuthContext();
		const client = await createClient(token);
		const invoice = await createSentInvoice(token, client.id);

		const payment = await paymentModel.create({
			id: uuid(),
			organizationId,
			invoiceId: invoice.id,
			amount: invoice.total,
			currency: invoice.currency,
			status: 'pending',
			provider: 'mock'
		});

		const response = await request(app)
			.post('/api/v1/webhooks/payment')
			.send({
				id: `evt-failed-${Date.now()}`,
				type: 'payment.failed',
				data: {
					metadata: {
						invoiceId: invoice.id,
						organizationId,
						paymentId: payment.id
					}
				}
			});

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);

		const updatedPayment = await paymentModel.findById(payment.id);

		expect(updatedPayment.status).toBe('failed');
	});
});
