// Every module throws these — none of them belong to any one module.
// error-handler.ts is the single place that converts an AppError into
// the standard { error: { code, message } } response shape (SRS §8.5).

export interface ErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(code: string, message: string, details?: ErrorDetails) {
    super(400, code, message, details);
    this.name = 'BadRequestError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, code = 'UNAUTHORIZED') {
    super(401, code, message);
    this.name = 'UnauthorizedError';
  }
}

// SRS §8.5 auth/login: 423 ACCOUNT_LOCKED, with retry_after_seconds.
export class AccountLockedError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Please try again later.', {
      retry_after_seconds: retryAfterSeconds,
    });
    this.name = 'AccountLockedError';
  }
}

// SRS §8.5 admin endpoints: 403 ADMIN_ONLY.
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(403, code, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(404, code, message);
    this.name = 'NotFoundError';
  }
}

// SRS §8.5 examples: 409 NO_DEVICE_ON_FILE, 409 REPORT_ALREADY_OPEN.
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
    this.name = 'ConflictError';
  }
}