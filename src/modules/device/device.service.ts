import type { Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';
import { ConflictError, NotFoundError } from '../../shared/errors/app-errors';
import * as usersService from '../users/users.service';
import * as deviceRepository from './device.repository';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// Named exactly as architecture doc Flow 1 calls it:
// device.service.isDeviceValid(userId, deviceFingerprint).
//
// Deliberately a plain boolean, not a richer "why not" result — by the
// time catalog's access-policy (Phase 3) calls this, it's already
// confirmed activationStatus === 'activated' via
// users.service.getSubscriptionStatus, which means an active
// DeviceRecord is guaranteed to exist (activation always creates one,
// see activateFromLastLogin below). So `false` here can only mean a
// real fingerprint mismatch — exactly what FR-3.3a needs to detect.
export const isDeviceValid = async (
  userId: number,
  deviceFingerprint: string,
): Promise<boolean> => {
  const activeDevice = await deviceRepository.findActiveDeviceRecord(userId);
  return activeDevice?.deviceFingerprint === deviceFingerprint;
};

// Named exactly as architecture doc Flow 2 calls it:
// device.service.activateFromLastLogin(targetUserId, adminId, tx).
//
// Called from inside premium.service.grantPremium's single atomic
// transaction (FR-4.3) — tx is required here, not optional, since this
// function should never run standalone outside that transaction; it's
// one step of a larger atomic action, not an independent operation.
//
// Owns the *complete* concept of "activate a device" per the
// architecture doc's description of what this module owns — including
// flipping User.activationStatus, not just creating the DeviceRecord
// row. Splitting that across two modules would leave a moment where a
// DeviceRecord exists but activationStatus still says 'pending', which
// is exactly the kind of partial-state the transaction wrapping this
// whole flow (FR-4.3) exists to prevent.
export const activateFromLastLogin = async (
  targetUserId: number,
  adminId: number,
  tx: Prisma.TransactionClient,
): Promise<{ deviceId: number }> => {
  const targetUser = await usersService.findById(targetUserId);

  // SRS's exact documented error for grant-premium: 409 NO_DEVICE_ON_FILE
  // — the student has never logged in, so there's no fingerprint to
  // activate a device with yet.
  if (!targetUser?.lastDeviceFingerprint) {
    throw new ConflictError(
      'NO_DEVICE_ON_FILE',
      'This student has never logged in — nothing to activate yet',
    );
  }

  // Not explicitly spec'd — my own defensive addition. The documented
  // flow (FR-5.5) always revokes an existing device before this ever
  // runs again for the same user, so this branch shouldn't normally
  // fire. But without this check, a double-call (e.g. an admin
  // double-clicking grant-premium) would hit the partial unique index
  // (one_active_device_per_user) and surface as a raw, unreadable
  // Postgres constraint violation instead of a clear application error.
  const existingActiveDevice = await deviceRepository.findActiveDeviceRecord(targetUserId, tx);
  if (existingActiveDevice) {
    throw new ConflictError(
      'DEVICE_ALREADY_ACTIVE',
      'This student already has an active device. Revoke it first before activating a new one.',
    );
  }

  const device = await deviceRepository.create(
    targetUserId,
    targetUser.lastDeviceFingerprint,
    adminId,
    tx,
  );
  await usersService.setActivationStatus(targetUserId, 'activated', tx);

  // Returned so premium.service.grantPremium can include device_id in
  // its response (SRS's exact documented shape for
  // POST /admin/users/:id/grant-premium).
  return { deviceId: device.id };
};

// For POST /admin/users/:id/revoke-device.
export const revokeDevice = async (
  targetUserId: number,
  adminId: number,
): Promise<{ id: number; revokedAt: Date }> => {
  const activeDevice = await deviceRepository.findActiveDeviceRecord(targetUserId);

  // Not an SRS-specified error code — my own choice, open to renaming.
  if (!activeDevice) {
    throw new NotFoundError('This student has no active device to revoke', 'NO_ACTIVE_DEVICE');
  }

  const revoked = await deviceRepository.revoke(activeDevice.id, adminId);

  // Deliberately does NOT touch activationStatus — SRS's own reasoning:
  // "they haven't lost what they paid for, just the device it was tied
  // to." Access still locks immediately regardless, since isDeviceValid
  // will find no active DeviceRecord at all once this commits.
  return { id: revoked.id, revokedAt: revoked.revokedAt! };
};

export interface HeartbeatResult {
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiryDate: Date | null;
  locked: boolean;
  reasonCode?: 'device_mismatch';
  message?: string;
}

const DEVICE_MISMATCH_MESSAGE =
  'This account is activated on a different device. Contact the admin via Telegram to reactivate.';

// For POST /verify/heartbeat. reverification_overdue intentionally
// dropped per team decision — no field anywhere tracks "last
// successful heartbeat," and FR-5.3's own wording places that timing
// logic client-side, not here. This function only ever answers with
// what's true right now.
export const checkHeartbeat = async (
  userId: number,
  deviceFingerprint: string,
): Promise<HeartbeatResult> => {
  // FR-5.4 — logged on every verification call for anomaly monitoring.
  // Placeholder: a structured console log only, not a persisted table —
  // deferred by team decision; revisit if this needs to be genuinely
  // queryable later (e.g. a VerificationLog table).
  console.log('[heartbeat]', { userId, deviceFingerprint, at: new Date().toISOString() });

  const status = await usersService.getSubscriptionStatus(userId);

  // Defensive — userId comes from a verified JWT (requireAuth), so a
  // missing user here would mean the account was deleted after the
  // token was issued. Treat the same as "not subscribed" rather than
  // throwing, since there's no meaningful "not found" response
  // documented for this endpoint.
  if (
    !status ||
    status.subscriptionStatus !== 'active' ||
    status.activationStatus !== 'activated'
  ) {
    return {
      subscriptionStatus: status?.subscriptionStatus ?? 'none',
      subscriptionExpiryDate: status?.subscriptionExpiryDate ?? null,
      locked: true,
    };
  }

  const deviceValid = await isDeviceValid(userId, deviceFingerprint);
  if (!deviceValid) {
    return {
      subscriptionStatus: status.subscriptionStatus,
      subscriptionExpiryDate: status.subscriptionExpiryDate,
      locked: true,
      reasonCode: 'device_mismatch',
      message: DEVICE_MISMATCH_MESSAGE,
    };
  }

  return {
    subscriptionStatus: status.subscriptionStatus,
    subscriptionExpiryDate: status.subscriptionExpiryDate,
    locked: false,
  };
};
