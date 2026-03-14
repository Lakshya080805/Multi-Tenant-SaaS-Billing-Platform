import { jest } from '@jest/globals';

const constructEventMock = jest.fn();
const invoiceUpdateByIdMock = jest.fn();
const paymentUpdateByStripePiMock = jest.fn();

await jest.unstable_mockModule('../../src/config/env.js', () => ({
	env: {
		STRIPE_WEBHOOK_SECRET: 'whsec_test'
	}
}));

await jest.unstable_mockModule('../../src/config/logger.js', () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn()
	}
}));

await jest.unstable_mockModule('../../src/config/stripe.js', () => ({
	stripe: {
		webhooks: {
			constructEvent: constructEventMock
		}
	}
}));

await jest.unstable_mockModule('../../src/models/invoiceModel.js', () => ({
	invoiceModel: {
		updateById: invoiceUpdateByIdMock
	}
}));

await jest.unstable_mockModule('../../src/models/paymentModel.js', () => ({
	paymentModel: {
		updateByStripePaymentIntentId: paymentUpdateByStripePiMock
	}
}));

const { handleStripeWebhook } = await import('../../src/webhooks/stripeWebhook.js');

function createReqRes(signature = 't=1,v1=test-signature', rawBody = '{"id":"evt_test"}') {
	const req = {
		headers: {
			'stripe-signature': signature
		},
		rawBody
	};

	const res = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis()
	};

	return { req, res };
}

describe('Stripe webhook endpoint handler', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		invoiceUpdateByIdMock.mockResolvedValue({ id: 'inv_1' });
		paymentUpdateByStripePiMock.mockResolvedValue({ id: 'pay_1' });
	});

	test('valid webhook signature', async () => {
		constructEventMock.mockReturnValue({
			id: 'evt_valid_signature_1',
			type: 'customer.created',
			data: { object: {} }
		});

		const { req, res } = createReqRes();

		await handleStripeWebhook(req, res);

		expect(constructEventMock).toHaveBeenCalledWith(
			req.rawBody,
			req.headers['stripe-signature'],
			'whsec_test'
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ received: true });
	});

	test('invalid webhook signature', async () => {
		constructEventMock.mockImplementation(() => {
			throw new Error('Invalid signature');
		});

		const { req, res } = createReqRes();

		await handleStripeWebhook(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.stringContaining('Webhook signature verification failed')
			})
		);
	});

	test('duplicate webhook event ignored', async () => {
		const event = {
			id: 'evt_duplicate_1',
			type: 'payment_intent.succeeded',
			data: {
				object: {
					id: 'pi_123',
					metadata: {
						invoiceId: 'inv_123',
						organizationId: 'org_123'
					}
				}
			}
		};
		constructEventMock.mockReturnValue(event);

		const firstCall = createReqRes();
		const secondCall = createReqRes();

		await handleStripeWebhook(firstCall.req, firstCall.res);
		await handleStripeWebhook(secondCall.req, secondCall.res);

		expect(firstCall.res.status).toHaveBeenCalledWith(200);
		expect(firstCall.res.json).toHaveBeenCalledWith({ received: true });

		expect(secondCall.res.status).toHaveBeenCalledWith(200);
		expect(secondCall.res.json).toHaveBeenCalledWith({ received: true, duplicate: true });

		expect(invoiceUpdateByIdMock).toHaveBeenCalledTimes(1);
		expect(paymentUpdateByStripePiMock).toHaveBeenCalledTimes(1);
	});

	test('payment success updates invoice', async () => {
		constructEventMock.mockReturnValue({
			id: 'evt_payment_success_1',
			type: 'payment_intent.succeeded',
			data: {
				object: {
					id: 'pi_success_1',
					metadata: {
						invoiceId: 'inv_success_1',
						organizationId: 'org_success_1'
					}
				}
			}
		});

		const { req, res } = createReqRes();

		await handleStripeWebhook(req, res);

		expect(invoiceUpdateByIdMock).toHaveBeenCalledWith(
			'inv_success_1',
			'org_success_1',
			expect.objectContaining({ status: 'paid', paidAt: expect.any(Date) })
		);
		expect(paymentUpdateByStripePiMock).toHaveBeenCalledWith('pi_success_1', {
			status: 'succeeded'
		});
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ received: true });
	});
});
