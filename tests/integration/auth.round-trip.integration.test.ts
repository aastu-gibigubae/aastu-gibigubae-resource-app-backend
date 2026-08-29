import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import * as authService from '../../src/modules/auth/auth.service';
import { hashRefreshToken } from '../../src/infrastructure/security/jwt';

// Real Prisma writes against a real, separate TEST database. The
// thing worth proving here that mocked unit tests already cover
// individually but never together: does a real signup -> login ->
// refresh -> logout chain actually work end to end against real
// bcrypt hashing, real JWT signing/verification, and real token-hash
// storage? Lowest priority of the integration candidates (this flow
// is already exercised manually via curl/Postman), but worth locking
// in as a regression guard now that it's cheap to add.
//
// Run via `npm run test:integration`, never as part of plain `npm test`.

const TEST_PREFIX = 'integration-test-auth';
let counter = 0;
const uniqueEmail = () => {
  counter += 1;
  return `${TEST_PREFIX}-${Date.now()}-${counter}@example.com`;
};
const uniquePhone = () => {
  counter += 1;
  return `+2519${(Date.now() + counter).toString().slice(-9)}`;
};

const createdUserIds: number[] = [];

// refresh_tokens.user_id_fkey is CASCADE, so deleting the user alone
// is enough — no separate RefreshToken cleanup needed.
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('auth full round-trip (real database, real hashing, real JWTs)', () => {
  it('signup creates a real user row and a real, correctly-hashed refresh token', async () => {
    const email = uniqueEmail();
    const result = await authService.signup({
      name: 'Integration Test Student',
      email,
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(result.user.id);

    expect(result.user.email).toBe(email);
    expect(result.user.role).toBe('student');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));

    // The stored row must hold the HASH, never the raw token — a
    // mocked repository test can assert this function is called with
    // a hash, but can't prove the hash algorithm actually matches
    // what a real lookup later needs.
    const expectedHash = hashRefreshToken(result.refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: expectedHash } });
    expect(stored).not.toBeNull();
    expect(stored?.userId).toBe(result.user.id);
    expect(stored?.deviceFingerprint).toBeNull(); // signup never carries one
  });

  it('rejects signup with a duplicate email against a real unique constraint', async () => {
    const email = uniqueEmail();
    const first = await authService.signup({
      name: 'First Student',
      email,
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(first.user.id);

    await expect(
      authService.signup({
        name: 'Second Student',
        email, // same email
        phone: uniquePhone(),
        password: 'a-different-password-456',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
  });

  it('login updates lastDeviceFingerprint for real and rejects a genuinely wrong password', async () => {
    const email = uniqueEmail();
    const signupResult = await authService.signup({
      name: 'Integration Test Student',
      email,
      phone: uniquePhone(),
      password: 'correct-password-123',
    });
    createdUserIds.push(signupResult.user.id);

    await expect(
      authService.login({ email, password: 'wrong-password-999' }, '127.0.0.1'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const loginResult = await authService.login(
      { email, password: 'correct-password-123', deviceFingerprint: 'fp_integration_test' },
      '127.0.0.1',
    );

    const reloadedUser = await prisma.user.findUniqueOrThrow({
      where: { id: signupResult.user.id },
    });
    expect(reloadedUser.lastDeviceFingerprint).toBe('fp_integration_test');
    expect(loginResult.user.id).toBe(signupResult.user.id);
  });

  it('refresh rotates the token for real — the old token stops working, the new one works', async () => {
    const email = uniqueEmail();
    const signupResult = await authService.signup({
      name: 'Integration Test Student',
      email,
      phone: uniquePhone(),
      password: 'correct-password-123',
    });
    createdUserIds.push(signupResult.user.id);

    const loginResult = await authService.login(
      { email, password: 'correct-password-123', deviceFingerprint: 'fp_refresh_test' },
      '127.0.0.1',
    );

    const rotated = await authService.refresh(loginResult.refreshToken);
    expect(rotated.accessToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(loginResult.refreshToken);

    // The real question: does Postgres genuinely show the old token
    // as revoked, and does calling refresh AGAIN with that same old
    // token actually get rejected — not just "was revoke() called"
    // the way a mocked repository test would check.
    const oldHash = hashRefreshToken(loginResult.refreshToken);
    const oldStored = await prisma.refreshToken.findUnique({ where: { tokenHash: oldHash } });
    expect(oldStored?.revokedAt).not.toBeNull();

    await expect(authService.refresh(loginResult.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });

    // The new token from rotation must genuinely still work.
    const secondRotation = await authService.refresh(rotated.refreshToken);
    expect(secondRotation.accessToken).toEqual(expect.any(String));
  });

  it('logout revokes the real session, and a subsequent refresh with that token is rejected', async () => {
    const email = uniqueEmail();
    const signupResult = await authService.signup({
      name: 'Integration Test Student',
      email,
      phone: uniquePhone(),
      password: 'correct-password-123',
    });
    createdUserIds.push(signupResult.user.id);

    const loginResult = await authService.login(
      { email, password: 'correct-password-123', deviceFingerprint: 'fp_logout_test' },
      '127.0.0.1',
    );

    await authService.logout(signupResult.user.id, 'fp_logout_test');

    await expect(authService.refresh(loginResult.refreshToken)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });

  it('logout is idempotent — calling it twice, or with no matching session, never throws', async () => {
    const email = uniqueEmail();
    const signupResult = await authService.signup({
      name: 'Integration Test Student',
      email,
      phone: uniquePhone(),
      password: 'correct-password-123',
    });
    createdUserIds.push(signupResult.user.id);

    await authService.login(
      { email, password: 'correct-password-123', deviceFingerprint: 'fp_idempotent_test' },
      '127.0.0.1',
    );

    await authService.logout(signupResult.user.id, 'fp_idempotent_test');
    // Second call, same fingerprint — already revoked, must not throw.
    await expect(
      authService.logout(signupResult.user.id, 'fp_idempotent_test'),
    ).resolves.toBeUndefined();
    // No fingerprint at all — the signup-only-token case, must no-op.
    await expect(authService.logout(signupResult.user.id, undefined)).resolves.toBeUndefined();
  });
});
