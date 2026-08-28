import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as deviceRepository from '../../../../src/modules/device/device.repository';
import * as deviceService from '../../../../src/modules/device/device.service';
import { ConflictError, NotFoundError } from '../../../../src/shared/errors/app-errors';
import * as usersService from '../../../../src/modules/users/users.service';

vi.mock('../../../../src/modules/device/device.repository');
vi.mock('../../../../src/modules/users/users.service');

const mockDeviceRecord = {
  id: 1,
  userId: 42,
  deviceFingerprint: 'fp_abc123',
  status: 'active' as const,
  activatedAt: new Date('2026-01-01'),
  activatedByAdminId: 1,
  revokedAt: null,
  revokedByAdminId: null,
};

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

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isDeviceValid', () => {
  it('returns true when the submitted fingerprint matches the active DeviceRecord', async () => {
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(mockDeviceRecord);

    const result = await deviceService.isDeviceValid(42, 'fp_abc123');

    expect(result).toBe(true);
  });

  it('returns false on a fingerprint mismatch (FR-3.3a)', async () => {
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(mockDeviceRecord);

    const result = await deviceService.isDeviceValid(42, 'fp_different');

    expect(result).toBe(false);
  });

  it('returns false when there is no active device at all, rather than throwing', async () => {
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(null);

    const result = await deviceService.isDeviceValid(42, 'fp_abc123');

    expect(result).toBe(false);
  });
});

describe('activateFromLastLogin', () => {
  const fakeTx = { marker: 'fake-tx' } as never;

  it('throws NO_DEVICE_ON_FILE when the student has never logged in', async () => {
    vi.mocked(usersService.findById).mockResolvedValue({
      ...mockPublicUser,
      lastDeviceFingerprint: null,
    });

    await expect(deviceService.activateFromLastLogin(42, 1, fakeTx)).rejects.toThrow(ConflictError);
  });

  it('throws DEVICE_ALREADY_ACTIVE rather than letting a raw DB constraint error leak, when an active device already exists', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(mockDeviceRecord);

    await expect(deviceService.activateFromLastLogin(42, 1, fakeTx)).rejects.toThrow(ConflictError);
    expect(deviceRepository.create).not.toHaveBeenCalled();
  });

  it('creates a DeviceRecord using the fingerprint captured at login, and flips activationStatus (FR-4.3)', async () => {
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(null);
    vi.mocked(deviceRepository.create).mockResolvedValue(mockDeviceRecord);
    vi.mocked(usersService.setActivationStatus).mockResolvedValue({
      ...mockPublicUser,
      activationStatus: 'activated',
    });

    const result = await deviceService.activateFromLastLogin(42, 1, fakeTx);

    expect(deviceRepository.create).toHaveBeenCalledWith(42, 'fp_abc123', 1, fakeTx);
    expect(usersService.setActivationStatus).toHaveBeenCalledWith(42, 'activated', fakeTx);
    // Returned so premium.service.grantPremium can include device_id
    // in its response (SRS's exact documented shape).
    expect(result).toEqual({ deviceId: mockDeviceRecord.id });
  });
});

describe('revokeDevice', () => {
  it('throws NotFoundError when there is no active device to revoke', async () => {
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(null);

    await expect(deviceService.revokeDevice(42, 1)).rejects.toThrow(NotFoundError);
  });

  it('revokes the active device and returns its id and revokedAt', async () => {
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(mockDeviceRecord);
    vi.mocked(deviceRepository.revoke).mockResolvedValue({
      ...mockDeviceRecord,
      status: 'revoked',
      revokedAt: new Date('2026-06-01'),
      revokedByAdminId: 1,
    });

    const result = await deviceService.revokeDevice(42, 1);

    expect(result).toEqual({ id: 1, revokedAt: new Date('2026-06-01') });
  });
});

describe('checkHeartbeat', () => {
  it('returns locked: false when subscription active, activated, and device matches', async () => {
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2027-01-01'),
      activationStatus: 'activated',
    });
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(mockDeviceRecord);

    const result = await deviceService.checkHeartbeat(42, 'fp_abc123');

    expect(result.locked).toBe(false);
    expect(result.reasonCode).toBeUndefined();
  });

  it('returns device_mismatch when subscription/activation check out but the fingerprint does not match', async () => {
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2027-01-01'),
      activationStatus: 'activated',
    });
    vi.mocked(deviceRepository.findActiveDeviceRecord).mockResolvedValue(mockDeviceRecord);

    const result = await deviceService.checkHeartbeat(42, 'fp_wrong_device');

    expect(result.locked).toBe(true);
    expect(result.reasonCode).toBe('device_mismatch');
  });

  it('returns locked: true with no reason_code when the subscription is not active — no device check needed', async () => {
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'expired',
      subscriptionExpiryDate: new Date('2026-01-01'),
      activationStatus: 'activated',
    });

    const result = await deviceService.checkHeartbeat(42, 'fp_abc123');

    expect(result.locked).toBe(true);
    expect(result.reasonCode).toBeUndefined();
    expect(deviceRepository.findActiveDeviceRecord).not.toHaveBeenCalled();
  });
});