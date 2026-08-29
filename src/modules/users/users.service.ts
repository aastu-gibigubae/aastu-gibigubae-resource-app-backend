import type { ActivationStatus, SubscriptionStatus, User } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';
import * as usersRepository from './users.repository';
import type { CreateUserInput, PublicUser } from './users.types';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// Strips passwordHash before anything leaves this module. Every function
// below that returns user data to a caller outside this module goes
// through this — the one exception is findByEmailWithCredentials, used
// only by auth's login flow, which is named explicitly so it's obvious
// at the call site that it's handling sensitive data.
const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  subscriptionStatus: user.subscriptionStatus,
  subscriptionExpiryDate: user.subscriptionExpiryDate,
  activationStatus: user.activationStatus,
  lastDeviceFingerprint: user.lastDeviceFingerprint,
  createdAt: user.createdAt,
});

// For auth.service's login flow only — needs passwordHash to verify the
// submitted password. Named explicitly (not just "findByEmail") so it's
// obvious at the call site that this returns sensitive data other
// callers shouldn't reach for.
export const findByEmailWithCredentials = (email: string): Promise<User | null> =>
  usersRepository.findByEmail(email);

export const findByEmail = async (email: string): Promise<PublicUser | null> => {
  const user = await usersRepository.findByEmail(email);
  return user ? toPublicUser(user) : null;
};

export const findByPhone = async (phone: string): Promise<PublicUser | null> => {
  const user = await usersRepository.findByPhone(phone);
  return user ? toPublicUser(user) : null;
};

export const findById = async (id: number): Promise<PublicUser | null> => {
  const user = await usersRepository.findById(id);
  return user ? toPublicUser(user) : null;
};

export const createUser = async (
  input: CreateUserInput,
  tx: PrismaOrTx = prisma,
): Promise<PublicUser> => {
  const user = await usersRepository.create(input, tx);
  return toPublicUser(user);
};

// FR-1.5 — called on every login.
export const updateLastDeviceFingerprint = async (
  userId: number,
  fingerprint: string,
  tx: PrismaOrTx = prisma,
): Promise<PublicUser> => {
  const user = await usersRepository.updateLastDeviceFingerprint(userId, fingerprint, tx);
  return toPublicUser(user);
};

// FR-4.3 — one step of grant-premium's atomic transaction.
export const setSubscriptionActive = async (
  userId: number,
  expiryDate: Date,
  tx: PrismaOrTx = prisma,
): Promise<PublicUser> => {
  const user = await usersRepository.setSubscriptionActive(userId, expiryDate, tx);
  return toPublicUser(user);
};

export const setActivationStatus = async (
  userId: number,
  status: ActivationStatus,
  tx: PrismaOrTx = prisma,
): Promise<PublicUser> => {
  const user = await usersRepository.setActivationStatus(userId, status, tx);
  return toPublicUser(user);
};

// Named exactly as architecture doc Flow 1 calls it:
// users.service.getSubscriptionStatus(userId) — catalog's access-policy
// (Phase 3) calls this to help decide locked/unlocked, combined
// separately with device.service.isDeviceValid.
//
// Returns both subscriptionStatus AND activationStatus — not just
// subscription, despite the name matching the architecture doc's call
// site exactly. FR-3.3 requires all three checked together:
// subscription_status = active, activation_status = activated, AND the
// device fingerprint match (device module's job, not this one). Both
// user-level flags live on the same row, so one query covers both
// rather than access-policy needing a second call just for activation.
//
// Returns whatever is currently stored, no inferred "is this actually
// still valid based on today's date" logic — see the note above this
// file about who's responsible for flipping status to 'expired'. That
// decision belongs wherever it gets resolved (Phase 4's daily job, most
// likely), not here.
export const getSubscriptionStatus = async (
  userId: number,
): Promise<{
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiryDate: Date | null;
  activationStatus: ActivationStatus;
} | null> => {
  const user = await usersRepository.findById(userId);
  if (!user) return null;
  return {
    subscriptionStatus: user.subscriptionStatus,
    subscriptionExpiryDate: user.subscriptionExpiryDate,
    activationStatus: user.activationStatus,
  };
};


// For jobs/subscription-expiry.job.ts — thin pass-throughs, same
// module-boundary rule as every other cross-module call in this app
// (catalog.service.resourceExists, device.service.isDeviceValid): the
// job reads/writes users through this service, never through
// users.repository directly.
export const expireOverdueSubscriptions = (): Promise<number> => usersRepository.expireOverdueSubscriptions();

export const findUsersExpiringBetween = async (
  windowStart: Date,
  windowEnd: Date,
): Promise<PublicUser[]> => {
  const users = await usersRepository.findUsersExpiringBetween(windowStart, windowEnd);
  return users.map(toPublicUser);
};