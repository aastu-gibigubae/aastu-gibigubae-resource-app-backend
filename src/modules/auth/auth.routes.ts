import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/require-auth';
import { checkLockout } from '../../shared/middleware/rate-limit';
import { asyncHandler } from '../../shared/utils/async-handler';
import * as authController from './auth.controller';

// Full absolute paths, not relative — matches the convention already
// established by device.routes.ts and notifications.routes.ts, so
// every module's router mounts in app.ts the same uniform way
// (app.use(someRouter), no per-module prefix).
export const authRouter = Router();

// checkLockout runs before the controller — rejects immediately if
// either the submitted email or the requesting IP is already locked
// out (FR-1.4), without ever reaching auth.service or the database.
// Only mounted on login, since that's the only endpoint FR-1.4 governs.
authRouter.post('/auth/login', checkLockout, asyncHandler(authController.login));

authRouter.post('/auth/signup', asyncHandler(authController.signup));
authRouter.post('/auth/refresh', asyncHandler(authController.refresh));
authRouter.post('/auth/logout', requireAuth, asyncHandler(authController.logout));