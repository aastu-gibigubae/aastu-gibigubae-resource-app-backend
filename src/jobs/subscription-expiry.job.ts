import { SUBSCRIPTION_EXPIRY_WARNING_DAYS } from '../config/constants';
import { addDays } from '../shared/utils/date-math';
import * as notificationsService from '../modules/notifications/notifications.service';
import * as usersService from '../modules/users/users.service';

export interface SubscriptionExpiryJobResult {
  expiredCount: number;
  notifiedCount: number;
}

// FR-7.3: "Subscription-expiry check shall run as a scheduled daily
// job, creating in-app Notification rows only." Read as scoping the
// job's side effects (no external calls, no auto-revoking a device,
// nothing that reaches outside the database) rather than a literal ban
// on ever touching User.subscriptionStatus — users.service's own
// getSubscriptionStatus comment (written back in Phase 1) explicitly
// deferred "who flips active -> expired" to this job, and
// access-policy.ts only ever checks the stored subscriptionStatus, not
// subscriptionExpiryDate directly. Without this job actually flipping
// the status, access would silently stay unlocked forever past a
// student's real expiry date.
//
// Top of the module dependency graph (architecture doc: "jobs/ depends
// on premium, notifications — nothing depends on jobs"). In practice
// this only needs users + notifications directly — premium never
// exposes anything a scheduled sweep would call, it only orchestrates
// the one-time grant action.
//
// Two independent, unrelated pieces of work, run every day:
export const runSubscriptionExpiryJob = async (): Promise<SubscriptionExpiryJobResult> => {
  // 1. Silently expire anyone whose subscriptionExpiryDate has already
  // passed. No notification — the NotificationType enum has no "just
  // expired" variant, only subscription_expiring (the warning, below).
  const expiredCount = await usersService.expireOverdueSubscriptions();

  // 2. Warn anyone entering the ~7-day-out window (FR-7.1). A narrow
  // 24h bucket exactly SUBSCRIPTION_EXPIRY_WARNING_DAYS out, rather
  // than "anyone within the next 7 days" — the latter would re-match
  // the same student every day of that week and send 7 warnings
  // instead of one. Under a normal once-daily cron, each student's
  // expiryDate passes through this bucket exactly once.
  const now = new Date();
  const windowStart = addDays(now, SUBSCRIPTION_EXPIRY_WARNING_DAYS);
  const windowEnd = addDays(windowStart, 1);

  const expiringSoon = await usersService.findUsersExpiringBetween(windowStart, windowEnd);

  let notifiedCount = 0;
  for (const user of expiringSoon) {
    // Belt-and-suspenders duplicate guard — see
    // notifications.repository.hasRecentNotificationOfType's own
    // comment for why this exists alongside the narrow window above.
    const alreadyNotifiedToday = await notificationsService.hasRecentNotificationOfType(
      user.id,
      'subscription_expiring',
      addDays(now, -1),
    );
    if (alreadyNotifiedToday) continue;

    await notificationsService.create(user.id, 'subscription_expiring');
    notifiedCount += 1;
  }

  return { expiredCount, notifiedCount };
};
