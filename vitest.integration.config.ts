import { defineConfig } from 'vitest/config';

// DB doc's own migration/testing strategy: "Test database: a separate
// Neon branch or separate project — never run tests against real
// data." This config deliberately does NOT hardcode dummy env values
// the way vitest.config.ts does for unit tests — integration tests
// need REAL Prisma writes against a REAL (but separate) database, so
// process.env must already carry a genuine DATABASE_URL pointing at
// that test database before this runs (see .env.test.example and
// package.json's test:integration script, which loads it via dotenv
// -e before invoking vitest).
//
// This file's tests are never picked up by plain `npm test` —
// vitest.config.ts's own include is narrowed to tests/unit/ only,
// specifically so a missing/misconfigured test database doesn't break
// the default test run for anyone who hasn't set one up.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Integration tests do real DB writes and reads in sequence
    // (seed -> run -> assert -> clean up) — running them in parallel
    // against the same test database risks one test's seed data
    // leaking into another's assertions.
    fileParallelism: false,
    // Real network round trips to a real database — vitest's 5s
    // default is tuned for mocked unit tests, not this. Neon's
    // free-tier compute also suspends after inactivity and can take a
    // few seconds to wake on the first query of a run.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});