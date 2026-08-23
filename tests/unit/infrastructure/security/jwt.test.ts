import { describe, expect, it } from 'vitest';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../../../src/infrastructure/security/jwt';

// This file exists specifically because the device fingerprint claim
// was the piece missing from the reverted auth implementation — FR-3.3's
// device-binding check, and /auth/logout's precise single-session
// revoke, both depend on it surviving sign -> verify intact.

describe('jwt device fingerprint claim', () => {
  it('carries the device fingerprint through an access token sign/verify round-trip', () => {
    const token = signAccessToken({
      userId: 42,
      role: 'student',
      deviceFingerprint: 'fp_abc123',
    });

    const payload = verifyAccessToken(token);

    expect(payload.userId).toBe(42);
    expect(payload.role).toBe('student');
    expect(payload.deviceFingerprint).toBe('fp_abc123');
  });

  it('carries the device fingerprint through a refresh token sign/verify round-trip', () => {
    const token = signRefreshToken({
      userId: 42,
      role: 'student',
      deviceFingerprint: 'fp_abc123',
    });

    const payload = verifyRefreshToken(token);

    expect(payload.deviceFingerprint).toBe('fp_abc123');
    expect(payload.jti).toEqual(expect.any(String));
  });

  it('omits the claim entirely when no fingerprint is provided (signup-issued tokens)', () => {
    const token = signAccessToken({ userId: 42, role: 'student' });
    const payload = verifyAccessToken(token);

    expect(payload.deviceFingerprint).toBeUndefined();
  });

  it('rejects a refresh token when verified as an access token, and vice versa', () => {
    const accessToken = signAccessToken({ userId: 1, role: 'admin' });
    const refreshToken = signRefreshToken({ userId: 1, role: 'admin' });

    expect(() => verifyRefreshToken(accessToken)).toThrow();
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });
});

describe('hashRefreshToken', () => {
  it('is deterministic — the same input always hashes the same way', () => {
    const token = 'some-refresh-token-value';
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it('never returns the raw token itself', () => {
    const token = 'some-refresh-token-value';
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});