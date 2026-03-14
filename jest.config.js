export default {
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	setupFilesAfterEnv: ['<rootDir>/tests/setup/testDatabase.js'],
	clearMocks: true,
	collectCoverage: true,
	coverageThreshold: {
		global: {
			statements: 45,
			branches: 45,
			functions: 35,
			lines: 45
		}
	},
	coveragePathIgnorePatterns: ['/node_modules/'],
	testPathIgnorePatterns: ['/node_modules/']
};

