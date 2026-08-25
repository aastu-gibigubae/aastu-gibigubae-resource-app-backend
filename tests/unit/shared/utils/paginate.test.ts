import { describe, expect, it } from 'vitest';
import { buildPaginationEnvelope, toSkipTake } from '../../../../src/shared/utils/paginate';

// FR-3.5 — pure math, but with real edge cases worth pinning down
// explicitly rather than trusting they "obviously" work.

describe('toSkipTake', () => {
  it('page 1 skips nothing', () => {
    expect(toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('page 3 at limit 20 skips the first 40 items', () => {
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('take always equals the given limit, independent of page', () => {
    expect(toSkipTake({ page: 5, limit: 7 }).take).toBe(7);
  });
});

describe('buildPaginationEnvelope', () => {
  it('rounds up to a full extra page for a partial remainder — 21 items at limit 20 is 2 pages', () => {
    const envelope = buildPaginationEnvelope({ page: 1, limit: 20 }, 21);
    expect(envelope.total_pages).toBe(2);
  });

  it('an exact multiple does not overcount — 40 items at limit 20 is exactly 2 pages', () => {
    const envelope = buildPaginationEnvelope({ page: 1, limit: 20 }, 40);
    expect(envelope.total_pages).toBe(2);
  });

  it('zero results means zero pages, not one empty page', () => {
    const envelope = buildPaginationEnvelope({ page: 1, limit: 20 }, 0);
    expect(envelope.total_pages).toBe(0);
  });

  it('echoes back the page and limit that were requested', () => {
    const envelope = buildPaginationEnvelope({ page: 4, limit: 10 }, 100);
    expect(envelope.page).toBe(4);
    expect(envelope.limit).toBe(10);
    expect(envelope.total).toBe(100);
  });
});