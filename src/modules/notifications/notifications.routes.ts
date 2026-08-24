import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/require-auth';
import { asyncHandler } from '../../shared/utils/async-handler';
import * as notificationsController from './notifications.controller';

// SRS §8.5 — both endpoints are student-facing (a student's own
// notifications), no admin variant exists for this module.
export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, asyncHandler(notificationsController.getNotifications));
notificationsRouter.post(
  '/notifications/:id/read',
  requireAuth,
  asyncHandler(notificationsController.markRead),
);