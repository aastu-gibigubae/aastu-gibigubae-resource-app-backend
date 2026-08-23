import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { env } from '../../config/env';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_DAYS } from '../../config/constants';
import { UnauthorizedError } from '../../shared/errors/app-errors';

type TokenType = 'access' | 'refresh';

interface TokenClaims {
  sub: string; // user id, as a string — JWT convention
  role: Role;
  type: TokenType;
  // The device fingerprint claim (architecture doc §3: "embeds device
  // fingerprint claim"). require-auth.ts reads this into
  // req.deviceFingerprint (FR-1.5), which catalog's access-policy then
  // compares against the student's active DeviceRecord (FR-3.3/3.3a) —
  // this claim is what makes that whole check possible.
  //
  // Absent on signup-issued tokens: SRS §8.5's signup request body has
  // no device_fingerprint field, only login's does. A student's first
  // token (from signup) simply won't carry one until they call
  // /auth/login for real.
  deviceFingerprint?: string;
  jti?: string; // refresh tokens only — unique per token, needed for rotation/reuse detection
}

export interface AccessTokenPayload {
  userId: number;
  role: Role;
  deviceFingerprint?: string;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  jti: string;
}

type ExpiresIn = NonNullable<SignOptions['expiresIn']>;

const sign = (claims: TokenClaims, secret: string, expiresIn: ExpiresIn): string =>
  jwt.sign(claims, secret, { expiresIn });

export const signAccessToken = (payload: AccessTokenPayload): string =>
  sign(
    {
      sub: String(payload.userId),
      role: payload.role,
      type: 'access',
      ...(payload.deviceFingerprint === undefined
        ? {}
        : { deviceFingerprint: payload.deviceFingerprint }),
    },
    env.JWT_ACCESS_SECRET,
    ACCESS_TOKEN_TTL,
  );

export const signRefreshToken = (payload: AccessTokenPayload): string =>
  sign(
    {
      sub: String(payload.userId),
      role: payload.role,
      type: 'refresh',
      jti: randomUUID(),
      ...(payload.deviceFingerprint === undefined
        ? {}
        : { deviceFingerprint: payload.deviceFingerprint }),
    },
    env.JWT_REFRESH_SECRET,
    REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60, // seconds — jsonwebtoken's expiresIn accepts a plain number here, sidestepping the strict "15m"/"30d"-style string pattern entirely
  );

const verify = (token: string, secret: string, expectedType: TokenType): TokenClaims => {
  let decoded: JwtPayload | string;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    decoded.type !== expectedType ||
    typeof decoded.sub !== 'string' ||
    !Number.isSafeInteger(Number(decoded.sub))
  ) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  return decoded as unknown as TokenClaims;
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const claims = verify(token, env.JWT_ACCESS_SECRET, 'access');
  return {
    userId: Number(claims.sub),
    role: claims.role,
    ...(claims.deviceFingerprint === undefined
      ? {}
      : { deviceFingerprint: claims.deviceFingerprint }),
  };
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const claims = verify(token, env.JWT_REFRESH_SECRET, 'refresh');
  if (!claims.jti) throw new UnauthorizedError('Invalid or expired token');
  return {
    userId: Number(claims.sub),
    role: claims.role,
    jti: claims.jti,
    ...(claims.deviceFingerprint === undefined
      ? {}
      : { deviceFingerprint: claims.deviceFingerprint }),
  };
};

// RefreshToken.token_hash — never store the raw token (DB doc §5, same
// principle as passwords: a DB leak would otherwise mean near-total
// account takeover for up to 30 days).
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');