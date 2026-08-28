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

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await usersService.setSubscriptionActive(targetUserId, expiryDate, tx);
    await premiumRepository.createBookkeepingRecord(targetUserId, note, adminId, tx);

    // Cross-module call — device owns everything about the actual
    // binding (DeviceRecord creation + activationStatus flip); premium
    // only orchestrates, per the architecture doc's explicit framing
    // of this as "the clearest example in the whole system of one
    // module coordinating several others without duplicating their
    // logic." Throws NO_DEVICE_ON_FILE / DEVICE_ALREADY_ACTIVE itself
    // if either guard fails — those propagate up and roll back the
    // whole transaction, exactly as intended.
    const { deviceId } = await deviceService.activateFromLastLogin(targetUserId, adminId, tx);

    // Cross-module call — reuses the exact SRS-worded 'premium_approved'
    // template already built in Phase 1's notifications module.
    await notificationsService.create(targetUserId, 'premium_approved', tx);

    // 'grant_premium' as its own named actionType, matching the
    // architecture doc's own Flow 2 pseudocode exactly — distinct from
    // the generic 'create'/'update'/'delete' verbs used by catalog's
    // CRUD actions, since this is a single named admin action, not a
    // CRUD operation on a Prisma model.
    await writeAuditLog(adminId, 'grant_premium', 'User', targetUserId, tx);

    return { deviceId };
  });

  return {
    userId: targetUserId,
    subscriptionStatus: 'active',
    subscriptionExpiryDate: expiryDate,
    activationStatus: 'activated',
    deviceId: result.deviceId,
  };
};