import type { OpenAPIV3 } from 'openapi-types';

const bearer = [{ bearerAuth: [] }];

export const premiumPaths: OpenAPIV3.PathsObject = {
  '/admin/users': {
    get: {
      tags: ['Premium'],
      summary: 'Look up a student by email',
      description: 'Admin-only. Used to find the student before granting premium.',
      security: bearer,
      parameters: [
        { name: 'email', in: 'query', required: true, schema: { type: 'string', format: 'email' } },
      ],
      responses: {
        '200': {
          description: 'Matching student.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PremiumUserLookup' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'No student with that email (`USER_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/users/{id}/grant-premium': {
    post: {
      tags: ['Premium'],
      summary: 'Grant premium after manually confirming payment',
      description:
        'Admin-only by design — there is no student-facing payment endpoint in this app. ' +
        'Intended flow: a student pays via Telegram, an admin manually verifies it, then ' +
        'calls this endpoint. Runs inside a single database transaction — subscription, ' +
        'device binding, notification, and audit log all commit together or not at all.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                note: {
                  type: 'string',
                  description: "Optional free-text note for the admin's own records.",
                  example: '50 birr via Telebirr, confirmed via @student_handle on Telegram',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Premium granted.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/GrantPremiumResult' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'No such user (`USER_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '409': {
          description:
            'Student has never logged in, so there is no device fingerprint to bind ' +
            '(`NO_DEVICE_ON_FILE`); or the student already has a bound device — revoke it ' +
            'first via `/admin/users/{id}/revoke-device` (`DEVICE_ALREADY_ACTIVE`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};
