import type { RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import { verifyAccessToken } from './auth.tokens.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(new AppError(401, 'Bearer access token is required'));

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.auth = { userId: Number(payload.sub), role: payload.role };
    next();
  } catch (error) { next(error); }
};
