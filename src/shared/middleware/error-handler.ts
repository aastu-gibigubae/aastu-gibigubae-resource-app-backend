import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-errors';

// The single place every error in the app — thrown in a service, or
// forwarded via asyncHandler/next(error) — gets converted into the
// standard error shape from SRS §8.5:
//   { "error": { "code": "...", "message": "..." } }
// Must be mounted last, after every route and every other middleware.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ?? {}),
      },
    });
    return;
  }

  // A zod .parse() failure that a route/controller didn't already catch
  // and translate itself — treat as a generic validation error rather
  // than leaking zod's internal error shape to the client.
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.issues[0]?.message ?? 'Invalid request',
      },
    });
    return;
  }

  // Anything else is unexpected — log it for debugging, but never leak
  // internal error details (stack traces, DB errors) to the client.
  console.error(err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    },
  });
};