import { describe, expect, it } from 'vitest';
import { generateObjectKey } from '../../../../src/shared/utils/generate-object-key';

// FR-2.2a — the entire point of this function is unguessability, so
// these tests focus on the two properties that actually matter for
// that: the key isn't derived from anything predictable, and repeated
// calls never collide.

describe('generateObjectKey', () => {
  it('includes the given prefix and extension in the returned key', () => {
    const key = generateObjectKey('resources', 'pdf');

    expect(key.startsWith('resources/')).toBe(true);
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('embeds a valid UUID as the random path segment', () => {
    const key = generateObjectKey('resources', 'pdf');
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const uuidSegment = key.replace('resources/', '').replace('.pdf', '');
    expect(uuidSegment).toMatch(uuidPattern);
  });

  it('never returns the same key twice — FR-2.2a unguessability depends on this', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateObjectKey('resources', 'pdf')));
    expect(keys.size).toBe(1000);
  });

  it('does not derive the key from the prefix content — same prefix, different keys', () => {
    const first = generateObjectKey('resources', 'pdf');
    const second = generateObjectKey('resources', 'pdf');
    expect(first).not.toBe(second);
  });
});
