import type { Request, Response } from 'express';
import { idParamSchema } from '../../shared/validation/common.schemas';
import * as issuesService from './issues.service';
import type { PublicIssueReport } from './issues.types';
import { createReportSchema, listReportsQuerySchema } from './issues.validation';

const reportResponse = (report: PublicIssueReport) => ({
  id: report.id,
  resource_id: report.resourceId,
  reporter_id: report.reporterId,
  reason: report.reason,
  other_text: report.otherText,
  status: report.status,
  created_at: report.createdAt,
});

// SRS §8.5: { "id": 1, "status": "pending" } — deliberately minimal,
// not the full report object (mirrors catalog's own resource create
// response shape).
export const createReport = async (req: Request, res: Response): Promise<void> => {
  const { id: resourceId } = idParamSchema.parse(req.params);
  const { reason, other_text } = createReportSchema.parse(req.body);

  const report = await issuesService.createReport(resourceId, req.user!.id, reason, other_text);

  res.status(201).json({ id: report.id, status: report.status });
};

export const listReports = async (req: Request, res: Response): Promise<void> => {
  const query = listReportsQuerySchema.parse(req.query);

  const result = await issuesService.listReports(query.status, { page: query.page, limit: query.limit });

  res.status(200).json({
    reports: result.reports.map(reportResponse),
    pagination: result.pagination,
  });
};

// SRS §8.5: { "id": 1, "status": "addressed" }
export const resolveReport = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);

  const report = await issuesService.resolveReport(id, req.user!.id);

  res.status(200).json({ id: report.id, status: report.status });
};