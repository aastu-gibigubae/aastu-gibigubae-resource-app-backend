import { defineConfig } from 'vitest/config';

// Same rationale as vitest.integration.config.ts: real database, real
// process.env (no hardcoded dummy values), loaded via
// `dotenv -e .env.test --` at the npm-script level. The difference
// from integration tests is what's being exercised — these tests call
// the actual Express app over HTTP via supertest, so routing,
// middleware (requireAuth, checkLockout, the zod-validation layer),
// and the error-handler's response shape are all real too, not just
// the database.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    // Same reasoning as the integration config: real, shared state
    // (the database, AND here also the in-memory rate-limit counters
    // in rate-limit.ts) means tests must not run concurrently against
    // each other.
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
