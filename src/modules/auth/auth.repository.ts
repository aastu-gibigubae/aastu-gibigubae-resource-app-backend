import type { Prisma, RefreshToken } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// Auth never touches the User table directly — per the architecture
// doc's module boundary, that's users.service's job entirely. This
// file owns the one thing that genuinely belongs to auth: RefreshToken.

export const create = (
  userId: number,
  tokenHash: string,
  deviceFingerprint: string | undefined,
  expiresAt: Date,
  tx: PrismaOrTx = prisma,
): Promise<RefreshToken> =>
  tx.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ...(deviceFingerprint === undefined ? {} : { deviceFingerprint }),
    },
  });

export const findByTokenHash = (
  tokenHash: string,
  tx: PrismaOrTx = prisma,
): Promise<RefreshToken | null> => tx.refreshToken.findUnique({ where: { tokenHash } });

export const revoke = (id: number, tx: PrismaOrTx = prisma): Promise<RefreshToken> =>
  tx.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });

// Used by logout — SRS §8.5's /auth/logout request has no body, only
// the access token header, so there's no refresh token to look up
// directly by hash. The access token's deviceFingerprint claim (FR-1.5)
// is what lets logout find the right session instead: whichever active,
// unrevoked, unexpired refresh token for this user carries a matching
// deviceFingerprint.
export const findActiveByUserAndFingerprint = (
  userId: number,
  deviceFingerprint: string,
  tx: PrismaOrTx = prisma,
): Promise<RefreshToken | null> =>
  tx.refreshToken.findFirst({
    where: {
      userId,
      deviceFingerprint,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });