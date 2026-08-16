import type { User } from '../../generated/prisma/client.js';

export const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  subscriptionStatus: true,
  subscriptionExpiryDate: true,
  activationStatus: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = Pick<
  User,
  | 'id'
  | 'name'
  | 'email'
  | 'phone'
  | 'role'
  | 'subscriptionStatus'
  | 'subscriptionExpiryDate'
  | 'activationStatus'
  | 'createdAt'
  | 'updatedAt'
>;
