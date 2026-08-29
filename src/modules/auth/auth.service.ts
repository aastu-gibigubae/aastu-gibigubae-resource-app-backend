import { REFRESH_TOKEN_TTL_DAYS } from '../../config/constants';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../infrastructure/security/jwt';
import { hashPassword, verifyPassword } from '../../infrastructure/security/password';
import { BadRequestError, UnauthorizedError } from '../../shared/errors/app-errors';
import { recordFailedAttempt, resetAttempts } from '../../shared/middleware/rate-limit';
import * as usersService from '../users/users.service';
import * as authRepository from './auth.repository';
import type { AuthResult, LoginInput, SignupInput, TokenPair } from './auth.types';

const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const issueAndPersistTokenPair = async (
  userId: number,
  role: 'student' | 'admin',
  deviceFingerprint?: string,
): Promise<TokenPair> => {
  // Same conditional-spread pattern as jwt.ts's own AccessTokenPayload
  // construction: exactOptionalPropertyTypes rejects passing an
  // explicit `deviceFingerprint: undefined` into a property typed
  // `deviceFingerprint?: string` (no explicit `| undefined`) — the key
  // must be entirely absent when there's no real value, not present
  // with an undefined value.
  const payload = {
    userId,
    role,
    ...(deviceFingerprint === undefined ? {} : { deviceFingerprint }),
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await authRepository.create(
    userId,
    hashRefreshToken(refreshToken),
    deviceFingerprint,
    new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  );

  return { accessToken, refreshToken };
};

// SRS §8.5 signup — no email verification, logs the student straight in.
// role is never accepted as input (FR-1.6) — createUser doesn't even
// have a parameter for it; users.repository.create relies on the
// schema's server-side default (role: student).
export const signup = async (input: SignupInput): Promise<AuthResult> => {
  const existingByEmail = await usersService.findByEmail(input.email);
  if (existingByEmail) {
    throw new BadRequestError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
  }

  // Not an SRS-specified error code — phone itself is our own addition
  // to the schema, so there's no spec'd code for its duplicate case.
  // Named to parallel EMAIL_ALREADY_EXISTS.
  const existingByPhone = await usersService.findByPhone(input.phone);
  if (existingByPhone) {
    throw new BadRequestError(
      'PHONE_ALREADY_EXISTS',
      'An account with this phone number already exists',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const user = await usersService.createUser({
    name: input.name,
    email: input.email,
    phone: input.phone,
    passwordHash,
  });

  // No device fingerprint — SRS's signup request body has no such
  // field, only login's does (FR-1.5).
  const tokens = await issueAndPersistTokenPair(user.id, user.role);

  return { ...tokens, user };
};

// SRS §8.5 login — also the entry point that keeps
// User.last_device_fingerprint current (FR-1.5), which is what an
// Admin later reads when running grant-premium.
export const login = async (input: LoginInput, ip: string): Promise<AuthResult> => {
  const user = await usersService.findByEmailWithCredentials(input.email);

  if (!user) {
    recordFailedAttempt(input.email, ip);
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    recordFailedAttempt(input.email, ip);
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  resetAttempts(input.email, ip);

  await usersService.updateLastDeviceFingerprint(user.id, input.deviceFingerprint);

  const tokens = await issueAndPersistTokenPair(user.id, user.role, input.deviceFingerprint);
  const publicUser = await usersService.findById(user.id);

  // Defensive — the user we just updated two lines ago can't realistically
  // be gone now; findById returning null here would mean a delete raced
  // this request. Not a documented error case for login, so treat it as
  // the same INVALID_CREDENTIALS response rather than inventing a new one.
  if (!publicUser) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  return { ...tokens, user: publicUser };
};

// SRS §8.5 refresh — rotation: each use issues a new pair and
// invalidates the prior (FR-1.3). Every failure path here — bad
// signature, not found, already revoked, expired — deliberately
// collapses to the same 401 REFRESH_TOKEN_INVALID, matching the SRS's
// own framing: the client's only correct response to any of these is
// "force a full re-login," so there's nothing useful gained by
// distinguishing them, and doing so would leak which case applied.
export const refresh = async (refreshToken: string): Promise<TokenPair> => {
  const invalidError = new UnauthorizedError(
    'Invalid or expired refresh token',
    'REFRESH_TOKEN_INVALID',
  );

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw invalidError;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await authRepository.findByTokenHash(tokenHash);

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw invalidError;
  }

  await authRepository.revoke(stored.id);

  // Carries the same device fingerprint forward — dropping it on
  // rotation would silently break FR-3.3a's device-binding check on
  // every request until the student's next full login.
  return issueAndPersistTokenPair(
    payload.userId,
    payload.role,
    stored.deviceFingerprint ?? undefined,
  );
};

// SRS §8.5 logout — ends the current session only, deliberately leaves
// activation_status and DeviceRecord untouched (FR-1.7). Takes no
// refresh token (the request has no body, only the access token
// header) — deviceFingerprint comes from the access token's own claim
// instead, since that's the only thing identifying "which session"
// this is.
export const logout = async (
  userId: number,
  deviceFingerprint: string | undefined,
): Promise<void> => {
  // No fingerprint on the access token at all (e.g. a signup-issued
  // token that never went through login) — there's no session to look
  // up. Not an error case worth surfacing; nothing to revoke, so this
  // just no-ops.
  if (!deviceFingerprint) return;

  const activeToken = await authRepository.findActiveByUserAndFingerprint(
    userId,
    deviceFingerprint,
  );
  // Already logged out, or never had a matching session — idempotent
  // either way, calling logout twice shouldn't error.
  if (!activeToken) return;

  await authRepository.revoke(activeToken.id);
};
