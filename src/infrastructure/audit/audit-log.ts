import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma-client';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export const writeAuditLog = (
  adminId: number,
  actionType: string,
  targetType: string,
  targetId: number,
  tx: PrismaOrTx = prisma,
): Promise<{ id: number }> =>
  tx.adminActionLog.create({
    data: { adminId, actionType, targetType, targetId },
    select: { id: true },
  });
