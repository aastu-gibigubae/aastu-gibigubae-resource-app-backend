import { describe, expect, it } from 'vitest';
import { decideAccess } from '../../../../src/modules/catalog/access-policy';

describe('decideAccess', () => {
  it('free sample: always unlocked, even with no subscription and no valid device', () => {
    const result = decideAccess({
      isFreeSample: true,
      deviceValid: false,
      subscriptionStatus: 'none',
      activationStatus: 'pending',
    });

    expect(result).toEqual({ locked: false });
  });

  it('free sample overrides everything — unlocked even for an active+activated+valid-device student too', () => {
    const result = decideAccess({
      isFreeSample: true,
      deviceValid: true,
      subscriptionStatus: 'active',
      activationStatus: 'activated',
    });

    expect(result).toEqual({ locked: false });
  });

  it('non-sample, subscriptionStatus: none -> locked, premium_required', () => {
    const result = decideAccess({
      isFreeSample: false,
      deviceValid: false,
      subscriptionStatus: 'none',
      activationStatus: 'pending',
    });

    expect(result.locked).toBe(true);
    expect(result.reasonCode).toBe('premium_required');
    expect(result.message).toBeUndefined(); // SRS's own example shows no message for this case
  });

  it('non-sample, subscriptionStatus: expired -> locked, premium_required', () => {
    const result = decideAccess({
      isFreeSample: false,
      deviceValid: true,
      subscriptionStatus: 'expired',
      activationStatus: 'activated',
    });

    expect(result.locked).toBe(true);
    expect(result.reasonCode).toBe('premium_required');
  });

  it('non-sample, active subscription but activationStatus still pending -> locked, premium_required (not device_mismatch)', () => {
    const result = decideAccess({
      isFreeSample: false,
      deviceValid: false,
      subscriptionStatus: 'active',
      activationStatus: 'pending',
    });

    // Both conditions are "wrong" here, but premium_required must win —
    // an unactivated device was never a real device_mismatch case, per
    // FR-3.3's exact three-part requirement.
    expect(result.reasonCode).toBe('premium_required');
  });

  it('non-sample, active + activated, device mismatch -> locked, device_mismatch, with the SRS-exact message', () => {
    const result = decideAccess({
      isFreeSample: false,
      deviceValid: false,
      subscriptionStatus: 'active',
      activationStatus: 'activated',
    });

    expect(result.locked).toBe(true);
    expect(result.reasonCode).toBe('device_mismatch');
    expect(result.message).toBe(
      'This account is activated on a different device. Contact the admin via Telegram to reactivate.',
    );
  });

  it('non-sample, active + activated, device matches -> unlocked', () => {
    const result = decideAccess({
      isFreeSample: false,
      deviceValid: true,
      subscriptionStatus: 'active',
      activationStatus: 'activated',
    });

    expect(result).toEqual({ locked: false });
  });
});
