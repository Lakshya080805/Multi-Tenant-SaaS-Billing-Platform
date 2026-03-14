import request from 'supertest';
import app from '../setup/testApp.js';

function expectTenantDenied(response) {
	expect([403, 404]).toContain(response.status);
	expect(response.body.success).toBe(false);
	expect(typeof response.body.message).toBe('string');
}

async function registerAndLoginAdmin(prefix) {
	const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;
	const password = 'Test@1234';

	const registerRes = await request(app)
		.post('/api/v1/auth/register')
		.send({
			email,
			password,
			organizationName: `${prefix}-org`,
			role: 'admin'
		});

	expect(registerRes.status).toBe(201);

	const loginRes = await request(app)
		.post('/api/v1/auth/login')
		.send({ email, password });

	expect(loginRes.status).toBe(200);
	expect(loginRes.body.success).toBe(true);

	return {
		token: loginRes.body.data.accessToken,
		organizationId: loginRes.body.data.user.organizationId
	};
}

async function createClient(token) {
	const response = await request(app)
		.post('/api/v1/clients')
		.set('Authorization', `Bearer ${token}`)
		.send({
			name: 'Tenant A Client',
			email: `tenant-a-client-${Date.now()}@test.com`
		});

	expect(response.status).toBe(201);
	return response.body.data;
}

async function createInvoice(token, clientId) {
	const response = await request(app)
		.post('/api/v1/invoices')
		.set('Authorization', `Bearer ${token}`)
		.send({
			clientId,
			invoiceNumber: `INV-TENANT-${Date.now()}`,
			issueDate: '2026-03-14',
			dueDate: '2026-03-21',
			lineItems: [
				{
					description: 'Tenant isolation service',
					quantity: 1,
					unitPrice: 1200,
					taxRate: 18
				}
			]
		});

	expect(response.status).toBe(201);
	return response.body.data;
}

describe('Tenant isolation integration', () => {
	test('user B cannot access user A client', async () => {
		const userA = await registerAndLoginAdmin('tenant-a');
		const userB = await registerAndLoginAdmin('tenant-b');

		const clientA = await createClient(userA.token);

		const response = await request(app)
			.get(`/api/v1/clients/${clientA.id}`)
			.set('Authorization', `Bearer ${userB.token}`);

		expectTenantDenied(response);
	});

	test('user B cannot update user A invoice', async () => {
		const userA = await registerAndLoginAdmin('tenant-a');
		const userB = await registerAndLoginAdmin('tenant-b');

		const clientA = await createClient(userA.token);
		const invoiceA = await createInvoice(userA.token, clientA.id);

		const response = await request(app)
			.patch(`/api/v1/invoices/${invoiceA.id}`)
			.set('Authorization', `Bearer ${userB.token}`)
			.send({ notes: 'Cross-tenant update attempt' });

		expectTenantDenied(response);

		const ownerRead = await request(app)
			.get(`/api/v1/invoices/${invoiceA.id}`)
			.set('Authorization', `Bearer ${userA.token}`);

		expect(ownerRead.status).toBe(200);
		expect(ownerRead.body.success).toBe(true);
		expect(ownerRead.body.data.notes || '').not.toBe('Cross-tenant update attempt');
	});

	test('user B cannot delete user A invoice', async () => {
		const userA = await registerAndLoginAdmin('tenant-a');
		const userB = await registerAndLoginAdmin('tenant-b');

		const clientA = await createClient(userA.token);
		const invoiceA = await createInvoice(userA.token, clientA.id);

		const response = await request(app)
			.delete(`/api/v1/invoices/${invoiceA.id}`)
			.set('Authorization', `Bearer ${userB.token}`);

		expectTenantDenied(response);

		const ownerRead = await request(app)
			.get(`/api/v1/invoices/${invoiceA.id}`)
			.set('Authorization', `Bearer ${userA.token}`);

		expect(ownerRead.status).toBe(200);
		expect(ownerRead.body.success).toBe(true);
		expect(ownerRead.body.data.id).toBe(invoiceA.id);
	});

	test('organization-scoped queries isolate invoice visibility', async () => {
		const userA = await registerAndLoginAdmin('tenant-a');
		const userB = await registerAndLoginAdmin('tenant-b');

		const clientA = await createClient(userA.token);
		const invoiceA = await createInvoice(userA.token, clientA.id);

		const listForB = await request(app)
			.get('/api/v1/invoices')
			.set('Authorization', `Bearer ${userB.token}`);

		expect(listForB.status).toBe(200);
		expect(listForB.body.success).toBe(true);
		expect(Array.isArray(listForB.body.data)).toBe(true);
		expect(listForB.body.data.some((inv) => inv.id === invoiceA.id)).toBe(false);
	});
});
