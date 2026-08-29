import type { ActivationStatus, Role, SubscriptionStatus } from '@prisma/client';

// Everything a caller outside this module is allowed to see. Deliberately
// excludes passwordHash — nothing past the repository layer should ever
// touch it. See users.service.ts's toPublicUser().
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: Role;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiryDate: Date | null;
  activationStatus: ActivationStatus;
  lastDeviceFingerprint: string | null;
  createdAt: Date;
}

// auth.service hashes the password itself (infrastructure/security/password.ts)
// before calling users.service.createUser — this module never sees a
// plaintext password, only the already-hashed one.
export interface CreateUserInput {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
}
