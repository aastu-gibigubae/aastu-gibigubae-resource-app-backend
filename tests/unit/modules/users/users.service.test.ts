import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as usersRepository from '../../../../src/modules/users/users.repository';
import * as usersService from '../../../../src/modules/users/users.service';

// Mocking the repository, not Prisma directly, is the point of the
// repository pattern per the architecture doc — this test never touches
// a real database.
vi.mock('../../../../src/modules/users/users.repository');

const mockUser = {
  id: 1,
  name: 'Yibeltal Marie',
  email: 'yibeltal@example.com',
  phone: '+251911000000',
  passwordHash: '$2b$12$hashedvaluehere',
  role: 'student' as const,
  subscriptionStatus: 'none' as const,
  subscriptionExpiryDate: null,
  activationStatus: 'pending' as const,
  lastDeviceFingerprint: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('toPublicUser (via findByEmail)', () => {
  it('never leaks passwordHash to a caller', async () => {
    vi.mocked(usersRepository.findByEmail).mockResolvedValue(mockUser);

    const result = await usersService.findByEmail('yibeltal@example.com');

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('passwordHash');
    expect(result?.email).toBe('yibeltal@example.com');
  });

  it('returns null when no user is found, without throwing', async () => {
    vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

    const result = await usersService.findByEmail('nobody@example.com');

    expect(result).toBeNull();
  });
});

describe('findByEmailWithCredentials', () => {
  it('is the one function that deliberately does return passwordHash — auth.service needs it for login', async () => {
    vi.mocked(usersRepository.findByEmail).mockResolvedValue(mockUser);

    const result = await usersService.findByEmailWithCredentials('yibeltal@example.com');

    expect(result).toHaveProperty('passwordHash', '$2b$12$hashedvaluehere');
  });
});

describe('getSubscriptionStatus', () => {
  it('returns subscriptionStatus AND activationStatus together (FR-3.3 needs both)', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue({
      ...mockUser,
      subscriptionStatus: 'active',
      activationStatus: 'activated',
      subscriptionExpiryDate: new Date('2027-01-01'),
    });

    const result = await usersService.getSubscriptionStatus(1);

    expect(result).toEqual({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2027-01-01'),
      activationStatus: 'activated',
    });
  });

  it('returns null for a user that does not exist, rather than throwing', async () => {
    vi.mocked(usersRepository.findById).mockResolvedValue(null);

    const result = await usersService.getSubscriptionStatus(999);

    expect(result).toBeNull();
  });
});

describe('setActivationStatus', () => {
  it('passes the transaction client through to the repository when provided', async () => {
    const fakeTx = { marker: 'fake-tx' } as never;
    vi.mocked(usersRepository.setActivationStatus).mockResolvedValue({
      ...mockUser,
      activationStatus: 'activated',
    });

    await usersService.setActivationStatus(1, 'activated', fakeTx);

    expect(usersRepository.setActivationStatus).toHaveBeenCalledWith(1, 'activated', fakeTx);
  });
});