import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../../src/shared/errors/app-errors';
import * as notificationsRepository from '../../../../src/modules/notifications/notifications.repository';
import * as notificationsService from '../../../../src/modules/notifications/notifications.service';

vi.mock('../../../../src/modules/notifications/notifications.repository');

const mockNotification = {
  id: 1,
  userId: 42,
  type: 'premium_approved' as const,
  message: 'Your premium access has been approved!',
  relatedResourceId: null,
  readStatus: false,
  createdAt: new Date('2026-01-01'),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('create', () => {
  it('uses the exact SRS-specified wording for premium_approved', async () => {
    vi.mocked(notificationsRepository.create).mockResolvedValue(mockNotification);

    await notificationsService.create(42, 'premium_approved');

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      42,
      'premium_approved',
      'Your premium access has been approved!',
      undefined,
      expect.anything(), // tx, defaulted to the shared prisma client
    );
  });

  it('passes relatedResourceId through when provided', async () => {
    vi.mocked(notificationsRepository.create).mockResolvedValue(mockNotification);

    await notificationsService.create(42, 'issue_report_addressed', undefined, 7);

    expect(notificationsRepository.create).toHaveBeenCalledWith(
      42,
      'issue_report_addressed',
      expect.any(String),
      7,
      expect.anything(),
    );
  });
});

describe('list', () => {
  it('maps repository rows to the public shape, in the order the repository returns them', async () => {
    vi.mocked(notificationsRepository.findByUser).mockResolvedValue([mockNotification]);

    const result = await notificationsService.list(42);

    expect(result).toEqual([
      {
        id: 1,
        type: 'premium_approved',
        message: 'Your premium access has been approved!',
        readStatus: false,
        createdAt: mockNotification.createdAt,
      },
    ]);
  });
});

describe('markRead', () => {
  it('resolves silently when the repository reports one row updated', async () => {
    vi.mocked(notificationsRepository.markRead).mockResolvedValue(1);

    await expect(notificationsService.markRead(1, 42)).resolves.toBeUndefined();
  });

  it('throws NotFoundError when the repository updates zero rows — covers both "does not exist" and "belongs to someone else" without distinguishing which', async () => {
    vi.mocked(notificationsRepository.markRead).mockResolvedValue(0);

    await expect(notificationsService.markRead(999, 42)).rejects.toThrow(NotFoundError);
  });

  it('always passes both the notification id and the requesting user id to the repository, so ownership is enforced at the query level', async () => {
    vi.mocked(notificationsRepository.markRead).mockResolvedValue(1);

    await notificationsService.markRead(5, 42);

    expect(notificationsRepository.markRead).toHaveBeenCalledWith(5, 42);
  });
});