import type { IssueReason, IssueStatus } from '@prisma/client';
import { writeAuditLog } from '../../infrastructure/audit/audit-log';
import { ConflictError, NotFoundError } from '../../shared/errors/app-errors';
import {
  buildPaginationEnvelope,
  type PaginationEnvelope,
  type PageParams,
} from '../../shared/utils/paginate';
import * as catalogService from '../catalog/catalog.service';
import * as notificationsService from '../notifications/notifications.service';
import * as issuesRepository from './issues.repository';
import type { PublicIssueReport } from './issues.types';

const toPublicIssueReport = (report: {
  id: number;
  resourceId: number;
  reporterId: number;
  reason: IssueReason;
  otherText: string | null;
  status: IssueStatus;
  createdAt: Date;
}): PublicIssueReport => ({
  id: report.id,
  resourceId: report.resourceId,
  reporterId: report.reporterId,
  reason: report.reason,
  otherText: report.otherText,
  status: report.status,
  createdAt: report.createdAt,
});

// FR-6.1/6.3 — a student reporting a resource issue. No auto-hide
// (FR-6.2): the resource stays visible to everyone while the report is
// pending, this function only ever creates a record, never touches
// Resource itself.
export const createReport = async (
  resourceId: number,
  reporterId: number,
  reason: IssueReason,
  otherText: string | undefined,
): Promise<PublicIssueReport> => {
  // Cross-module read via catalog.service, not catalog.repository —
  // per the architecture doc's explicit instruction for this module.
  const exists = await catalogService.resourceExists(resourceId);
  if (!exists) {
    throw new NotFoundError('Resource not found', 'RESOURCE_NOT_FOUND');
  }

  const existingOpenReport = await issuesRepository.findOpenReport(resourceId, reporterId);
  if (existingOpenReport) {
    throw new ConflictError(
      'REPORT_ALREADY_OPEN',
      'You already have an open report for this resource',
    );
  }

  const report = await issuesRepository.create({
    resourceId,
    reporterId,
    reason,
    ...(otherText === undefined ? {} : { otherText }),
  });
  return toPublicIssueReport(report);
};

// GET /admin/reports?status= — status filter optional, matching the
// SRS's own documented "omitted returns reports of every status."
export const listReports = async (
  status: IssueStatus | undefined,
  pagination: PageParams,
): Promise<{ reports: PublicIssueReport[]; pagination: PaginationEnvelope }> => {
  const { reports, total } = await issuesRepository.findMany(status, pagination);
  return {
    reports: reports.map(toPublicIssueReport),
    pagination: buildPaginationEnvelope(pagination, total),
  };
};

// POST /admin/reports/:id/resolve — flips status to addressed, notifies
// the original reporter (architecture doc: issues "Talks to:
// notifications (issue_report_addressed)"), and logs the admin action
// for consistency with every other admin action in the app (catalog
// CRUD, grant-premium) — not explicitly spec'd for this endpoint, my
// own addition for consistency, flagged as such.
export const resolveReport = async (id: number, adminId: number): Promise<PublicIssueReport> => {
  const current = await issuesRepository.findById(id);
  if (!current) {
    throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  }

  const resolved = await issuesRepository.resolve(id);
  await notificationsService.create(resolved.reporterId, 'issue_report_addressed');
  await writeAuditLog(adminId, 'resolve', 'IssueReport', id);

  return toPublicIssueReport(resolved);
};
