import type { OpenAPIV3 } from 'openapi-types';

const bearer = [{ bearerAuth: [] }];

export const notificationsPaths: OpenAPIV3.PathsObject = {
  '/notifications': {
    get: {
      tags: ['Notifications'],
      summary: "List the current user's notifications",
      security: bearer,
      responses: {
        '200': {
          description: 'All notifications for the caller, newest first.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  notifications: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Notification' },
                  },
                },
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/notifications/{id}/read': {
    post: {
      tags: ['Notifications'],
      summary: 'Mark a notification as read',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '204': { description: 'Marked read. No body.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { $ref: '#/components/responses/NotFound' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};
