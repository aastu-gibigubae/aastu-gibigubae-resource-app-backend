import type { Prisma } from '@prisma/client';
import { SUBSCRIPTION_DURATION_MONTHS } from '../../config/constants';
import { prisma } from '../../infrastructure/database/prisma-client';
import { writeAuditLog } from '../../infrastructure/audit/audit-log';
import { NotFoundError } from '../../shared/errors/app-errors';
import { addMonths } from '../../shared/utils/date-math';
import * as deviceService from '../device/device.service';
import * as notificationsService from '../notifications/notifications.service';
import * as usersService from '../users/users.service';
import * as premiumRepository from './premium.repository';
import type { GrantPremiumResult } from './premium.types';

// For GET /admin/users?email= — reuses users.service.findByEmail
// directly rather than adding new logic here. PublicUser already
// carries every field the SRS's documented response needs (id, name,
// email, subscription_status, activation_status,
// last_device_fingerprint) — this module's own job is orchestrating
// grant-premium, not re-implementing a user lookup that already
// exists. 404 USER_NOT_FOUND is the same error code grant-premium
// itself uses, for consistency.
export const findUserByEmail = async (email: string) => {
  const user = await usersService.findByEmail(email);
  if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  return user;
};

// Named exactly as architecture doc Flow 2 calls it:
// premium.service.grantPremium(adminId, targetUserId, note).
//
// This is the single most important admin action in the app (SRS's own
// framing) — everything below runs inside one prisma.$transaction so a
// partial failure (e.g. subscription flipped but device activation
// failing) can never leave the account in a half-granted state
// (architecture doc: "Multi-table writes... shall be wrapped in a
// database transaction to prevent partial-state failures").
//
// Also doubles, unchanged, as the device-replace reactivation flow
// (FR-5.5) — a second call for a user whose subscriptionStatus is
// already 'active' still runs the same five steps; setSubscriptionActive
// simply re-writes the same status and a fresh 12-month expiry (SRS
// doesn't say to skip re-extending it on reactivation, and there's no
// harm in a paying, already-approved student getting a clean expiry
// window from the reactivation date), and activateFromLastLogin does
// the actual gating — it only succeeds if there's no currently active
// device, which is exactly the state after admin has first called
// revoke-device.
export const grantPremium = async (
  adminId: number,
  targetUserId: number,
  note: string | undefined,
): Promise<GrantPremiumResult> => {
  const targetUser = await usersService.findById(targetUserId);
  if (!targetUser) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }

  const expiryDate = addMonths(new Date(), SUBSCRIPTION_DURATION_MONTHS);

  const result = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await usersService.setSubscriptionActive(targetUserId, expiryDate, tx);
      await premiumRepository.createBookkeepingRecord(targetUserId, note, adminId, tx);
      const { deviceId } = await deviceService.activateFromLastLogin(targetUserId, adminId, tx);
      await notificationsService.create(targetUserId, 'premium_approved', tx);
      await writeAuditLog(adminId, 'grant_premium', 'User', targetUserId, tx);
      return { deviceId };
    },
    // Five sequential round trips against serverless Postgres (Neon) —
    // each is its own network hop, plus Neon's free-tier compute can
    // add real cold-start latency. Prisma's default interactive-
    // transaction timeout is 5000ms; bumped so a slow network moment
    // doesn't turn into an admin-facing 500 mid-grant. Caught for real
    // by this module's own integration test failing against a Neon
    // instance that had gone idle — not a hypothetical.
    { maxWait: 10_000, timeout: 15_000 },
  );

  return {
    userId: targetUserId,
    subscriptionStatus: 'active',
    subscriptionExpiryDate: expiryDate,
    activationStatus: 'activated',
    deviceId: result.deviceId,
  };
};