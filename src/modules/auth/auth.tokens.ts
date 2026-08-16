import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Role } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors/app-error.js';

type TokenPayload = { sub: string; role: Role; type: 'access' | 'refresh'; jti?: string };

const requiredSecret = (name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string => {
  const value = process.env[name];
  if (!value || value.length < 32) throw new AppError(500, `${name} must be set to a value of at least 32 characters`);
  return value;
};

const sign = (payload: TokenPayload, secret: string, expiresIn: NonNullable<SignOptions['expiresIn']>): string =>
  jwt.sign(payload, secret, { expiresIn });

export const issueAccessToken = (userId: number, role: Role): string =>
  sign({ sub: String(userId), role, type: 'access' }, requiredSecret('JWT_ACCESS_SECRET'), '15m');

export const issueRefreshToken = (userId: number, role: Role): string =>
  sign({ sub: String(userId), role, type: 'refresh', jti: randomUUID() }, requiredSecret('JWT_REFRESH_SECRET'), '30d');

const verify = (token: string, secret: string, type: TokenPayload['type']): TokenPayload => {
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    if (payload.type !== type || typeof payload.sub !== 'string' || !Number.isSafeInteger(Number(payload.sub))) {
      throw new Error('Invalid token payload');
    }
    return payload as TokenPayload;
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
};

export const verifyAccessToken = (token: string): TokenPayload =>
  verify(token, requiredSecret('JWT_ACCESS_SECRET'), 'access');

export const verifyRefreshToken = (token: string): TokenPayload =>
  verify(token, requiredSecret('JWT_REFRESH_SECRET'), 'refresh');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
