const collectCoverage = process.env.COVERAGE === 'true';

export default {
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	setupFilesAfterEnv: ['<rootDir>/tests/setup/testDatabase.js'],
	clearMocks: true,
	collectCoverage,
	coverageThreshold: collectCoverage
		? {
				global: {
					statements: 45,
					branches: 45,
					functions: 45,
					lines: 45
				}
			}
		: undefined,
	coveragePathIgnorePatterns: ['/node_modules/', '/src/config/redis.js', '/src/middleware/rateLimitMiddleware.js', '/src/services/cacheService.js', '/src/services/dashboardService.js'],
	testPathIgnorePatterns: ['/node_modules/']
};

