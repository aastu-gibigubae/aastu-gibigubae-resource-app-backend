import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../../infrastructure/security/jwt';
import { UnauthorizedError } from '../errors/app-errors';

const BEARER_PREFIX = 'Bearer ';

// Architecture doc, Flow 1: verifies the JWT and attaches req.user (id,
// role) and req.deviceFingerprint (the claim embedded at login —
// FR-1.5). Every protected route in every module runs this first; it
// only establishes *who's asking*, not what they're allowed to do —
// that's require-admin.ts and each module's own access-policy logic.
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith(BEARER_PREFIX)) {
    next(new UnauthorizedError('Bearer access token is required'));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice(BEARER_PREFIX.length));
    req.user = { id: payload.userId, role: payload.role };
    if (payload.deviceFingerprint !== undefined) {
      req.deviceFingerprint = payload.deviceFingerprint;
    }
    next();
  } catch (error) {
    next(error);
  }
};
