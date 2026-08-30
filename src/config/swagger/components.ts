import type { OpenAPIV3 } from 'openapi-types';

type SchemaMap = Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>;

// Security
export const securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject> = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token returned by `/auth/signup` or `/auth/login`. Send as ' +
      '`Authorization: Bearer <access_token>`. Access tokens expire after ' +
      '15 minutes — use `/auth/refresh` to get a new pair rather than ' +
      'forcing a re-login. Admin-only routes additionally require the ' +
      "token's embedded `role` claim to be `admin`; there is no admin " +
      'signup endpoint — admin accounts are provisioned directly in the ' +
      'database.',
  },
};

// Primitive / enum schemas
const resourceCategory: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['test', 'midterm', 'final', 'ppt', 'module', 'handout'],
};

const issueReason: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['broken_file', 'wrong_file', 'incorrect_category', 'poor_quality', 'other'],
};

const issueStatus: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['pending', 'addressed'],
};

const notificationType: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['premium_approved', 'issue_report_addressed', 'subscription_expiring'],
  description: 'A closed set — the server never creates a notification of any other type.',
};

const subscriptionStatus: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['none', 'active', 'expired'],
};

const activationStatus: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['pending', 'activated'],
};

const role: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['student', 'admin'],
};

const lockReasonCode: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['premium_required', 'device_mismatch'],
  description:
    'Why a resource/heartbeat is locked. `premium_required` — account is ' +
    'not an active+activated premium subscriber. `device_mismatch` — ' +
    'premium and activated, but the calling device does not match the ' +
    "account's bound device.",
};

// Shared envelope / utility schemas
const errorResponse: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          description: 'Stable machine-readable error code — see the top-level error catalog.',
          example: 'VALIDATION_ERROR',
        },
        message: {
          type: 'string',
          description: 'Human-readable text, safe to show directly to an end user.',
          example: 'Invalid request',
        },
        retry_after_seconds: {
          type: 'integer',
          description: 'Present only on `423 ACCOUNT_LOCKED`.',
          example: 900,
        },
      },
    },
  },
};

const pagination: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['page', 'limit', 'total', 'total_pages'],
  properties: {
    page: { type: 'integer', example: 1 },
    limit: {
      type: 'integer',
      example: 20,
      description: 'Requested limit, silently clamped server-side to a max of 50.',
    },
    total: { type: 'integer', example: 132 },
    total_pages: { type: 'integer', example: 7 },
  },
};

// ---------------------------------------------------------------------------
// Auth / user schemas
// ---------------------------------------------------------------------------

const authUser: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 42 },
    name: { type: 'string', example: 'Abebe Kebede' },
    email: { type: 'string', format: 'email', example: 'abebe.kebede@aastu.edu.et' },
    phone: { type: 'string', example: '+251911223344' },
    role,
    subscription_status: subscriptionStatus,
    activation_status: activationStatus,
  },
};

const tokenPair: OpenAPIV3.SchemaObject = {
  type: 'object',
  required: ['access_token', 'refresh_token'],
  properties: {
    access_token: { type: 'string', description: '15-minute-lived JWT.' },
    refresh_token: { type: 'string', description: '30-day-lived, single-use rotation token.' },
  },
};

const authResult: OpenAPIV3.SchemaObject = {
  allOf: [
    { $ref: '#/components/schemas/TokenPair' },
    {
      type: 'object',
      properties: { user: { $ref: '#/components/schemas/AuthUser' } },
    },
  ],
};

// Catalog schemas
const stream: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Software Engineering' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const department: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    stream_id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Computer Science' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const course: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 10 },
    department_id: { type: 'integer', example: 1 },
    academic_year: { type: 'integer', minimum: 1, maximum: 5, example: 2 },
    name: { type: 'string', example: 'Data Structures and Algorithms' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const resourceCreateUpdateResult: OpenAPIV3.SchemaObject = {
  type: 'object',
  description: 'Deliberately minimal — not the full resource object.',
  properties: {
    id: { type: 'integer', example: 501 },
    title: { type: 'string', example: 'Midterm 2023 — Solved' },
    is_free_sample: { type: 'boolean', example: false },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const studentResourceView: OpenAPIV3.SchemaObject = {
  type: 'object',
  description:
    'One of four shapes depending on access, decided server-side by ' +
    '`access-policy.ts` in this priority order: (1) free sample — always ' +
    'unlocked; (2) not premium+activated — locked, `premium_required`; ' +
    '(3) premium+activated but wrong device — locked, `device_mismatch`; ' +
    '(4) premium+activated, device matches — unlocked. `file_url`, ' +
    '`file_size_bytes`, and `checksum` are present only when `locked` is ' +
    'false; `reason_code`/`message` are present only when `locked` is true.',
  properties: {
    id: { type: 'integer', example: 501 },
    title: { type: 'string', example: 'Midterm 2023 — Solved' },
    description: { type: 'string', nullable: true, example: null },
    category: resourceCategory,
    is_free_sample: { type: 'boolean' },
    locked: { type: 'boolean' },
    reason_code: lockReasonCode,
    message: {
      type: 'string',
      example:
        'This account is activated on a different device. Contact the admin via Telegram to reactivate.',
    },
    file_url: { type: 'string', format: 'uri' },
    file_size_bytes: { type: 'integer', example: 1048576 },
    checksum: { type: 'string', example: 'sha256:9f2c...' },
  },
};

const searchResult: OpenAPIV3.SchemaObject = {
  type: 'object',
  description: 'A course hit or a resource hit — discriminated by `type`.',
  properties: {
    type: { type: 'string', enum: ['course', 'resource'] },
    id: { type: 'integer' },
    name: { type: 'string', description: 'Present when `type` is `course`.' },
    title: { type: 'string', description: 'Present when `type` is `resource`.' },
    locked: { type: 'boolean', description: 'Present when `type` is `resource`.' },
  },
};

// ---------------------------------------------------------------------------
// Device / premium schemas
// ---------------------------------------------------------------------------

const heartbeatResult: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    subscription_status: subscriptionStatus,
    subscription_expiry_date: { type: 'string', format: 'date-time', nullable: true },
    locked: { type: 'boolean' },
    reason_code: {
      type: 'string',
      enum: ['device_mismatch'],
      description: 'Present only when `locked` is true.',
    },
    message: { type: 'string' },
  },
};

const revokeDeviceResult: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    revoked_device_id: { type: 'integer', example: 7 },
    revoked_at: { type: 'string', format: 'date-time' },
  },
};

const premiumUserLookup: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        subscription_status: subscriptionStatus,
        activation_status: activationStatus,
        last_device_fingerprint: { type: 'string', nullable: true },
      },
    },
  },
};

const grantPremiumResult: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    user_id: { type: 'integer' },
    subscription_status: { type: 'string', enum: ['active'] },
    subscription_expiry_date: { type: 'string', format: 'date-time' },
    activation_status: { type: 'string', enum: ['activated'] },
    device_id: { type: 'integer' },
  },
};

// Issues / notifications schemas
const issueReportFull: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    resource_id: { type: 'integer' },
    reporter_id: { type: 'integer' },
    reason: issueReason,
    other_text: { type: 'string', nullable: true },
    status: issueStatus,
    created_at: { type: 'string', format: 'date-time' },
  },
};

const issueReportMinimal: OpenAPIV3.SchemaObject = {
  type: 'object',
  description: 'Deliberately minimal create/resolve response — not the full report object.',
  properties: {
    id: { type: 'integer' },
    status: issueStatus,
  },
};

const notification: OpenAPIV3.SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    type: notificationType,
    message: { type: 'string' },
    read_status: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

// Export
export const schemas: SchemaMap = {
  ErrorResponse: errorResponse,
  Pagination: pagination,
  AuthUser: authUser,
  TokenPair: tokenPair,
  AuthResult: authResult,
  Stream: stream,
  Department: department,
  Course: course,
  ResourceCreateUpdateResult: resourceCreateUpdateResult,
  StudentResourceView: studentResourceView,
  SearchResult: searchResult,
  HeartbeatResult: heartbeatResult,
  RevokeDeviceResult: revokeDeviceResult,
  PremiumUserLookup: premiumUserLookup,
  GrantPremiumResult: grantPremiumResult,
  IssueReportFull: issueReportFull,
  IssueReportMinimal: issueReportMinimal,
  Notification: notification,
  ResourceCategory: resourceCategory,
  IssueReason: issueReason,
};

// Reusable responses (referenced from every path file so a status code
// means the same schema everywhere it appears)

const errorRef: OpenAPIV3.ReferenceObject = { $ref: '#/components/schemas/ErrorResponse' };

export const responses: Record<string, OpenAPIV3.ResponseObject> = {
  ValidationError: {
    description:
      'Request body/query failed schema validation (`VALIDATION_ERROR`), or ' +
      '(on catalog/resource writes) a duplicate-name conflict such as ' +
      '`STREAM_ALREADY_EXISTS`.',
    content: { 'application/json': { schema: errorRef } },
  },
  Unauthorized: {
    description: 'Missing/malformed `Authorization` header (`UNAUTHORIZED`).',
    content: { 'application/json': { schema: errorRef } },
  },
  Forbidden: {
    description: "Caller's role does not permit this action (`ADMIN_ONLY`/`FORBIDDEN`).",
    content: { 'application/json': { schema: errorRef } },
  },
  NotFound: {
    description: 'The referenced resource does not exist.',
    content: { 'application/json': { schema: errorRef } },
  },
  Conflict: {
    description: 'The request conflicts with the current state of the referenced resource.',
    content: { 'application/json': { schema: errorRef } },
  },
  InternalError: {
    description: 'Unhandled server error (`INTERNAL_ERROR`). Never leaks internals.',
    content: { 'application/json': { schema: errorRef } },
  },
};

export const parameters: Record<string, OpenAPIV3.ParameterObject> = {
  page: {
    name: 'page',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  limit: {
    name: 'limit',
    in: 'query',
    required: false,
    description: 'Silently clamped to a maximum of 50 rather than rejected.',
    schema: { type: 'integer', minimum: 1, default: 20, maximum: 50 },
  },
  idParam: {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'integer', minimum: 1 },
  },
};
