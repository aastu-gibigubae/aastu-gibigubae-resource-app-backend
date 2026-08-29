import { z } from 'zod';
import { paginationSchema } from '../../shared/validation/common.schemas';

// Matches schema.prisma's IssueReason enum exactly — hardcoded here
// since Prisma's generated enum is a TS type, not a runtime value
// array zod can derive an enum from directly (same reasoning as
// catalog.validation.ts's resourceCategoryEnum).
const issueReasonEnum = z.enum([
  'broken_file',
  'wrong_file',
  'incorrect_category',
  'poor_quality',
  'other',
]);

export const createReportSchema = z.object({
  reason: issueReasonEnum,
  other_text: z.string().optional(),
});

const issueStatusEnum = z.enum(['pending', 'addressed']);

// GET /admin/reports?status=&page=&limit= — status optional.
export const listReportsQuerySchema = z
  .object({
    status: issueStatusEnum.optional(),
  })
  .and(paginationSchema);
