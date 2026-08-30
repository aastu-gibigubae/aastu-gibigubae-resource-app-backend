import type { OpenAPIV3 } from 'openapi-types';

const bearer = [{ bearerAuth: [] }];

export const catalogPaths: OpenAPIV3.PathsObject = {
  // ---- Student browse ----
  '/streams': {
    get: {
      tags: ['Catalog — Browse'],
      summary: 'List every stream',
      security: bearer,
      responses: {
        '200': {
          description: 'All streams.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  streams: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { id: { type: 'integer' }, name: { type: 'string' } },
                    },
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
  '/departments': {
    get: {
      tags: ['Catalog — Browse'],
      summary: 'List departments in a stream',
      security: bearer,
      parameters: [
        {
          name: 'stream_id',
          in: 'query',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      responses: {
        '200': {
          description: 'Departments belonging to the given stream.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  departments: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        stream_id: { type: 'integer' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/courses': {
    get: {
      tags: ['Catalog — Browse'],
      summary: 'Paginated course list',
      description: 'Every filter is optional.',
      security: bearer,
      parameters: [
        { name: 'stream_id', in: 'query', schema: { type: 'integer', minimum: 1 } },
        { name: 'department_id', in: 'query', schema: { type: 'integer', minimum: 1 } },
        { name: 'year', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5 } },
        { $ref: '#/components/parameters/page' },
        { $ref: '#/components/parameters/limit' },
      ],
      responses: {
        '200': {
          description: 'Matching courses.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  courses: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Course' },
                  },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/courses/{id}/resources': {
    get: {
      tags: ['Catalog — Browse'],
      summary: 'Browse a course’s resources (access-checked)',
      description:
        'The single most important endpoint in the app — browse and download-eligibility ' +
        'combined into one response via `locked`/`file_url`, so the client never needs a ' +
        'separate "am I allowed to see this" call. `category` is required (browsing is ' +
        'category-by-category, matching a tabbed UI).',
      security: bearer,
      parameters: [
        { $ref: '#/components/parameters/idParam' },
        {
          name: 'category',
          in: 'query',
          required: true,
          schema: { $ref: '#/components/schemas/ResourceCategory' },
        },
        { $ref: '#/components/parameters/page' },
        { $ref: '#/components/parameters/limit' },
      ],
      responses: {
        '200': {
          description: 'Resources for this course/category, each with an inline access decision.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resources: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/StudentResourceView' },
                  },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': {
          description: 'Course does not exist (`COURSE_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/search': {
    get: {
      tags: ['Catalog — Browse'],
      summary: 'Mixed course/resource search',
      security: bearer,
      parameters: [
        { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1 } },
      ],
      responses: {
        '200': {
          description: 'Mixed list of course and resource hits.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  results: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SearchResult' },
                  },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ---- Admin: streams ----
  '/admin/streams': {
    post: {
      tags: ['Catalog — Admin'],
      summary: 'Create a stream',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string', minLength: 1 } },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Stream created.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Stream' } } },
        },
        '400': {
          description: 'Validation failure, or duplicate name (`STREAM_ALREADY_EXISTS`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/streams/{id}': {
    put: {
      tags: ['Catalog — Admin'],
      summary: 'Rename a stream',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string', minLength: 1 } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated stream.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { id: { type: 'integer' }, name: { type: 'string' } },
              },
            },
          },
        },
        '400': {
          description: 'Validation failure, or duplicate name (`STREAM_ALREADY_EXISTS`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Stream does not exist (`STREAM_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Catalog — Admin'],
      summary: 'Delete a stream',
      description: 'Cascades to its departments, courses, and resources.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '204': { description: 'Deleted. No body.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Stream does not exist (`STREAM_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ---- Admin: departments ----
  '/admin/departments': {
    post: {
      tags: ['Catalog — Admin'],
      summary: 'Create a department',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'stream_id'],
              properties: {
                name: { type: 'string', minLength: 1 },
                stream_id: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Department created.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Department' } },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Parent stream does not exist (`STREAM_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/departments/{id}': {
    put: {
      tags: ['Catalog — Admin'],
      summary: 'Update a department',
      description: 'At least one of `name`/`stream_id` is required.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 1 },
                stream_id: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated department.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  stream_id: { type: 'integer' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Department, or the new parent stream, does not exist.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Catalog — Admin'],
      summary: 'Delete a department',
      description: 'Cascades to its courses and resources.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '204': { description: 'Deleted. No body.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Department does not exist (`DEPARTMENT_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ---- Admin: courses ----
  '/admin/courses': {
    post: {
      tags: ['Catalog — Admin'],
      summary: 'Create a course',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'department_id', 'academic_year'],
              properties: {
                name: { type: 'string', minLength: 1 },
                department_id: { type: 'integer', minimum: 1 },
                academic_year: { type: 'integer', minimum: 1, maximum: 5 },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Course created.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Course' } } },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Parent department does not exist (`DEPARTMENT_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/courses/{id}': {
    put: {
      tags: ['Catalog — Admin'],
      summary: 'Update a course',
      description: 'Any subset of the create fields; at least one is required.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 1 },
                department_id: { type: 'integer', minimum: 1 },
                academic_year: { type: 'integer', minimum: 1, maximum: 5 },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated course.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  department_id: { type: 'integer' },
                  academic_year: { type: 'integer' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Course, or the new parent department, does not exist.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Catalog — Admin'],
      summary: 'Delete a course',
      description: 'Cascades to its resources.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '204': { description: 'Deleted. No body.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Course does not exist (`COURSE_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ---- Admin: resources ----
  '/admin/resources': {
    post: {
      tags: ['Catalog — Admin'],
      summary: 'Upload a resource',
      description:
        'The file goes through `multer` (2MB cap, in-memory buffer) then a magic-byte ' +
        'signature check — the client-declared `Content-Type` is ignored; only PDF is ' +
        'accepted.',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'title', 'course_id', 'category', 'is_free_sample'],
              properties: {
                file: { type: 'string', format: 'binary', description: 'PDF, max 2MB.' },
                title: { type: 'string', minLength: 1 },
                course_id: { type: 'integer', minimum: 1 },
                category: { $ref: '#/components/schemas/ResourceCategory' },
                description: { type: 'string' },
                is_free_sample: {
                  type: 'string',
                  enum: ['true', 'false'],
                  description: 'multipart has no real boolean — send the literal string.',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Resource created.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResourceCreateUpdateResult' },
            },
          },
        },
        '400': {
          description:
            'Validation failure, missing file (`FILE_REQUIRED`), or a non-PDF signature ' +
            '(`INVALID_FILE_TYPE`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Parent course does not exist (`COURSE_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/admin/resources/{id}': {
    put: {
      tags: ['Catalog — Admin'],
      summary: 'Update a resource',
      description: 'All fields optional, including a replacement `file`.',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                title: { type: 'string', minLength: 1 },
                description: { type: 'string' },
                category: { $ref: '#/components/schemas/ResourceCategory' },
                is_free_sample: { type: 'string', enum: ['true', 'false'] },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated resource.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ResourceCreateUpdateResult' },
            },
          },
        },
        '400': {
          description: 'Validation failure, or a non-PDF signature (`INVALID_FILE_TYPE`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Resource does not exist (`RESOURCE_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Catalog — Admin'],
      summary: 'Delete a resource',
      security: bearer,
      parameters: [{ $ref: '#/components/parameters/idParam' }],
      responses: {
        '204': { description: 'Deleted. No body.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': {
          description: 'Resource does not exist (`RESOURCE_NOT_FOUND`).',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};
