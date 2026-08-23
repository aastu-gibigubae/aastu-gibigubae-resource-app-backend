import type { Notification, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';
import { NotFoundError } from '../../shared/errors/app-errors';
import * as notificationsRepository from './notifications.repository';
import type { PublicNotification } from './notifications.types';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// SRS §8.5 gives exact wording for only one of these three:
// premium_approved -> "Your premium access has been approved!"
// The other two are NOT specified anywhere in the SRS — this wording is
// my own placeholder, flagged here the same way the SRS flags its own
// open items. Worth a quick team review before this ships for real,
// since it's user-facing copy, not a technical decision.
//
// Written as an exhaustive switch rather than a Record lookup — with
// noUncheckedIndexedAccess enabled (tsconfig.json), a Record lookup
// always types as `string | undefined` even when every key is covered.
// A switch lets TypeScript prove exhaustiveness instead: adding a new
// NotificationType later without updating this function is a compile
// error, not a silent undefined message at runtime.
const getMessageTemplate = (type: NotificationType): string => {
  switch (type) {
    case 'premium_approved':
      return 'Your premium access has been approved!';
    case 'subscription_expiring':
      return 'Your subscription is expiring soon — renew to keep uninterrupted access.'; // NOT in SRS, placeholder
    case 'issue_report_addressed':
      return 'Your reported issue has been addressed.'; // NOT in SRS, placeholder
    default: {
      const exhaustiveCheck: never = type;
      throw new Error(`Unhandled notification type: ${String(exhaustiveCheck)}`);
    }
  }
};

const toPublicNotification = (notification: Notification): PublicNotification => ({
  id: notification.id,
  type: notification.type,
  message: notification.message,
  readStatus: notification.readStatus,
  createdAt: notification.createdAt,
});

// Named and ordered exactly as architecture doc Flow 2 calls it:
// notifications.service.create(targetUserId, 'premium_approved', tx)
// tx defaults to the regular client so this also works as a standalone
// call outside a larger transaction (e.g. Phase 4's daily expiry job,
// which isn't part of any other multi-table transaction).
export const create = async (
  userId: number,
  type: NotificationType,
  tx: PrismaOrTx = prisma,
  relatedResourceId?: number,
): Promise<PublicNotification> => {
  const message = getMessageTemplate(type);
  const notification = await notificationsRepository.create(
    userId,
    type,
    message,
    relatedResourceId,
    tx,
  );
  return toPublicNotification(notification);
};

export const list = async (userId: number): Promise<PublicNotification[]> => {
  const notifications = await notificationsRepository.findByUser(userId);
  return notifications.map(toPublicNotification);
};

export const markRead = async (notificationId: number, userId: number): Promise<void> => {
  const updatedCount = await notificationsRepository.markRead(notificationId, userId);
  if (updatedCount === 0) {
    // Deliberately the same error whether the notification doesn't
    // exist at all, or exists but belongs to someone else — doesn't
    // leak which case it is.
    throw new NotFoundError('Notification not found');
  }
};