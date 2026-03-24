// Ensure rate limit env vars are set before app is imported
process.env.ENABLE_RATE_LIMIT_IN_TEST = 'true';
process.env.FORCE_REDIS_IN_TEST = 'true';
process.env.REDIS_ENABLED = 'true';

import { createApp } from '../../src/app.js';

const app = createApp();

export { app };
export default app;
