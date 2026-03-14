export const createTestUser = () => {
  return {
    email: `test${Date.now()}@example.com`,
    password: "password123",
    organizationName: "Test Org"
  };
};