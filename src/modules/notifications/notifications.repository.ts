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


// For jobs/subscription-expiry.job.ts's duplicate-send guard — belt-
// and-suspenders against the job firing the same subscription_expiring
// warning twice if it's ever accidentally run more than once in the
// same day (e.g. a crash-restart). The job's own 24h trigger window
// already makes this unlikely under normal daily-cron operation; this
// is the extra safety net, not the primary defense.
export const hasRecentNotificationOfType = async (
  userId: number,
  type: NotificationType,
  since: Date,
  tx: PrismaOrTx = prisma,
): Promise<boolean> => {
  const existing = await tx.notification.findFirst({
    where: { userId, type, createdAt: { gte: since } },
    select: { id: true },
  });
  return existing !== null;
};