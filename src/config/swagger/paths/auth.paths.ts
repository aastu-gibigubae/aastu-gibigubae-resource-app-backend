import type { OpenAPIV3 } from 'openapi-types';

export const authPaths: OpenAPIV3.PathsObject = {
  '/auth/signup': {
    post: {
      tags: ['Auth'],
      summary: 'Create a student account',
      description:
        'Role is never accepted as input — every account created here is `student`. ' +
        'Returns a token pair immediately, same as login.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'phone', 'password'],
              properties: {
                name: { type: 'string', minLength: 1, example: 'Abebe Kebede' },
                email: { type: 'string', format: 'email', example: 'abebe.kebede@aastu.edu.et' },
                phone: { type: 'string', minLength: 1, example: '+251911223344' },
                password: {
                  type: 'string',
                  minLength: 8,
                  description: 'Minimum 8 characters.',
                  example: 'correcthorsebattery',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Account created.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } },
          },
        },
        '400': {
          description:
            'Validation failure, or the email/phone is already registered ' +
            '(`EMAIL_ALREADY_EXISTS` / `PHONE_ALREADY_EXISTS`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Log in',
      description:
        "Also updates the account's `last_device_fingerprint`. Rate-limited: locked out " +
        'for 15 minutes after 5 failed attempts, tracked independently per-email and ' +
        'per-IP (in-memory; resets on server restart, does not coordinate across ' +
        'multiple instances). A locked attempt returns `423` before ever touching the ' +
        'database.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password', 'device_fingerprint'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string' },
                device_fingerprint: {
                  type: 'string',
                  minLength: 1,
                  description: 'Opaque client-generated identifier for the calling device.',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Same response shape as signup.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': {
          description: 'Wrong email or password (`INVALID_CREDENTIALS`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '423': {
          description: 'Too many recent failed attempts (`ACCOUNT_LOCKED`).',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                error: {
                  code: 'ACCOUNT_LOCKED',
                  message: 'Too many failed attempts. Please try again later.',
                  retry_after_seconds: 900,
                },
              },
            },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Rotate a refresh token',
      description:
        'The old refresh token is invalidated the moment it is used. Any failure — bad ' +
        'signature, unknown, already used, or expired — collapses to the same ' +
        '`401 REFRESH_TOKEN_INVALID`, since the only correct client response to any of ' +
        'these is to force a full re-login.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refresh_token'],
              properties: { refresh_token: { type: 'string', minLength: 1 } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'New token pair.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': {
          description: 'Bad, unknown, reused, or expired refresh token (`REFRESH_TOKEN_INVALID`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Revoke the current session',
      description:
        "Revokes the refresh token belonging to the caller's current device/session. " +
        'No-ops if there is nothing to revoke — safe to call twice.',
      security: [{ bearerAuth: [] }],
      responses: {
        '204': { description: 'Logged out. No body.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};
