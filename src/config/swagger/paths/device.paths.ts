import type { OpenAPIV3 } from 'openapi-types';

const bearer = [{ bearerAuth: [] }];

export const devicePaths: OpenAPIV3.PathsObject = {
  '/verify/heartbeat': {
    post: {
      tags: ['Device'],
      summary: 'Periodic re-verification (student-facing)',
      description:
        'Called on a schedule by the client to re-confirm a premium student is still on ' +
        'their bound device — independent of the same check made inline at browse time.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['device_fingerprint'],
              properties: { device_fingerprint: { type: 'string', minLength: 1 } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Current subscription/lock state for this device.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/HeartbeatResult' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/users/{id}/revoke-device': {
    post: {
      tags: ['Device'],
      summary: "Un-bind a student's device",
      description:
        'Does not change `activation_status` or `subscription_status` — the student ' +
        "hasn't lost what they paid for, just the device it was tied to. Access still " +
        'locks immediately, since the next heartbeat/browse call finds no active device.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '200': {
          description: 'Device revoked.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RevokeDeviceResult' } },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Student has no active device to revoke (`NO_ACTIVE_DEVICE`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};
