import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../../config/env';

// Cloudflare R2 exposes an S3-compatible API — same commands, same
// client, just pointed at R2's endpoint instead of AWS's. This file is
// deliberately domain-agnostic (architecture doc §3): it doesn't know
// what a "Resource" is, doesn't validate file type or size, doesn't
// touch Prisma. It just moves bytes to/from a bucket and reports back
// a URL. The catalog module (once built) is the one that knows a
// Resource's file lives at a given key — this file only knows how to
// talk to R2 itself, the same separation jwt.ts draws between "sign a
// token" and "what a Role is."
//
// One module-level client instance, constructed once at import time —
// same singleton pattern as infrastructure/database/prisma-client.ts.
// Cheap to create, no reason to rebuild it per request.
const r2Client = new S3Client({
  region: 'auto', // R2 ignores AWS regions entirely; 'auto' is Cloudflare's documented value
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// Buffer in, not a stream — matches shared/middleware/upload.ts using
// multer's memoryStorage (files are capped at 2MB by FR-2.2, so
// holding the whole thing in memory is fine; streaming would be
// solving a problem this app's file-size limit doesn't have).
export const upload = async (buffer: Buffer, key: string, contentType: string): Promise<void> => {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
};

// Used when an admin replaces/removes a Resource's file, or when a
// Stream/Department/Course cascade-delete eventually reaches down to
// delete the Resources under it (SRS §4.1 note on cascade-delete
// bottoming out at Resource — that's catalog's job to orchestrate,
// this just performs the one-key deletion when asked).
export const deleteObject = async (key: string): Promise<void> => {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    }),
  );
};

// v1 uses permanent, unsigned URLs (Section 6.5's accepted risk) — so
// "building" a URL is just string concatenation against the public
// custom domain, no signing, no expiry. This is the one function in
// this file that will change shape in v2 (Section 10, Item #12) when
// signed/expiring URLs are reintroduced — isolating it here means that
// future change touches exactly one function, not every call site that
// currently stores a Resource's file_url.
export const buildUrl = (key: string): string => `${env.R2_PUBLIC_URL}/${key}`;