import { Router } from 'express';
import { requireAdmin } from '../../shared/middleware/require-admin';
import { requireAuth } from '../../shared/middleware/require-auth';
import { asyncHandler } from '../../shared/utils/async-handler';
import * as issuesController from './issues.controller';

export const issuesRouter = Router();

// Student-facing.
issuesRouter.post(
  '/resources/:id/report',
  requireAuth,
  asyncHandler(issuesController.createReport),
);

// Admin-only.
issuesRouter.get(
  '/admin/reports',
  requireAuth,
  requireAdmin,
  asyncHandler(issuesController.listReports),
);
issuesRouter.post(
  '/admin/reports/:id/resolve',
  requireAuth,
  requireAdmin,
  asyncHandler(issuesController.resolveReport),
);
