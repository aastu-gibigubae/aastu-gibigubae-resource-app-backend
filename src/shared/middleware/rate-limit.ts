import type { RequestHandler } from 'express';
import { AccountLockedError } from '../errors/app-errors';

// FR-1.4: lock for 15 minutes after 5 failed attempts, enforced both
// per-account and per-IP. In-memory by design — the architecture doc
// names this file's purpose directly ("login lockout — per-account +
// per-IP") without any accompanying DB table for it, unlike FR-3.3's
// device-binding checks which do have real tables behind them. This
// means the counter resets on server restart and won't work correctly
// across multiple server instances — fine at this project's current
// single-instance scale; would need moving to Redis if that changes.
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  windowStart: number;
}

const attemptsByEmail = new Map<string, AttemptRecord>();
const attemptsByIp = new Map<string, AttemptRecord>();

const getRemainingLockSeconds = (record: AttemptRecord | undefined): number | null => {
  if (!record || record.count < MAX_ATTEMPTS) return null;
  const elapsedMs = Date.now() - record.windowStart;
  const remainingMs = LOCKOUT_WINDOW_MS - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null;
};

// Mounted on POST /auth/login before the controller runs — rejects
// early if either the submitted email or the requesting IP is
// currently locked out, without ever reaching auth.service or touching
// the database.
export const checkLockout: RequestHandler = (req, _res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
  const ip = req.ip ?? 'unknown';

  const emailRemaining = email ? getRemainingLockSeconds(attemptsByEmail.get(email)) : null;
  const ipRemaining = getRemainingLockSeconds(attemptsByIp.get(ip));

  const remaining = Math.max(emailRemaining ?? 0, ipRemaining ?? 0);
  if (remaining > 0) {
    next(new AccountLockedError(remaining));
    return;
  }
  next();
};

const recordAttempt = (map: Map<string, AttemptRecord>, key: string): void => {
  const existing = map.get(key);
  const now = Date.now();

  if (!existing || now - existing.windowStart > LOCKOUT_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return;
  }
  existing.count += 1;
};

// Called by auth.service.login on invalid credentials — the middleware
// above only checks whether a lockout is already in effect; recording
// a new strike happens here, at the point login actually fails, since
// that's the only place that genuinely knows the attempt was invalid.
export const recordFailedAttempt = (email: string, ip: string): void => {
  recordAttempt(attemptsByEmail, email);
  recordAttempt(attemptsByIp, ip);
};

// Called by auth.service.login on success — clears both counters so a
// student who mistypes their password a couple of times, then gets it
// right, isn't left sitting closer to a lockout on their next genuine
// mistake days later.
export const resetAttempts = (email: string, ip: string): void => {
  attemptsByEmail.delete(email);
  attemptsByIp.delete(ip);
};
