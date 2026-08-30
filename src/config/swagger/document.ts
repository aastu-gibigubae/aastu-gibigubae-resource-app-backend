import type { OpenAPIV3 } from 'openapi-types';
import { env } from '../env';
import { parameters, responses, schemas, securitySchemes } from './components';
import { authPaths } from './paths/auth.paths';
import { catalogPaths } from './paths/catalog.paths';
import { devicePaths } from './paths/device.paths';
import { healthPaths } from './paths/health.paths';
import { issuesPaths } from './paths/issues.paths';
import { notificationsPaths } from './paths/notifications.paths';
import { premiumPaths } from './paths/premium.paths';

const servers: OpenAPIV3.ServerObject[] = [
  { url: `http://localhost:${env.PORT}`, description: 'Local development' },
  {
    url: 'https://your-service.onrender.com',
    description: 'Production (replace with your deployed host)',
  },
];

export const openapiDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'AASTU Gibi Gubae — Resource App API',
    version: '1.0.0',
    description:
      'REST API powering the AASTU Gibi Gubae freshman course resource app: student ' +
      'catalog browsing with premium/device-gated downloads, admin content management, ' +
      'manually-confirmed premium activation, device binding, issue reporting, and ' +
      'notifications.\n\n' +
      '**Conventions**\n' +
      '- Request/response bodies are JSON with `snake_case` keys, except resource ' +
      'create/update which is `multipart/form-data`.\n' +
      '- Every error response shares one envelope: `{ "error": { "code", "message" } }` ' +
      '(some add extra fields, e.g. `retry_after_seconds`).\n' +
      '- Any endpoint returning a `pagination` object accepts `?page=` (default `1`) and ' +
      '`?limit=` (default `20`, silently clamped to a max of `50` rather than rejected).\n' +
      "- Admin routes require the access token's embedded `role` claim to be `admin`; " +
      'there is no admin signup endpoint.',
    contact: { name: 'AASTU Gibi Gubae' },
    license: { name: 'ISC' },
  },
  servers,
  tags: [
    { name: 'Auth', description: 'Signup, login, token refresh, logout.' },
    {
      name: 'Catalog — Browse',
      description: 'Student-facing browsing, search, and access-checked downloads.',
    },
    {
      name: 'Catalog — Admin',
      description: 'Admin CRUD over streams, departments, courses, and resources.',
    },
    { name: 'Premium', description: 'Admin-only manual premium activation.' },
    { name: 'Device', description: 'Device binding, heartbeat re-verification, and revocation.' },
    { name: 'Issues', description: 'Student issue reports and admin triage.' },
    { name: 'Notifications', description: "A student's own in-app notifications." },
    { name: 'Health', description: 'Liveness check.' },
  ],
  paths: {
    ...healthPaths,
    ...authPaths,
    ...catalogPaths,
    ...premiumPaths,
    ...devicePaths,
    ...issuesPaths,
    ...notificationsPaths,
  },
  components: {
    securitySchemes,
    schemas,
    responses,
    parameters,
  },
  security: [{ bearerAuth: [] }],
};
