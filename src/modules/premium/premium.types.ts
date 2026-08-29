import type { ActivationStatus, SubscriptionStatus } from '@prisma/client';

// Matches SRS §8.5's exact documented response shape for
// POST /admin/users/:id/grant-premium:
// { user_id, subscription_status, subscription_expiry_date,
//   activation_status, device_id }
export interface GrantPremiumResult {
  userId: number;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiryDate: Date;
  activationStatus: ActivationStatus;
  deviceId: number;
}
