import 'dotenv/config';
import { z } from 'zod';

// Validates process.env once, at import time, so a missing or malformed
// variable fails loudly at boot — not silently, three requests into
// production, the first time some module happens to read it.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // r2-client.ts is now built and reads all five of these at import
  // time (the S3Client is constructed once, module-level) — no longer
  // optional. A missing value now fails loudly at boot, same as
  // DATABASE_URL/JWT secrets above, rather than surfacing later as a
  // confusing runtime error the first time someone uploads a file.
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME is required'),
  R2_PUBLIC_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables — see above for details');
}

export const env = parsed.data;