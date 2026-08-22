import bcrypt from 'bcryptjs';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../../shared/errors/app-error.js';
import { hashToken, issueAccessToken, issueRefreshToken, verifyRefreshToken } from './auth.tokens.js';
import type { z } from 'zod';
import type { loginSchema, signUpSchema } from './auth.validation.js';
import { userSelect, type PublicUser } from '../users/user.types.js';

type SignUpInput = z.infer<typeof signUpSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type AuthResult = { user: PublicUser; accessToken: string; refreshToken: string };

const refreshExpiry = (): Date => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  return expiry;
};

const tokensFor = async (user: { id: number; role: PublicUser['role'] }, deviceFingerprint?: string): Promise<Pick<AuthResult, 'accessToken' | 'refreshToken'>> => {
  const accessToken = issueAccessToken(user.id, user.role);
  const refreshToken = issueRefreshToken(user.id, user.role);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      ...(deviceFingerprint === undefined ? {} : { deviceFingerprint }),
      expiresAt: refreshExpiry(),
    },
  });
  return { accessToken, refreshToken };
};

export const signUp = async (input: SignUpInput): Promise<AuthResult> => {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, phone: input.phone, passwordHash },
    select: userSelect,
  });
  return { user, ...(await tokensFor(user, input.deviceFingerprint)) };
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const user = await prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new AppError(401, 'Invalid email or password');

  const { passwordHash: _passwordHash, deletedAt: _deletedAt, lastDeviceFingerprint: _lastDeviceFingerprint, ...publicUser } = user;
  return { user: publicUser, ...(await tokensFor(user, input.deviceFingerprint)) };
};

export const refresh = async (refreshToken: string, deviceFingerprint?: string): Promise<AuthResult> => {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  const storedToken = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() }, user: { deletedAt: null } },
    include: { user: { select: userSelect } },
  });

  if (!storedToken || storedToken.userId !== Number(payload.sub)) throw new AppError(401, 'Invalid or expired token');
  if (storedToken.deviceFingerprint && storedToken.deviceFingerprint !== deviceFingerprint) throw new AppError(401, 'Token does not belong to this device');

  const accessToken = issueAccessToken(storedToken.user.id, storedToken.user.role);
  const nextRefreshToken = issueRefreshToken(storedToken.user.id, storedToken.user.role);
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: storedToken.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({ data: { userId: storedToken.userId, tokenHash: hashToken(nextRefreshToken), deviceFingerprint: storedToken.deviceFingerprint, expiresAt: refreshExpiry() } }),
  ]);
  return { user: storedToken.user, accessToken, refreshToken: nextRefreshToken };
};

export const logout = async (refreshToken: string): Promise<void> => {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
};
