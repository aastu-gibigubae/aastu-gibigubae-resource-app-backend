import type { OpenAPIV3 } from 'openapi-types';

export const healthPaths: OpenAPIV3.PathsObject = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Liveness check',
      description: "Used as Render's `healthCheckPath`.",
      security: [],
      responses: {
        '200': {
          description: 'Service is up.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { status: { type: 'string', example: 'ok' } },
              },
            },
          },
        },
      },
    },
  },
};
