import type { IssueReason, IssueStatus } from '@prisma/client';

// Matches SRS §8.5's exact documented shape for GET /admin/reports:
// { id, resource_id, reporter_id, reason, other_text, status, created_at }
export interface PublicIssueReport {
  id: number;
  resourceId: number;
  reporterId: number;
  reason: IssueReason;
  otherText: string | null;
  status: IssueStatus;
  createdAt: Date;
}

export interface CreateReportInput {
  resourceId: number;
  reporterId: number;
  reason: IssueReason;
  otherText?: string;
}