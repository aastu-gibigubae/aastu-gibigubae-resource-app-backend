import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export const create = (
  userId: number,
  type: NotificationType,
  message: string,
  relatedResourceId: number | undefined,
  tx: PrismaOrTx = prisma,
): Promise<Notification> =>
  tx.notification.create({
    data: {
      userId,
      type,
      message,
      ...(relatedResourceId === undefined ? {} : { relatedResourceId }),
    },
  });

export const findByUser = (userId: number, tx: PrismaOrTx = prisma): Promise<Notification[]> =>
  tx.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

// Filters by userId as well as id — a student marking notification #5 as
// read should only succeed if #5 actually belongs to them. Returns the
// Prisma update count so the service can tell "not found" apart from
// "found and updated" without a separate read query first.
export const markRead = async (
  notificationId: number,
  userId: number,
  tx: PrismaOrTx = prisma,
): Promise<number> => {
  const result = await tx.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readStatus: true },
  });
  return result.count;
};