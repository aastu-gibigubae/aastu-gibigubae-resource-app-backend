import type { IssueReason, IssueReport, IssueStatus, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';
import { toSkipTake, type PageParams } from '../../shared/utils/paginate';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// For the FR-6.3 pre-check ("one open report per student per resource")
// — pre-checking before insert rather than only relying on the DB's
// partial unique index catching it, same pattern established by
// auth.service (findByEmail/findByPhone before create) and catalog
// (findStreamByName before create). The partial unique index
// (one_open_report_per_student_per_resource, WHERE status = 'pending')
// still exists as the real guarantee under concurrent requests — this
// pre-check just turns the common case into a clean 409 instead of a
// raw Postgres constraint violation.
export const findOpenReport = (
  resourceId: number,
  reporterId: number,
  tx: PrismaOrTx = prisma,
): Promise<IssueReport | null> =>
  tx.issueReport.findFirst({ where: { resourceId, reporterId, status: 'pending' } });

export const findById = (id: number, tx: PrismaOrTx = prisma): Promise<IssueReport | null> =>
  tx.issueReport.findUnique({ where: { id } });

export const create = (
  data: { resourceId: number; reporterId: number; reason: IssueReason; otherText?: string },
  tx: PrismaOrTx = prisma,
): Promise<IssueReport> =>
  tx.issueReport.create({
    data: {
      resourceId: data.resourceId,
      reporterId: data.reporterId,
      reason: data.reason,
      // otherText is `string | null` in Prisma's generated input type
      // (a nullable schema field), not `string | undefined` —
      // exactOptionalPropertyTypes rejects an explicit undefined there.
      // Same pattern as premium.repository.ts's note field: omit the
      // key entirely when there's nothing to set.
      ...(data.otherText === undefined ? {} : { otherText: data.otherText }),
    },
  });

export const findMany = async (
  status: IssueStatus | undefined,
  pagination: PageParams,
  tx: PrismaOrTx = prisma,
): Promise<{ reports: IssueReport[]; total: number }> => {
  const where: Prisma.IssueReportWhereInput = status === undefined ? {} : { status };
  const [reports, total] = await Promise.all([
    tx.issueReport.findMany({ where, ...toSkipTake(pagination), orderBy: { createdAt: 'desc' } }),
    tx.issueReport.count({ where }),
  ]);
  return { reports, total };
};

export const resolve = (id: number, tx: PrismaOrTx = prisma): Promise<IssueReport> =>
  tx.issueReport.update({ where: { id }, data: { status: 'addressed' } });