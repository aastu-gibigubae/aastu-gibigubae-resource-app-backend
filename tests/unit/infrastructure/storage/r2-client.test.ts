import { describe, expect, it } from 'vitest';
import { buildUrl } from '../../../../src/infrastructure/storage/r2-client';

// Only buildUrl is unit-tested here — it's pure string concatenation
// against env.R2_PUBLIC_URL and touches no network. upload() and
// deleteObject() call the real AWS SDK's S3Client.send(); verifying
// those actually work requires real R2 credentials and a real bucket
// (same limitation already flagged when this file was built — this
// sandbox has no network path to Cloudflare's API, and mocking
// S3Client.send() would only prove the mock works, not R2 itself).
// vitest.config.ts supplies dummy R2_PUBLIC_URL for this test to read.

describe('buildUrl', () => {
  it('joins the public R2 URL and the object key with a single slash', () => {
    const url = buildUrl('resources/abc-123.pdf');
    expect(url).toBe('https://files.test.example.com/resources/abc-123.pdf');
  });

  it('does not sign or add any query parameters — v1 uses permanent unsigned URLs (Section 6.5)', () => {
    const url = buildUrl('resources/abc-123.pdf');
    expect(url).not.toContain('?');
    expect(url).not.toContain('Signature');
    expect(url).not.toContain('Expires');
  });
});