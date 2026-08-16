import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: 'Invalid request data', details: error.flatten() });
    return;
  }

  if (error instanceof AppError) {
    res
      .status(error.statusCode)
      .json({
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ message: 'An account with that email or phone number already exists' });
    return;
  }

  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
};
