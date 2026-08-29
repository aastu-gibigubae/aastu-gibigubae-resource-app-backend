import type { ActivationStatus, Prisma, User } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';
import type { CreateUserInput } from './users.types';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// Every function here returns the full Prisma User row, passwordHash
// included — auth.service needs it for login's password comparison.
// Stripping it down to the safe PublicUser shape is users.service's job,
// not this file's. Per architecture doc: repositories are the only place
// allowed to touch Prisma directly; every function threads an optional
// tx so callers can fold a write into a larger transaction (e.g.
// premium.service.grantPremium's single atomic transaction, FR-4.3).
//
// The three lookups below filter deletedAt: null. No admin-deactivate
// endpoint exists yet in v1, so this has no visible effect today — but
// User soft-deletes via deleted_at (DB doc §13: "deactivation, not
// deletion"), and adding the filter now means every lookup across every
// module already respects it the moment that endpoint is built, instead
// of relying on someone remembering to update each call site later.

export const findByEmail = (email: string, tx: PrismaOrTx = prisma): Promise<User | null> =>
  tx.user.findFirst({ where: { email, deletedAt: null } });

export const findByPhone = (phone: string, tx: PrismaOrTx = prisma): Promise<User | null> =>
  tx.user.findFirst({ where: { phone, deletedAt: null } });

export const findById = (id: number, tx: PrismaOrTx = prisma): Promise<User | null> =>
  tx.user.findFirst({ where: { id, deletedAt: null } });

export const create = (data: CreateUserInput, tx: PrismaOrTx = prisma): Promise<User> =>
  tx.user.create({ data });

// FR-1.5 — written on every login, not just the first, so it always
// reflects whichever device most recently logged in.
export const updateLastDeviceFingerprint = (
  userId: number,
  fingerprint: string,
  tx: PrismaOrTx = prisma,
): Promise<User> =>
  tx.user.update({
    where: { id: userId },
    data: { lastDeviceFingerprint: fingerprint },
  });

// FR-4.3 — one piece of grant-premium's atomic transaction: sets
// subscription_status = active with a 12-month expiry (the expiry date
// itself is computed by the caller, premium.service, using
// shared/utils/date-math.ts once that exists in Phase 2 — this function
// just persists whatever date it's given).
export const setSubscriptionActive = (
  userId: number,
  expiryDate: Date,
  tx: PrismaOrTx = prisma,
): Promise<User> =>
  tx.user.update({
    where: { id: userId },
    data: { subscriptionStatus: 'active', subscriptionExpiryDate: expiryDate },
  });

// Called by the device module when it activates (or revokes) a device —
// activation_status lives on User, but the decision of *when* to flip it
// belongs to device.service, not here. This function only persists it.
export const setActivationStatus = (
  userId: number,
  status: ActivationStatus,
  tx: PrismaOrTx = prisma,
): Promise<User> => tx.user.update({ where: { id: userId }, data: { activationStatus: status } });


// For jobs/subscription-expiry.job.ts — FR-7.3's silent daily sweep.
// Bulk updateMany, not per-row: this is a scheduled system process,
// not a request handling one specific user, so there's no meaningful
// "which user" to thread through the way every other function in this
// file does. Returns the count of rows actually flipped, for the job's
// own summary log — deliberately no notification and no AdminActionLog
// entry (this isn't an admin action, and the NotificationType enum has
// no "just expired" variant — only subscription_expiring exists).
export const expireOverdueSubscriptions = async (tx: PrismaOrTx = prisma): Promise<number> => {
  const result = await tx.user.updateMany({
    where: { subscriptionStatus: 'active', subscriptionExpiryDate: { lt: new Date() } },
    data: { subscriptionStatus: 'expired' },
  });
  return result.count;
};

// For jobs/subscription-expiry.job.ts — FR-7.1's ~7-day-out warning.
// windowStart/windowEnd are computed by the job itself
// (shared/utils/date-math.ts's addDays), not here — this function is
// just the query, same separation of concerns as every other
// repository function in this file.
export const findUsersExpiringBetween = (
  windowStart: Date,
  windowEnd: Date,
  tx: PrismaOrTx = prisma,
): Promise<User[]> =>
  tx.user.findMany({
    where: {
      subscriptionStatus: 'active',
      subscriptionExpiryDate: { gte: windowStart, lt: windowEnd },
    },
  });