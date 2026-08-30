import type { OpenAPIV3 } from 'openapi-types';

const bearer = [{ bearerAuth: [] }];

export const issuesPaths: OpenAPIV3.PathsObject = {
  '/resources/{id}/report': {
    post: {
      tags: ['Issues'],
      summary: 'Report a problem with a resource (student-facing)',
      description:
        'Reporting does NOT hide the resource — it stays visible to everyone while the ' +
        'report is pending. A student can only have one open report per resource at a ' +
        'time.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason'],
              properties: {
                reason: { $ref: '#/components/schemas/IssueReason' },
                other_text: {
                  type: 'string',
                  description: 'Free text, typically used with `other`.',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Report filed.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/IssueReportMinimal' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': {
          description: 'Resource does not exist (`RESOURCE_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '409': {
          description:
            'An open report already exists for this student+resource (`REPORT_ALREADY_OPEN`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/reports': {
    get: {
      tags: ['Issues'],
      summary: 'Browse reports',
      security: bearer,
      parameters: [
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['pending', 'addressed'] },
        },
        { $ref: '#/components/parameters/page' },
        { $ref: '#/components/parameters/limit' },
      ],
      responses: {
        '200': {
          description: 'Matching reports.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reports: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/IssueReportFull' },
                  },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/reports/{id}/resolve': {
    post: {
      tags: ['Issues'],
      summary: 'Mark a report addressed',
      description: 'Notifies the original reporter (`issue_report_addressed`).',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '200': {
          description: 'Report resolved.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/IssueReportMinimal' } },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Report does not exist (`REPORT_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};
