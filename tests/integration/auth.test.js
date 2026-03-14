import request from 'supertest';
import app from '../setup/testApp.js';

describe('Authentication API', () => {
	const testEmail = 'auth.integration@test.com';
	const testPassword = 'Test@1234';
	const organizationName = 'Test Org';

	it('should register a user successfully', async () => {
		const response = await request(app)
			.post('/api/v1/auth/register')
			.send({
				email: testEmail,
				password: testPassword,
				organizationName,
				role: 'admin'
			});

		expect(response.status).toBe(201);
		expect(response.body).toHaveProperty('success', true);
		expect(response.body).toHaveProperty('data');
		expect(response.body.data).toHaveProperty('accessToken');
		expect(response.body.data).toHaveProperty('user');
		expect(response.body.data.user).toHaveProperty('email', testEmail);
		expect(response.body.data.user).toHaveProperty('role', 'admin');
		expect(response.body.data.user).toHaveProperty('organizationId');
	});

	it('should login a registered user successfully', async () => {
		await request(app)
			.post('/api/v1/auth/register')
			.send({
				email: testEmail,
				password: testPassword,
				organizationName,
				role: 'admin'
			});

		const response = await request(app)
			.post('/api/v1/auth/login')
			.send({
				email: testEmail,
				password: testPassword
			});

		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('success', true);
		expect(response.body).toHaveProperty('data');
		expect(response.body.data).toHaveProperty('accessToken');
		expect(response.body.data).toHaveProperty('user');
		expect(response.body.data.user).toHaveProperty('email', testEmail);
		expect(response.body.data.user).toHaveProperty('organizationId');
	});
});
