// Every constant here traces back to a specific requirement — see the
// comment on each. None of these are arbitrary defaults.

// FR-2.5 — max 2 free-sample Resources per (course_id, category)
export const FREE_SAMPLE_LIMIT_PER_COURSE_CATEGORY = 2;

// FR-2.2 — 2MB max file size, PDF only for v1
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_FILE_MIME_TYPE = 'application/pdf';

// SRS §6.1 — bcrypt cost 12
export const BCRYPT_COST = 12;

// Architecture doc §7 anti-patterns note — access token lifetime is the
// intended mechanism for keeping role checks reasonably fresh, since
// require-admin trusts the JWT claim rather than re-querying the DB.
export const ACCESS_TOKEN_TTL = '15m';

// DB doc §5 (RefreshToken) — refresh tokens live up to 30 days
export const REFRESH_TOKEN_TTL_DAYS = 30;

// FR-4.3 — grant-premium sets a 12-month expiry
export const SUBSCRIPTION_DURATION_MONTHS = 12;

// FR-5.3 — cached content locks client-side if not re-verified within 7 days
export const DEVICE_REVERIFICATION_WINDOW_DAYS = 7;

// FR-3.5 — GET /courses and GET /courses/:id/resources pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// FR-7.1 — "subscription expiring (~7 days out)" in-app notification,
// fired once by jobs/subscription-expiry.job.ts as a student's
// subscriptionExpiryDate approaches.
export const SUBSCRIPTION_EXPIRY_WARNING_DAYS = 7;
