import crypto from 'crypto';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../setup/testApp.js';
import { paymentModel } from '../../src/models/paymentModel.js';
import { invoiceModel } from '../../src/models/invoiceModel.js';

async function createAuthContext() {
	const email = `razorpay-webhook-${Date.now()}@test.com`;
	const password = 'Test@1234';

	const registerRes = await request(app)
		.post('/api/v1/auth/register')
		.send({
			email,
			password,
			organizationName: 'Razorpay Webhook Org',
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
			name: 'Razorpay Webhook Client',
			email: `client-${Date.now()}@test.com`
		});

	return res.body.data;
}

async function createSentInvoice(token, clientId, invoiceNumber = `INV-RZP-WH-${Date.now()}`) {
	const createRes = await request(app)
		.post('/api/v1/invoices')
		.set('Authorization', `Bearer ${token}`)
		.send({
			clientId,
			invoiceNumber,
			issueDate: '2026-03-15',
			dueDate: '2026-03-25',
			lineItems: [
				{
					description: 'Razorpay webhook service',
					quantity: 1,
					unitPrice: 1499,
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

function signPayload(rawBody, secret) {
	return crypto
		.createHmac('sha256', secret)
		.update(rawBody)
		.digest('hex');
}

describe('Razorpay webhook integration', () => {
	const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
	const webhookSecret = 'rzp_webhook_secret_test';

	beforeAll(() => {
		process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
	});

	afterAll(() => {
		if (originalWebhookSecret === undefined) {
			delete process.env.RAZORPAY_WEBHOOK_SECRET;
			return;
		}

		process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
	});

	test('valid payment.captured webhook updates payment status to succeeded and marks invoice as paid', async () => {
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

		const payload = {
			id: `evt_capture_${Date.now()}`,
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

		const rawBody = JSON.stringify(payload);
		const signature = signPayload(rawBody, webhookSecret);

		const response = await request(app)
			.post('/api/v1/webhooks/razorpay')
			.set('Content-Type', 'application/json')
			.set('x-razorpay-signature', signature)
			.send(rawBody);

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.received).toBe(true);

		const updatedPayment = await paymentModel.findById(payment.id);
		const updatedInvoice = await invoiceModel.findById(invoice.id, organizationId);

		expect(updatedPayment.status).toBe('succeeded');
		expect(updatedInvoice.status).toBe('paid');
		expect(updatedInvoice.paidAt).toBeTruthy();
	});

	test('invalid webhook signature returns 400', async () => {
		const payload = {
			id: `evt_invalid_signature_${Date.now()}`,
			event: 'payment.captured',
			payload: {
				payment: {
					entity: {
						id: `pay_${uuid()}`,
						order_id: `order_${uuid()}`
					}
				}
			}
		};

		const response = await request(app)
			.post('/api/v1/webhooks/razorpay')
			.set('Content-Type', 'application/json')
			.set('x-razorpay-signature', 'invalid_signature')
			.send(JSON.stringify(payload));

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Invalid Razorpay webhook signature/i);
	});

	test('duplicate webhook event does not process payment twice', async () => {
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

		const duplicateEventId = `evt_duplicate_${Date.now()}`;

		const firstPayload = {
			id: duplicateEventId,
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
			id: duplicateEventId,
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

		const firstRawBody = JSON.stringify(firstPayload);
		const secondRawBody = JSON.stringify(secondPayload);

		const firstSignature = signPayload(firstRawBody, webhookSecret);
		const secondSignature = signPayload(secondRawBody, webhookSecret);

		const firstResponse = await request(app)
			.post('/api/v1/webhooks/razorpay')
			.set('Content-Type', 'application/json')
			.set('x-razorpay-signature', firstSignature)
			.send(firstRawBody);

		const secondResponse = await request(app)
			.post('/api/v1/webhooks/razorpay')
			.set('Content-Type', 'application/json')
			.set('x-razorpay-signature', secondSignature)
			.send(secondRawBody);

		expect(firstResponse.status).toBe(200);
		expect(firstResponse.body.success).toBe(true);
		expect(firstResponse.body.data.received).toBe(true);

		expect(secondResponse.status).toBe(200);
		expect(secondResponse.body.success).toBe(true);
		expect(secondResponse.body.data.duplicate).toBe(true);

		const updatedPayment = await paymentModel.findById(payment.id);
		const updatedInvoice = await invoiceModel.findById(invoice.id, organizationId);

		expect(updatedPayment.status).toBe('succeeded');
		expect(updatedInvoice.status).toBe('paid');
	});
});
