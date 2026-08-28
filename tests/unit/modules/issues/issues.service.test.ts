import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as catalogService from '../../../../src/modules/catalog/catalog.service';
import * as notificationsService from '../../../../src/modules/notifications/notifications.service';
import * as issuesRepository from '../../../../src/modules/issues/issues.repository';
import * as issuesService from '../../../../src/modules/issues/issues.service';
import { writeAuditLog } from '../../../../src/infrastructure/audit/audit-log';
import { ConflictError, NotFoundError } from '../../../../src/shared/errors/app-errors';

vi.mock('../../../../src/modules/issues/issues.repository');
vi.mock('../../../../src/modules/catalog/catalog.service');
vi.mock('../../../../src/modules/notifications/notifications.service');
vi.mock('../../../../src/infrastructure/audit/audit-log');

const mockReport = {
  id: 1,
  resourceId: 42,
  reporterId: 7,
  reason: 'broken_file' as const,
  otherText: null,
  status: 'pending' as const,
  createdAt: new Date('2026-01-01'),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createReport', () => {
  it('throws RESOURCE_NOT_FOUND when the resource does not exist — checked via catalog.service, not the repository', async () => {
    vi.mocked(catalogService.resourceExists).mockResolvedValue(false);

    await expect(
      issuesService.createReport(999, 7, 'broken_file', undefined),
    ).rejects.toThrow(NotFoundError);
    expect(issuesRepository.findOpenReport).not.toHaveBeenCalled();
  });

  it('throws REPORT_ALREADY_OPEN when the same student already has a pending report on the same resource (FR-6.3)', async () => {
    vi.mocked(catalogService.resourceExists).mockResolvedValue(true);
    vi.mocked(issuesRepository.findOpenReport).mockResolvedValue(mockReport);

    await expect(
      issuesService.createReport(42, 7, 'broken_file', undefined),
    ).rejects.toThrow(ConflictError);
    expect(issuesRepository.create).not.toHaveBeenCalled();
  });

  it('creates the report with status pending, passing otherText through when provided', async () => {
    vi.mocked(catalogService.resourceExists).mockResolvedValue(true);
    vi.mocked(issuesRepository.findOpenReport).mockResolvedValue(null);
    vi.mocked(issuesRepository.create).mockResolvedValue(mockReport);

    const result = await issuesService.createReport(42, 7, 'other', "PDF won't open");

    expect(issuesRepository.create).toHaveBeenCalledWith({
      resourceId: 42,
      reporterId: 7,
      reason: 'other',
      otherText: "PDF won't open",
    });
    expect(result.status).toBe('pending');
  });

  it('does not fire a notification on creation — only resolve does (FR-6.2: no auto-hide, quiet until an admin acts)', async () => {
    vi.mocked(catalogService.resourceExists).mockResolvedValue(true);
    vi.mocked(issuesRepository.findOpenReport).mockResolvedValue(null);
    vi.mocked(issuesRepository.create).mockResolvedValue(mockReport);

    await issuesService.createReport(42, 7, 'broken_file', undefined);

    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});

describe('listReports', () => {
  it('passes status through to the repository, undefined meaning every status', async () => {
    vi.mocked(issuesRepository.findMany).mockResolvedValue({ reports: [mockReport], total: 1 });

    await issuesService.listReports(undefined, { page: 1, limit: 20 });

    expect(issuesRepository.findMany).toHaveBeenCalledWith(undefined, { page: 1, limit: 20 });
  });

  it('filters by status when provided, and builds the pagination envelope', async () => {
    vi.mocked(issuesRepository.findMany).mockResolvedValue({ reports: [mockReport], total: 25 });

    const result = await issuesService.listReports('pending', { page: 1, limit: 20 });

    expect(issuesRepository.findMany).toHaveBeenCalledWith('pending', { page: 1, limit: 20 });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 25, total_pages: 2 });
  });
});

describe('resolveReport', () => {
  it('throws REPORT_NOT_FOUND when the report does not exist', async () => {
    vi.mocked(issuesRepository.findById).mockResolvedValue(null);

    await expect(issuesService.resolveReport(999, 1)).rejects.toThrow(NotFoundError);
    expect(issuesRepository.resolve).not.toHaveBeenCalled();
  });

  it('flips status to addressed, notifies the original reporter, and logs the admin action', async () => {
    vi.mocked(issuesRepository.findById).mockResolvedValue(mockReport);
    vi.mocked(issuesRepository.resolve).mockResolvedValue({ ...mockReport, status: 'addressed' });

    const result = await issuesService.resolveReport(1, 99);

    expect(issuesRepository.resolve).toHaveBeenCalledWith(1);
    // Notifies the REPORTER (mockReport.reporterId, 7), not the admin
    // who resolved it.
    expect(notificationsService.create).toHaveBeenCalledWith(7, 'issue_report_addressed');
    expect(writeAuditLog).toHaveBeenCalledWith(99, 'resolve', 'IssueReport', 1);
    expect(result.status).toBe('addressed');
  });
});