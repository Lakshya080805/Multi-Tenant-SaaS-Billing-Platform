import request from 'supertest';
import { v4 as uuid } from 'uuid';
import app from '../setup/testApp.js';
import { clientModel } from '../../src/models/clientModel.js';
import { invoiceModel } from '../../src/models/invoiceModel.js';

async function createUserAndGetToken(role) {
	const email = `${role}-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;
	const password = 'Test@1234';

	const registerRes = await request(app)
		.post('/api/v1/auth/register')
		.send({
			email,
			password,
			organizationName: `${role}-org`,
			role
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

describe('RBAC integration tests', () => {
	test('ADMIN can create client', async () => {
		const { token } = await createUserAndGetToken('admin');

		const response = await request(app)
			.post('/api/v1/clients')
			.set('Authorization', `Bearer ${token}`)
			.send({
				name: 'Admin Client',
				email: 'admin.client@test.com'
			});

		expect(response.status).toBe(201);
		expect(response.body.success).toBe(true);
		expect(response.body.data.name).toBe('Admin Client');
	});

	test('ACCOUNTANT cannot create client', async () => {
		const { token } = await createUserAndGetToken('accountant');

		const response = await request(app)
			.post('/api/v1/clients')
			.set('Authorization', `Bearer ${token}`)
			.send({
				name: 'Blocked Client',
				email: 'blocked.client@test.com'
			});

		expect(response.status).toBe(403);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Insufficient permissions/i);
	});

	test('ACCOUNTANT can create invoice', async () => {
		const { token, organizationId } = await createUserAndGetToken('accountant');

		const seededClient = await clientModel.create({
			id: uuid(),
			organizationId,
			name: 'Accountant Org Client',
			email: 'accountant.org.client@test.com'
		});

		const response = await request(app)
			.post('/api/v1/invoices')
			.set('Authorization', `Bearer ${token}`)
			.send({
				clientId: seededClient.id,
				invoiceNumber: `INV-ACC-${Date.now()}`,
				issueDate: '2026-03-14',
				dueDate: '2026-03-21',
				lineItems: [
					{
						description: 'Accounting service',
						quantity: 1,
						unitPrice: 1000,
						taxRate: 18
					}
				]
			});

		expect(response.status).toBe(201);
		expect(response.body.success).toBe(true);
		expect(response.body.data.status).toBe('draft');
	});

	test('VIEWER cannot create invoice', async () => {
		const { token, organizationId } = await createUserAndGetToken('viewer');

		const seededClient = await clientModel.create({
			id: uuid(),
			organizationId,
			name: 'Viewer Org Client',
			email: 'viewer.org.client@test.com'
		});

		const response = await request(app)
			.post('/api/v1/invoices')
			.set('Authorization', `Bearer ${token}`)
			.send({
				clientId: seededClient.id,
				invoiceNumber: `INV-VIEW-${Date.now()}`,
				issueDate: '2026-03-14',
				dueDate: '2026-03-21',
				lineItems: [
					{
						description: 'Viewer blocked service',
						quantity: 1,
						unitPrice: 500,
						taxRate: 18
					}
				]
			});

		expect(response.status).toBe(403);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Insufficient permissions/i);
	});

	test('VIEWER can read invoices', async () => {
		const { token, organizationId } = await createUserAndGetToken('viewer');

		const seededClient = await clientModel.create({
			id: uuid(),
			organizationId,
			name: 'Invoice Read Client',
			email: 'invoice.read.client@test.com'
		});

		await invoiceModel.create({
			id: uuid(),
			organizationId,
			clientId: seededClient.id,
			invoiceNumber: `INV-READ-${Date.now()}`,
			status: 'draft',
			issueDate: new Date('2026-03-14'),
			dueDate: new Date('2026-03-21'),
			lineItems: [
				{
					description: 'Read-only visible invoice',
					quantity: 1,
					unitPrice: 250,
					taxRate: 10
				}
			],
			subtotal: 250,
			taxTotal: 25,
			total: 275,
			currency: 'USD'
		});

		const response = await request(app)
			.get('/api/v1/invoices')
			.set('Authorization', `Bearer ${token}`);

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(Array.isArray(response.body.data)).toBe(true);
		expect(response.body.data.length).toBeGreaterThan(0);
	});

	test('unauthorized role should return 403', async () => {
		const { token } = await createUserAndGetToken('viewer');

		const response = await request(app)
			.post('/api/v1/clients')
			.set('Authorization', `Bearer ${token}`)
			.send({
				name: 'Unauthorized Role Client',
				email: 'unauthorized.role@test.com'
			});

		expect(response.status).toBe(403);
		expect(response.body.success).toBe(false);
		expect(response.body.message).toMatch(/Insufficient permissions/i);
	});
});
