import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
} from '../../../../src/shared/middleware/rate-limit';
import { AccountLockedError } from '../../../../src/shared/errors/app-errors';

// Builds a minimal fake Request carrying only what checkLockout reads.
const fakeReq = (email: string, ip: string): Request =>
  ({ body: { email }, ip }) as unknown as Request;

afterEach(() => {
  vi.useRealTimers();
});

describe('checkLockout', () => {
  it('allows the request through when no attempts have been recorded', () => {
    const next = vi.fn();
    checkLockout(fakeReq('fresh@example.com', '10.0.0.1'), {} as Response, next);

    expect(next).toHaveBeenCalledWith(); // called with no argument — not blocked
  });

  it('blocks with AccountLockedError after 5 failed attempts on the same email (FR-1.4)', () => {
    const email = 'locked-by-email@example.com';
    const ip = '10.0.0.2';
    for (let i = 0; i < 5; i++) recordFailedAttempt(email, ip);

    const next = vi.fn();
    checkLockout(fakeReq(email, '10.0.0.99'), {} as Response, next); // different IP, same email

    expect(next).toHaveBeenCalledWith(expect.any(AccountLockedError));
  });

  it('blocks with AccountLockedError after 5 failed attempts from the same IP, even across different emails', () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 5; i++) recordFailedAttempt(`attacker${i}@example.com`, ip);

    const next = vi.fn();
    checkLockout(fakeReq('someone-else@example.com', ip), {} as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AccountLockedError));
  });

  it('does not block on the 4th attempt — only at 5', () => {
    const email = 'four-attempts@example.com';
    const ip = '10.0.0.4';
    for (let i = 0; i < 4; i++) recordFailedAttempt(email, ip);

    const next = vi.fn();
    checkLockout(fakeReq(email, ip), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('reports a retry_after_seconds within the 15-minute window, not some arbitrary value', () => {
    const email = 'check-retry-seconds@example.com';
    const ip = '10.0.0.5';
    for (let i = 0; i < 5; i++) recordFailedAttempt(email, ip);

    const next = vi.fn();
    checkLockout(fakeReq(email, ip), {} as Response, next);

    const error = next.mock.calls[0]?.[0] as AccountLockedError;
    expect(error.details?.retry_after_seconds).toBeGreaterThan(0);
    expect(error.details?.retry_after_seconds).toBeLessThanOrEqual(15 * 60);
  });

  it('resetAttempts clears the lockout, allowing the next request through', () => {
    const email = 'reset-me@example.com';
    const ip = '10.0.0.6';
    for (let i = 0; i < 5; i++) recordFailedAttempt(email, ip);

    resetAttempts(email, ip);

    const next = vi.fn();
    checkLockout(fakeReq(email, ip), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('the lockout window expires naturally after 15 minutes, even without an explicit reset', () => {
    vi.useFakeTimers();
    const email = 'window-expiry@example.com';
    const ip = '10.0.0.7';

    for (let i = 0; i < 5; i++) recordFailedAttempt(email, ip);

    // Confirm it's actually locked first — otherwise this test would
    // pass trivially for the wrong reason.
    const blockedNext = vi.fn();
    checkLockout(fakeReq(email, ip), {} as Response, blockedNext);
    expect(blockedNext).toHaveBeenCalledWith(expect.any(AccountLockedError));

    vi.advanceTimersByTime(15 * 60 * 1000 + 1000); // 15 minutes + 1 second

    const afterExpiryNext = vi.fn();
    checkLockout(fakeReq(email, ip), {} as Response, afterExpiryNext);
    expect(afterExpiryNext).toHaveBeenCalledWith();
  });
});
