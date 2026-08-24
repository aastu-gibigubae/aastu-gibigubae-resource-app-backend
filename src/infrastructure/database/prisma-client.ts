import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../config/env';

// Prisma 7 removed the old built-in query engine entirely — `new
// PrismaClient()` with no adapter now throws unconditionally, no
// fallback (this wasn't caught by Phase 0's own verification since
// nothing had actually imported this file's real PrismaClient
// construction path until Phase 1's repositories did; `jwt.test.ts`
// never touches this chain, and `npx prisma migrate deploy` goes
// through prisma.config.ts's separate CLI connection path, not this
// runtime client). Every environment now needs an explicit driver
// adapter — @prisma/adapter-pg for Postgres/Neon.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// A fresh `new PrismaClient()` on every import would open a new connection
// pool each time — harmless in production (this module is only ever
// imported once), but ts-node-dev's hot-reload in development re-executes
// modules on every file change, which would otherwise leak connections
// until the dev server is restarted. Caching the instance on `globalThis`
// survives the reload; production never touches this branch since the
// process only starts once.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}