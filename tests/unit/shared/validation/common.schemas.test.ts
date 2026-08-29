import { describe, expect, it } from 'vitest';
import { paginationSchema } from '../../../../src/shared/validation/common.schemas';

// FR-3.5 — the specific behavior worth pinning down here is the clamp,
// not the coercion (Zod's own coerce/default are already
// well-tested by Zod itself). A client sending limit=500 should get
// limit=50 back, not a 400 — that's a deliberate product decision, not
// an accident, so it deserves its own regression test.

describe('paginationSchema', () => {
  it('defaults page to 1 and limit to 20 when both are omitted', () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it('coerces string query-param values into numbers', () => {
    const result = paginationSchema.parse({ page: '2', limit: '10' });
    expect(result).toEqual({ page: 2, limit: 10 });
  });

  it('clamps a limit above the max down to 50, rather than rejecting the request', () => {
    const result = paginationSchema.parse({ limit: '500' });
    expect(result.limit).toBe(50);
  });

  it('leaves a limit at exactly the max unchanged', () => {
    const result = paginationSchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('rejects a non-positive page', () => {
    expect(() => paginationSchema.parse({ page: '0' })).toThrow();
  });

  it('rejects a non-integer limit', () => {
    expect(() => paginationSchema.parse({ limit: '10.5' })).toThrow();
  });
});
