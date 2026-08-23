import { PrismaClient } from '@prisma/client';
import { env } from '../../config/env';

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
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}