import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // env.ts validates these at import time — unit tests that never
    // touch a real database still trigger that validation just by
    // importing anything that eventually imports env.ts (like jwt.ts).
    // These are dummy values so tests don't depend on a real .env file
    // existing; integration tests that need a real DATABASE_URL load
    // their own .env.test separately (added in Phase 2).
    //
    // R2_* vars added once r2-client.ts made them required (previously
    // optional) — without these, every test that transitively imports
    // env.ts (which is nearly all of them) fails at import time, not
    // just tests that actually touch r2-client.ts.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
      R2_ACCOUNT_ID: 'test-account-id',
      R2_ACCESS_KEY_ID: 'test-access-key-id',
      R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
      R2_BUCKET_NAME: 'test-bucket',
      R2_PUBLIC_URL: 'https://files.test.example.com',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts'],
    },
  },
});