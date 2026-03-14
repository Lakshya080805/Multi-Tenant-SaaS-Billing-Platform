import request from 'supertest';
import app from '../setup/testApp.js';

function expectErrorResponse(response, statusCode) {
	expect(response.status).toBe(statusCode);
	expect(response.body).toHaveProperty('success', false);
	expect(response.body).toHaveProperty('message');
	expect(typeof response.body.message).toBe('string');
}

describe('Authentication API failure scenarios', () => {
	const password = 'Test@1234';

	test('login with wrong password should return 401', async () => {
		const email = `wrong-pass-${Date.now()}@test.com`;

		await request(app)
			.post('/api/v1/auth/register')
			.send({
				email,
				password,
				organizationName: 'Auth Failure Org',
				role: 'admin'
			});

		const response = await request(app)
			.post('/api/v1/auth/login')
			.send({
				email,
				password: 'Wrong@1234'
			});

		expectErrorResponse(response, 401);
		expect(response.body.message).toMatch(/Invalid credentials/i);
	});

	test('login with non-existing email should return 401', async () => {
		const response = await request(app)
			.post('/api/v1/auth/login')
			.send({
				email: `missing-${Date.now()}@test.com`,
				password
			});

		expectErrorResponse(response, 401);
		expect(response.body.message).toMatch(/Invalid credentials/i);
	});

	test('register with duplicate email should return 409', async () => {
		const email = `duplicate-${Date.now()}@test.com`;

		await request(app)
			.post('/api/v1/auth/register')
			.send({
				email,
				password,
				organizationName: 'Auth Failure Org',
				role: 'admin'
			});

		const response = await request(app)
			.post('/api/v1/auth/register')
			.send({
				email,
				password,
				organizationName: 'Auth Failure Org',
				role: 'admin'
			});

		expectErrorResponse(response, 409);
		expect(response.body.message).toMatch(/Email already in use/i);
	});

	test('register with invalid email format should return validation error', async () => {
		const response = await request(app)
			.post('/api/v1/auth/register')
			.send({
				email: 'invalid-email-format',
				password,
				organizationName: 'Auth Failure Org',
				role: 'admin'
			});

		expectErrorResponse(response, 400);
		expect(response.body.message).toMatch(/Validation failed/i);
		expect(Array.isArray(response.body.details)).toBe(true);
		expect(response.body.details.length).toBeGreaterThan(0);
	});

	test('access protected route without token should return 401', async () => {
		const response = await request(app).get('/api/protected');

		expectErrorResponse(response, 401);
		expect(response.body.message).toMatch(/Authentication required/i);
	});

	test('access protected route with invalid token should return 401', async () => {
		const response = await request(app)
			.get('/api/protected')
			.set('Authorization', 'Bearer invalid.jwt.token');

		expectErrorResponse(response, 401);
		expect(response.body.message).toMatch(/Invalid or expired token/i);
	});
});
