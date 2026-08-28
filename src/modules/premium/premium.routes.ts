import { Router } from 'express';
import { requireAdmin } from '../../shared/middleware/require-admin';
import { requireAuth } from '../../shared/middleware/require-auth';
import { asyncHandler } from '../../shared/utils/async-handler';
import * as premiumController from './premium.controller';

// Both endpoints admin-only — SRS Module 4's own module purpose line:
// "let an Admin flip a student to premium after manually confirming
// the payment themselves." No student-facing endpoints in this module
// at all; GET /premium/instructions and PUT /admin/premium-instructions
// are deliberately absent — per FR-4.1, that content moved entirely to
// static content in the Flutter app, and the leftover endpoint-detail
// text describing them in an earlier SRS draft was removed to resolve
// the contradiction with FR-4.1's own decision.
export const premiumRouter = Router();

premiumRouter.get(
  '/admin/users',
  requireAuth,
  requireAdmin,
  asyncHandler(premiumController.lookupUserByEmail),
);

premiumRouter.post(
  '/admin/users/:id/grant-premium',
  requireAuth,
  requireAdmin,
  asyncHandler(premiumController.grantPremium),
);