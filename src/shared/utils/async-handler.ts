import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Every controller in every module is async (it awaits a service call).
// Express doesn't forward rejected promises to error-handling middleware
// on its own — without this wrapper, a thrown error in an async
// controller would crash the process instead of producing a clean
// { error: { code, message } } response.
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };