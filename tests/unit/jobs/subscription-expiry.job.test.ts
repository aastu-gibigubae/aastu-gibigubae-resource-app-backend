import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSubscriptionExpiryJob } from '../../../src/jobs/subscription-expiry.job';
import * as notificationsService from '../../../src/modules/notifications/notifications.service';
import * as usersService from '../../../src/modules/users/users.service';

vi.mock('../../../src/modules/users/users.service');
vi.mock('../../../src/modules/notifications/notifications.service');

const mockUser = (id: number) => ({
  id,
  name: `Student ${id}`,
  email: `student${id}@example.com`,
  phone: '+251900000000',
  role: 'student' as const,
  subscriptionStatus: 'active' as const,
  subscriptionExpiryDate: new Date('2026-09-04'),
  activationStatus: 'activated' as const,
  lastDeviceFingerprint: 'fp_abc123',
  createdAt: new Date('2026-01-01'),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(usersService.expireOverdueSubscriptions).mockResolvedValue(0);
  vi.mocked(usersService.findUsersExpiringBetween).mockResolvedValue([]);
  vi.mocked(notificationsService.hasRecentNotificationOfType).mockResolvedValue(false);
});

describe('runSubscriptionExpiryJob', () => {
  it('expires overdue subscriptions silently — no notification created for the expiry itself', async () => {
    vi.mocked(usersService.expireOverdueSubscriptions).mockResolvedValue(3);

    const result = await runSubscriptionExpiryJob();

    expect(result.expiredCount).toBe(3);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('queries the 7-day-out window using addDays, not the raw current date', async () => {
    await runSubscriptionExpiryJob();

    expect(usersService.findUsersExpiringBetween).toHaveBeenCalledTimes(1);
    const [windowStart, windowEnd] = vi.mocked(usersService.findUsersExpiringBetween).mock
      .calls[0]!;
    // windowEnd should be exactly 24h after windowStart — a single-day
    // bucket, not an open-ended "within N days" range.
    expect(windowEnd.getTime() - windowStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('sends a subscription_expiring notification to each user in the expiring window', async () => {
    vi.mocked(usersService.findUsersExpiringBetween).mockResolvedValue([mockUser(1), mockUser(2)]);

    const result = await runSubscriptionExpiryJob();

    expect(notificationsService.create).toHaveBeenCalledWith(1, 'subscription_expiring');
    expect(notificationsService.create).toHaveBeenCalledWith(2, 'subscription_expiring');
    expect(result.notifiedCount).toBe(2);
  });

  it('skips a user who already got the warning in the last 24h (duplicate guard)', async () => {
    vi.mocked(usersService.findUsersExpiringBetween).mockResolvedValue([mockUser(1)]);
    vi.mocked(notificationsService.hasRecentNotificationOfType).mockResolvedValue(true);

    const result = await runSubscriptionExpiryJob();

    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(result.notifiedCount).toBe(0);
  });

  it('checks for a duplicate per-user, not globally — one duplicate does not block the others', async () => {
    vi.mocked(usersService.findUsersExpiringBetween).mockResolvedValue([mockUser(1), mockUser(2)]);
    vi.mocked(notificationsService.hasRecentNotificationOfType).mockImplementation(
      async (userId) => userId === 1,
    );

    const result = await runSubscriptionExpiryJob();

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(notificationsService.create).toHaveBeenCalledWith(2, 'subscription_expiring');
    expect(result.notifiedCount).toBe(1);
  });

  it('the two pieces of work are independent — expiring users and warning-window users never overlap in a single call', async () => {
    vi.mocked(usersService.expireOverdueSubscriptions).mockResolvedValue(5);
    vi.mocked(usersService.findUsersExpiringBetween).mockResolvedValue([mockUser(9)]);

    const result = await runSubscriptionExpiryJob();

    expect(result).toEqual({ expiredCount: 5, notifiedCount: 1 });
  });
});
