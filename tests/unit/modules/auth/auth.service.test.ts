import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authRepository from '../../../../src/modules/auth/auth.repository';
import * as authService from '../../../../src/modules/auth/auth.service';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../../../src/infrastructure/security/jwt';
import { hashPassword, verifyPassword } from '../../../../src/infrastructure/security/password';
import { recordFailedAttempt, resetAttempts } from '../../../../src/shared/middleware/rate-limit';
import * as usersService from '../../../../src/modules/users/users.service';
import { BadRequestError, UnauthorizedError } from '../../../../src/shared/errors/app-errors';

vi.mock('../../../../src/modules/auth/auth.repository');
vi.mock('../../../../src/modules/users/users.service');
vi.mock('../../../../src/infrastructure/security/jwt');
vi.mock('../../../../src/infrastructure/security/password');
vi.mock('../../../../src/shared/middleware/rate-limit');

const mockPublicUser = {
  id: 1,
  name: 'Test Student',
  email: 'student@example.com',
  phone: '+251900000000',
  role: 'student' as const,
  subscriptionStatus: 'none' as const,
  subscriptionExpiryDate: null,
  activationStatus: 'pending' as const,
  lastDeviceFingerprint: null,
  createdAt: new Date('2026-01-01'),
};

const mockUserWithCredentials = {
  ...mockPublicUser,
  passwordHash: '$2b$12$hashedvalue',
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(signAccessToken).mockReturnValue('fake-access-token');
  vi.mocked(signRefreshToken).mockReturnValue('fake-refresh-token');
  vi.mocked(hashRefreshToken).mockReturnValue('fake-refresh-token-hash');
});

describe('signup', () => {
  const input = {
    name: 'Test Student',
    email: 'student@example.com',
    phone: '+251900000000',
    password: 'password123',
  };

  it('throws EMAIL_ALREADY_EXISTS when the email is already taken', async () => {
    vi.mocked(usersService.findByEmail).mockResolvedValue(mockPublicUser);

    await expect(authService.signup(input)).rejects.toThrow(BadRequestError);
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  it('throws PHONE_ALREADY_EXISTS when the phone is already taken (email is free)', async () => {
    vi.mocked(usersService.findByEmail).mockResolvedValue(null);
    vi.mocked(usersService.findByPhone).mockResolvedValue(mockPublicUser);

    await expect(authService.signup(input)).rejects.toThrow(BadRequestError);
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  it('creates the user and issues tokens with no device fingerprint claim (signup has none, FR-1.5 is login-only)', async () => {
    vi.mocked(usersService.findByEmail).mockResolvedValue(null);
    vi.mocked(usersService.findByPhone).mockResolvedValue(null);
    vi.mocked(hashPassword).mockResolvedValue('$2b$12$newhash');
    vi.mocked(usersService.createUser).mockResolvedValue(mockPublicUser);

    const result = await authService.signup(input);

    expect(usersService.createUser).toHaveBeenCalledWith({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: '$2b$12$newhash',
    });
    expect(signAccessToken).toHaveBeenCalledWith({
      userId: 1,
      role: 'student',
      deviceFingerprint: undefined,
    });
    expect(result.user).toEqual(mockPublicUser);
    expect(result.accessToken).toBe('fake-access-token');
  });
});

describe('login', () => {
  const input = {
    email: 'student@example.com',
    password: 'password123',
    deviceFingerprint: 'fp_abc123',
  };

  it('records a failed attempt and throws INVALID_CREDENTIALS when the email does not exist', async () => {
    vi.mocked(usersService.findByEmailWithCredentials).mockResolvedValue(null);

    await expect(authService.login(input, '1.2.3.4')).rejects.toThrow(UnauthorizedError);
    expect(recordFailedAttempt).toHaveBeenCalledWith(input.email, '1.2.3.4');
  });

  it('records a failed attempt and throws INVALID_CREDENTIALS when the password is wrong', async () => {
    vi.mocked(usersService.findByEmailWithCredentials).mockResolvedValue(mockUserWithCredentials);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(authService.login(input, '1.2.3.4')).rejects.toThrow(UnauthorizedError);
    expect(recordFailedAttempt).toHaveBeenCalledWith(input.email, '1.2.3.4');
  });

  it('on success: resets attempts, captures the fingerprint (FR-1.5), and issues tokens carrying it', async () => {
    vi.mocked(usersService.findByEmailWithCredentials).mockResolvedValue(mockUserWithCredentials);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(usersService.findById).mockResolvedValue(mockPublicUser);

    await authService.login(input, '1.2.3.4');

    expect(resetAttempts).toHaveBeenCalledWith(input.email, '1.2.3.4');
    expect(usersService.updateLastDeviceFingerprint).toHaveBeenCalledWith(1, 'fp_abc123');
    expect(signAccessToken).toHaveBeenCalledWith({
      userId: 1,
      role: 'student',
      deviceFingerprint: 'fp_abc123',
    });
  });
});

describe('refresh', () => {
  const validPayload = {
    userId: 1,
    role: 'student' as const,
    jti: 'jti_1',
    deviceFingerprint: 'fp_abc123',
  };

  it('throws REFRESH_TOKEN_INVALID when the token fails signature verification', async () => {
    vi.mocked(verifyRefreshToken).mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(authService.refresh('garbage')).rejects.toThrow(UnauthorizedError);
  });

  it('throws REFRESH_TOKEN_INVALID when no matching stored token exists', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValue(validPayload);
    vi.mocked(authRepository.findByTokenHash).mockResolvedValue(null);

    await expect(authService.refresh('token')).rejects.toThrow(UnauthorizedError);
  });

  it('throws REFRESH_TOKEN_INVALID when the stored token was already revoked (reuse detection)', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValue(validPayload);
    vi.mocked(authRepository.findByTokenHash).mockResolvedValue({
      id: 1,
      userId: 1,
      tokenHash: 'hash',
      deviceFingerprint: 'fp_abc123',
      expiresAt: new Date('2027-01-01'),
      revokedAt: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
    });

    await expect(authService.refresh('token')).rejects.toThrow(UnauthorizedError);
    // Per the SRS's literal wording, reuse only forces re-login on the
    // client — it does not cascade into revoking other sessions.
    expect(authRepository.revoke).not.toHaveBeenCalled();
  });

  it('throws REFRESH_TOKEN_INVALID when the stored token has expired', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValue(validPayload);
    vi.mocked(authRepository.findByTokenHash).mockResolvedValue({
      id: 1,
      userId: 1,
      tokenHash: 'hash',
      deviceFingerprint: 'fp_abc123',
      expiresAt: new Date('2020-01-01'),
      revokedAt: null,
      createdAt: new Date('2019-01-01'),
    });

    await expect(authService.refresh('token')).rejects.toThrow(UnauthorizedError);
  });

  it('on success: revokes the old token and carries the same device fingerprint forward into the new pair', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValue(validPayload);
    vi.mocked(authRepository.findByTokenHash).mockResolvedValue({
      id: 1,
      userId: 1,
      tokenHash: 'hash',
      deviceFingerprint: 'fp_abc123',
      expiresAt: new Date('2027-01-01'),
      revokedAt: null,
      createdAt: new Date('2026-01-01'),
    });

    await authService.refresh('token');

    expect(authRepository.revoke).toHaveBeenCalledWith(1);
    expect(signAccessToken).toHaveBeenCalledWith({
      userId: 1,
      role: 'student',
      deviceFingerprint: 'fp_abc123',
    });
  });
});

describe('logout', () => {
  it('no-ops when the access token carried no device fingerprint claim', async () => {
    await authService.logout(1, undefined);

    expect(authRepository.findActiveByUserAndFingerprint).not.toHaveBeenCalled();
  });

  it('no-ops (does not throw) when there is no matching active session — idempotent', async () => {
    vi.mocked(authRepository.findActiveByUserAndFingerprint).mockResolvedValue(null);

    await expect(authService.logout(1, 'fp_abc123')).resolves.toBeUndefined();
    expect(authRepository.revoke).not.toHaveBeenCalled();
  });

  it('revokes the matching session (FR-1.7: this session only, nothing else touched)', async () => {
    vi.mocked(authRepository.findActiveByUserAndFingerprint).mockResolvedValue({
      id: 5,
      userId: 1,
      tokenHash: 'hash',
      deviceFingerprint: 'fp_abc123',
      expiresAt: new Date('2027-01-01'),
      revokedAt: null,
      createdAt: new Date('2026-01-01'),
    });

    await authService.logout(1, 'fp_abc123');

    expect(authRepository.revoke).toHaveBeenCalledWith(5);
  });
});
