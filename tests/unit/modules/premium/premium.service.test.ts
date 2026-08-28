import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../../src/infrastructure/database/prisma-client';
import { writeAuditLog } from '../../../../src/infrastructure/audit/audit-log';
import * as deviceService from '../../../../src/modules/device/device.service';
import * as notificationsService from '../../../../src/modules/notifications/notifications.service';
import * as usersService from '../../../../src/modules/users/users.service';
import * as premiumRepository from '../../../../src/modules/premium/premium.repository';
import * as premiumService from '../../../../src/modules/premium/premium.service';
import { NotFoundError } from '../../../../src/shared/errors/app-errors';

// Auto-mocking (vi.mock with no factory) doesn't work reliably here —
// `prisma` is a live PrismaClient instance, not a plain function/object
// Vitest can cleanly introspect, so $transaction never becomes a real
// vi.fn() that way. An explicit factory sidesteps that: this test file
// only ever calls prisma.$transaction directly (everything else prisma
// touches is behind usersService/premiumRepository/etc, which are
// mocked separately below), so a minimal hand-built object is enough.
vi.mock('../../../../src/infrastructure/database/prisma-client', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));
vi.mock('../../../../src/infrastructure/audit/audit-log');
vi.mock('../../../../src/modules/device/device.service');
vi.mock('../../../../src/modules/notifications/notifications.service');
vi.mock('../../../../src/modules/users/users.service');
vi.mock('../../../../src/modules/premium/premium.repository');

const mockPublicUser = {
  id: 42,
  name: 'Test Student',
  email: 'student@example.com',
  phone: '+251900000000',
  role: 'student' as const,
  subscriptionStatus: 'none' as const,
  subscriptionExpiryDate: null,
  activationStatus: 'pending' as const,
  lastDeviceFingerprint: 'fp_abc123',
  createdAt: new Date('2026-01-01'),
};

const fakeTx = { marker: 'fake-tx' } as never;

beforeEach(() => {
  vi.resetAllMocks();
  // Every test's $transaction just invokes the callback immediately
  // with a fake tx object — the point of this test file is to verify
  // WHAT gets called and in WHAT order inside the transaction, not to
  // exercise Prisma's real transaction machinery (that's covered by
  // actually running this against a real database, same as every
  // other module).
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: never) => {
    return (callback as (tx: unknown) => Promise<unknown>)(fakeTx);
  });
});

describe('findUserByEmail', () => {
  it('throws USER_NOT_FOUND when no user matches the email', async () => {
    vi.mocked(usersService.findByEmail).mockResolvedValue(null);

    await expect(premiumService.findUserByEmail('nobody@example.com')).rejects.toThrow(NotFoundError);
  });

  it('returns the PublicUser as-is when found — no extra transformation needed', async () => {
    vi.mocked(usersService.findByEmail).mockResolvedValue(mockPublicUser);

    const result = await premiumService.findUserByEmail('student@example.com');

    expect(result).toEqual(mockPublicUser);
  });
});

describe('grantPremium', () => {
  it('throws USER_NOT_FOUND when the target user does not exist, before ever opening a transaction', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(null);

    await expect(premiumService.grantPremium(1, 999, undefined)).rejects.toThrow(NotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('runs all five steps inside the transaction, threading the same tx through every call (FR-4.3 atomicity)', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);
    vi.mocked(deviceService.activateFromLastLogin).mockResolvedValue({ deviceId: 7 });

    await premiumService.grantPremium(1, 42, 'Paid via Telebirr, confirmed on Telegram');

    expect(usersService.setSubscriptionActive).toHaveBeenCalledWith(42, expect.any(Date), fakeTx);
    expect(premiumRepository.createBookkeepingRecord).toHaveBeenCalledWith(
      42,
      'Paid via Telebirr, confirmed on Telegram',
      1,
      fakeTx,
    );
    expect(deviceService.activateFromLastLogin).toHaveBeenCalledWith(42, 1, fakeTx);
    expect(notificationsService.create).toHaveBeenCalledWith(42, 'premium_approved', fakeTx);
    expect(writeAuditLog).toHaveBeenCalledWith(1, 'grant_premium', 'User', 42, fakeTx);
  });

  it('computes a 12-month expiry from now (FR-4.3), not some other duration', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);
    vi.mocked(deviceService.activateFromLastLogin).mockResolvedValue({ deviceId: 7 });

    const before = new Date();
    const result = await premiumService.grantPremium(1, 42, undefined);
    const after = new Date();

    const expectedMin = new Date(before);
    expectedMin.setMonth(expectedMin.getMonth() + 12);
    const expectedMax = new Date(after);
    expectedMax.setMonth(expectedMax.getMonth() + 12);

    expect(result.subscriptionExpiryDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(result.subscriptionExpiryDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
  });

  it('returns the exact SRS-documented response shape, including device_id from activateFromLastLogin', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);
    vi.mocked(deviceService.activateFromLastLogin).mockResolvedValue({ deviceId: 15 });

    const result = await premiumService.grantPremium(1, 42, undefined);

    expect(result.userId).toBe(42);
    expect(result.subscriptionStatus).toBe('active');
    expect(result.activationStatus).toBe('activated');
    expect(result.deviceId).toBe(15);
  });

  it('propagates NO_DEVICE_ON_FILE from device.service, rolling back the whole transaction', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);
    vi.mocked(deviceService.activateFromLastLogin).mockRejectedValue(
      new Error('NO_DEVICE_ON_FILE'),
    );

    await expect(premiumService.grantPremium(1, 42, undefined)).rejects.toThrow('NO_DEVICE_ON_FILE');
    // Steps after the failure point should never fire — this confirms
    // the transaction callback actually stops at the throw rather than
    // swallowing it and continuing.
    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('doubles as the device-replace reactivation flow (FR-5.5) — works identically for an already-active subscription', async () => {
    vi.mocked(usersService.findById).mockResolvedValue({
      ...mockPublicUser,
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2026-12-01'),
    });
    vi.mocked(deviceService.activateFromLastLogin).mockResolvedValue({ deviceId: 22 });

    const result = await premiumService.grantPremium(1, 42, undefined);

    // Same five steps run regardless of the user's current subscription
    // state — grantPremium doesn't special-case "already active";
    // device.service's own guards are what actually gate re-activation.
    expect(usersService.setSubscriptionActive).toHaveBeenCalled();
    expect(result.deviceId).toBe(22);
  });
});