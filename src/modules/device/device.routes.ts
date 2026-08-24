import { Router } from 'express';
import { requireAdmin } from '../../shared/middleware/require-admin';
import { requireAuth } from '../../shared/middleware/require-auth';
import { asyncHandler } from '../../shared/utils/async-handler';
import * as deviceController from './device.controller';

export const deviceRouter = Router();

// Admin-only — SRS §8.4/8.5.
deviceRouter.post(
  '/admin/users/:id/revoke-device',
  requireAuth,
  requireAdmin,
  asyncHandler(deviceController.revokeDevice),
);

// Student-facing — no requireAdmin.
deviceRouter.post('/verify/heartbeat', requireAuth, asyncHandler(deviceController.heartbeat));