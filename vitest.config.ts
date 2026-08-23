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
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts'],
    },
  },
});