import { jest } from '@jest/globals';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import { createTestUser } from '../fixtures/userFactory.js';

process.env.PAYMENT_PROVIDER = 'razorpay';
process.env.RAZORPAY_KEY_ID = 'rzp_test_1234567890';
process.env.RAZORPAY_KEY_SECRET = 'razorpay-test-secret';

const createOrderMock = jest.fn();

jest.unstable_mockModule('../../src/services/razorpayService.js', () => ({
	razorpayService: {
		createOrder: createOrderMock
	},
	default: {
		createOrder: createOrderMock
	}
}));

const { default: app } = await import('../setup/testApp.js');
const { clientModel } = await import('../../src/models/clientModel.js');
const { invoiceModel } = await import('../../src/models/invoiceModel.js');
const { paymentModel } = await import('../../src/models/paymentModel.js');

describe('Razorpay payment order API', () => {
	beforeEach(() => {
		createOrderMock.mockReset();
	});

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

	async function seedInvoice(organizationId) {
		const clientId = uuid();
		const invoiceId = uuid();

		await clientModel.create({
			id: clientId,
			organizationId,
			name: 'Razorpay Test Client',
			email: `client-${Date.now()}@example.com`
		});

		await invoiceModel.create({
			id: invoiceId,
			organizationId,
			clientId,
			invoiceNumber: `INV-${Date.now()}`,
			status: 'sent',
			issueDate: new Date('2026-03-14T00:00:00.000Z'),
			dueDate: new Date('2026-03-21T00:00:00.000Z'),
			lineItems: [
				{
					description: 'Subscription plan',
					quantity: 1,
					unitPrice: 49900,
					taxRate: 0
				}
			],
			subtotal: 49900,
			taxTotal: 0,
			total: 49900,
			currency: 'INR'
		});

		return invoiceId;
	}

	test('valid invoice creates Razorpay order', async () => {
		createOrderMock.mockResolvedValue({
			id: 'order_Q1a2b3c4d5',
			amount: 49900
		});

		const { token, organizationId } = await registerAdmin();
		const invoiceId = await seedInvoice(organizationId);

		const response = await request(app)
			.post('/api/v1/payments/create-order')
			.set('Authorization', `Bearer ${token}`)
			.send({ invoiceId });

		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('success', true);
		expect(response.body.data).toEqual({
			orderId: 'order_Q1a2b3c4d5',
			amount: 49900,
			currency: 'INR',
			razorpayKey: 'rzp_test_1234567890'
		});
		expect(createOrderMock).toHaveBeenCalledWith(49900, 'INR', invoiceId);

		const payments = await paymentModel.findByInvoice(invoiceId, organizationId);
		expect(payments).toHaveLength(1);
		expect(payments[0]).toMatchObject({
			invoiceId,
			organizationId,
			razorpayOrderId: 'order_Q1a2b3c4d5',
			status: 'pending',
			provider: 'razorpay'
		});
	});

	test('invalid invoice returns error', async () => {
		const { token } = await registerAdmin();

		const response = await request(app)
			.post('/api/v1/payments/create-order')
			.set('Authorization', `Bearer ${token}`)
			.send({ invoiceId: 'missing-invoice-id' });

		expect(response.status).toBe(404);
		expect(response.body).toHaveProperty('success', false);
		expect(response.body).toHaveProperty('message', 'Invoice not found');
		expect(createOrderMock).not.toHaveBeenCalled();
	});

	test('unauthorized user blocked', async () => {
		const response = await request(app)
			.post('/api/v1/payments/create-order')
			.send({ invoiceId: uuid() });

		expect(response.status).toBe(401);
		expect(response.body).toHaveProperty('success', false);
		expect(response.body).toHaveProperty('message', 'Authentication required');
		expect(createOrderMock).not.toHaveBeenCalled();
	});
});
