import type { ActivationStatus, SubscriptionStatus } from '@prisma/client';

// Its own file per the architecture doc's folder tree, deliberately
// separate from catalog.service.ts — this function only decides, based
// on facts the caller already gathered from device.service and
// users.service (Flow 1). Zero I/O, zero awareness of Prisma, HTTP, or
// any other module. That separation is what makes this trivially unit
// testable without mocking anything.

export interface AccessPolicyInput {
  isFreeSample: boolean;
  deviceValid: boolean;
  subscriptionStatus: SubscriptionStatus;
  activationStatus: ActivationStatus;
}

export interface AccessDecision {
  locked: boolean;
  reasonCode?: 'premium_required' | 'device_mismatch';
  message?: string;
}

// Same exact wording as device.service.ts's checkHeartbeat — both
// modules independently reach the same device_mismatch conclusion via
// different endpoints (this one for browsing/downloading, that one for
// the periodic re-verification check), so the message a student sees
// should read identically either way. Duplicated rather than imported
// across modules (device and catalog have no dependency on each other
// per the architecture doc's module graph) — if this wording ever
// changes, both copies need updating together.
const DEVICE_MISMATCH_MESSAGE =
  'This account is activated on a different device. Contact the admin via Telegram to reactivate.';

// SRS §8.5's four documented cases for GET /courses/:id/resources,
// in the exact priority order the SRS's own examples imply:
//   1. Free sample -> always unlocked, regardless of anything else
//   2. Not premium+activated -> locked, premium_required (no message
//      in the SRS's own example for this case)
//   3. Premium+activated but wrong device -> locked, device_mismatch
//   4. Premium+activated and device matches -> unlocked
export const decideAccess = ({
  isFreeSample,
  deviceValid,
  subscriptionStatus,
  activationStatus,
}: AccessPolicyInput): AccessDecision => {
  if (isFreeSample) return { locked: false };

  if (subscriptionStatus !== 'active' || activationStatus !== 'activated') {
    return { locked: true, reasonCode: 'premium_required' };
  }

  if (!deviceValid) {
    return { locked: true, reasonCode: 'device_mismatch', message: DEVICE_MISMATCH_MESSAGE };
  }

  return { locked: false };
};