import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors/app-errors';

// Must run after requireAuth, which populates req.user.
//
// Deliberately trusts the role already verified in the JWT claim rather
// than re-querying the database on every request. Architecture doc §7
// anti-patterns is explicit about this: the 15-minute access token
// lifetime is the intended mechanism for keeping role checks reasonably
// fresh — hitting Prisma here "just to be safe" adds a needless DB
// round-trip to every single admin request for no real safety gain.
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'admin') {
    next(new ForbiddenError('Admin access required', 'ADMIN_ONLY'));
    return;
  }
  next();
};