import { describe, expect, it } from 'vitest';
import { addDays, addMonths } from '../../../../src/shared/utils/date-math';

describe('addMonths', () => {
  it('adds a plain number of months within the same year', () => {
    const result = addMonths(new Date('2026-03-15T00:00:00Z'), 3);
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(5); // June, 0-indexed
    expect(result.getUTCDate()).toBe(15);
  });

  it('matches FR-4.3: 12 months from a given grant-premium date rolls into the next year', () => {
    const result = addMonths(new Date('2026-08-06T00:00:00Z'), 12);
    expect(result.getUTCFullYear()).toBe(2027);
    expect(result.getUTCMonth()).toBe(7); // August, 0-indexed
    expect(result.getUTCDate()).toBe(6);
  });

  it('does not mutate the original date passed in', () => {
    const original = new Date('2026-01-01T00:00:00Z');
    const originalTime = original.getTime();
    addMonths(original, 6);
    expect(original.getTime()).toBe(originalTime);
  });

  it('handles the day-of-month overflow edge case (Jan 31 + 1 month) — documented in the function comment, not silently assumed', () => {
    const result = addMonths(new Date('2026-01-31T00:00:00Z'), 1);
    // JS Date overflows into March rather than clamping to Feb 28 —
    // this test exists so that behavior is explicit and locked in,
    // not an accident nobody noticed.
    expect(result.getUTCMonth()).toBe(2); // March, 0-indexed
  });
});

describe('addDays', () => {
  it('adds days within the same month', () => {
    const result = addDays(new Date('2026-08-06T00:00:00Z'), 7);
    expect(result.getUTCDate()).toBe(13);
    expect(result.getUTCMonth()).toBe(7); // August, 0-indexed
  });

  it('rolls over into the next month correctly', () => {
    const result = addDays(new Date('2026-08-28T00:00:00Z'), 7);
    expect(result.getUTCMonth()).toBe(8); // September
    expect(result.getUTCDate()).toBe(4);
  });

  it('does not mutate the original date passed in', () => {
    const original = new Date('2026-01-01T00:00:00Z');
    const originalTime = original.getTime();
    addDays(original, 7);
    expect(original.getTime()).toBe(originalTime);
  });
});