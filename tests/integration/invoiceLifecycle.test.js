import request from 'supertest';
import app from '../setup/testApp.js';

async function registerAndLogin() {
	const email = `lifecycle-${Date.now()}@test.com`;
	const password = 'Test@1234';

	const registerRes = await request(app)
		.post('/api/v1/auth/register')
		.send({
			email,
			password,
			organizationName: 'Lifecycle Org',
			role: 'admin'
		});

	expect(registerRes.status).toBe(201);

	const loginRes = await request(app)
		.post('/api/v1/auth/login')
		.send({ email, password });

	expect(loginRes.status).toBe(200);
	expect(loginRes.body.success).toBe(true);

	return loginRes.body.data.accessToken;
}

async function createClient(token) {
	const response = await request(app)
		.post('/api/v1/clients')
		.set('Authorization', `Bearer ${token}`)
		.send({
			name: 'Lifecycle Client',
			email: 'client.lifecycle@test.com'
		});

	expect(response.status).toBe(201);
	expect(response.body.success).toBe(true);

	return response.body.data.id;
}

async function createDraftInvoice(token, clientId, invoiceNumber = `INV-${Date.now()}`) {
	const response = await request(app)
		.post('/api/v1/invoices')
		.set('Authorization', `Bearer ${token}`)
		.send({
			clientId,
			invoiceNumber,
			issueDate: '2026-03-14',
			dueDate: '2026-03-21',
			lineItems: [
				{
					description: 'Lifecycle test service',
					quantity: 2,
					unitPrice: 100,
					taxRate: 10
				}
			]
		});

	expect(response.status).toBe(201);
	expect(response.body.success).toBe(true);
	expect(response.body.data.status).toBe('draft');

	return response.body.data;
}

describe('Invoice lifecycle integration', () => {
	test('draft invoice can transition to sent', async () => {
		const token = await registerAndLogin();
		const clientId = await createClient(token);
		const invoice = await createDraftInvoice(token, clientId);

		const response = await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'sent' });

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.status).toBe('sent');
	});

	test('sent invoice can transition to paid', async () => {
		const token = await registerAndLogin();
		const clientId = await createClient(token);
		const invoice = await createDraftInvoice(token, clientId);

		await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'sent' });

		const response = await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'paid' });

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.status).toBe('paid');
	});

	test('paid invoice cannot transition back to draft', async () => {
		const token = await registerAndLogin();
		const clientId = await createClient(token);
		const invoice = await createDraftInvoice(token, clientId);

		await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'sent' });

		await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'paid' });

		const response = await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'draft' });

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Paid invoice cannot be modified/i);
	});

	test('cancelled invoice cannot be modified', async () => {
		const token = await registerAndLogin();
		const clientId = await createClient(token);
		const invoice = await createDraftInvoice(token, clientId);

		await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'cancelled' });

		const response = await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ notes: 'Trying to update cancelled invoice' });

		expect(response.status).toBe(400);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Cancelled invoice cannot be modified/i);
	});

	test('overdue invoice status should remain overdue if paid date is not set', async () => {
		const token = await registerAndLogin();
		const clientId = await createClient(token);
		const invoice = await createDraftInvoice(token, clientId);

		await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'sent' });

		await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'overdue' });

		const invalidPaidTransition = await request(app)
			.patch(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`)
			.send({ status: 'paid' });

		expect(invalidPaidTransition.status).toBe(400);
		expect(invalidPaidTransition.body.success).toBe(false);
		expect(invalidPaidTransition.body.message).toMatch(/paidAt is required/i);

		const getResponse = await request(app)
			.get(`/api/v1/invoices/${invoice.id}`)
			.set('Authorization', `Bearer ${token}`);

		expect(getResponse.status).toBe(200);
		expect(getResponse.body.success).toBe(true);
		expect(getResponse.body.data.status).toBe('overdue');
	});
});
