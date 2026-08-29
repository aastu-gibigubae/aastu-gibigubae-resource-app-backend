# API Reference

Base URL: your deployed host (e.g. `https://your-service.onrender.com`)
in production, `http://localhost:3000` locally. No global path prefix —
every router mounts its own full absolute paths (see `src/app.ts`).

## Conventions

- **Auth**: `Authorization: Bearer <access_token>` on every route marked
  🔒 below. Get a token pair from `/auth/signup` or `/auth/login`.
- **Admin-only routes** (marked 🔒👑) additionally require the token's
  embedded role claim to be `admin` — there is no admin signup
  endpoint; admin accounts are created directly in the database (see
  `docs/DEPLOYMENT.md` / your team's own runbook for how you provision
  the first one).
- **Request/response bodies**: JSON, `snake_case` keys, unless noted as
  `multipart/form-data`.
- **Errors**: every error response has the same envelope:
  ```json
  { "error": { "code": "SOME_CODE", "message": "Human-readable text" } }
  ```
  Some errors add extra fields alongside `code`/`message` (e.g.
  `retry_after_seconds` on `ACCOUNT_LOCKED`). See [Error codes](#error-codes).
- **Pagination**: any endpoint returning a `pagination` object accepts
  `?page=` (default `1`) and `?limit=` (default from
  `config/constants.ts`, silently clamped to a max rather than
  rejected).

---

## Auth (`/auth/*`)

| Method | Path            | Auth | Purpose                                                                                                           |
| ------ | --------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/signup`  | —    | Create a student account, returns a token pair. Role is never accepted as input — every new account is `student`. |
| POST   | `/auth/login`   | —    | Log in with `device_fingerprint`; also updates the account's `last_device_fingerprint`. Rate-limited (see below). |
| POST   | `/auth/refresh` | —    | Rotate a refresh token for a new pair. The old refresh token is invalidated the moment it's used.                 |
| POST   | `/auth/logout`  | 🔒   | Revoke the current session's refresh token. No-ops if there's nothing to revoke — safe to call twice.             |

**Signup** — `POST /auth/signup`

```json
{ "name": "...", "email": "...", "phone": "...", "password": "min 8 chars" }
```

→ `201` `{ access_token, refresh_token, user: { id, name, email, phone, role, subscription_status, activation_status } }`

**Login** — `POST /auth/login`

```json
{ "email": "...", "password": "...", "device_fingerprint": "..." }
```

→ `200` same shape as signup's response.

Login is locked out after **5 failed attempts within 15 minutes**,
tracked independently per-email and per-IP (in-memory — resets on
server restart, doesn't coordinate across multiple instances; see
`src/shared/middleware/rate-limit.ts`'s own comment). A locked attempt
returns before ever touching the database:
`423 { "error": { "code": "ACCOUNT_LOCKED", "message": "...", "retry_after_seconds": 900 } }`

**Refresh** — `POST /auth/refresh`

```json
{ "refresh_token": "..." }
```

→ `200 { access_token, refresh_token }`. Any failure (bad signature,
unknown, already used, expired) collapses to the same
`401 REFRESH_TOKEN_INVALID` — deliberately, per the code's own comment:
the client's only correct response to any of these is "force a full
re-login," so there's nothing to gain by distinguishing them.

**Logout** — `POST /auth/logout` → `204`, no body.

---

## Catalog — student browsing (`/streams`, `/departments`, `/courses`, `/search`)

All 🔒, no admin requirement.

| Method | Path                                                    | Purpose                                                                         |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/streams`                                              | List every stream.                                                              |
| GET    | `/departments?stream_id=`                               | List departments in a stream.                                                   |
| GET    | `/courses?stream_id=&department_id=&year=&page=&limit=` | Paginated course list, every filter optional.                                   |
| GET    | `/courses/:id/resources?category=&page=&limit=`         | **The core endpoint** — browse + access-check combined. `category` is required. |
| GET    | `/search?q=`                                            | Mixed course/resource search.                                                   |

**`GET /courses/:id/resources`** is the one endpoint worth reading
closely — it returns the access decision inline with each resource,
so the client never needs a separate "am I allowed to see this" call.
Four possible shapes per resource item, decided by
`src/modules/catalog/access-policy.ts` in this priority order:

1. **Free sample** — always unlocked, regardless of subscription:
   `{ ..., "locked": false, "file_url": "...", "file_size_bytes": ..., "checksum": "..." }`
2. **Not premium+activated** — `{ ..., "locked": true, "reason_code": "premium_required" }`
3. **Premium+activated, wrong device** — `{ ..., "locked": true, "reason_code": "device_mismatch", "message": "..." }`
4. **Premium+activated, matching device** — same unlocked shape as (1).

---

## Catalog — admin CRUD (`/admin/streams`, `/admin/departments`, `/admin/courses`, `/admin/resources`)

All 🔒👑.

| Method | Path                     | Body                                                                                              | Response                                                     |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| POST   | `/admin/streams`         | `{ name }`                                                                                        | `201 { id, name, created_at }`                               |
| PUT    | `/admin/streams/:id`     | `{ name }`                                                                                        | `200 { id, name }`                                           |
| DELETE | `/admin/streams/:id`     | —                                                                                                 | `204`                                                        |
| POST   | `/admin/departments`     | `{ name, stream_id }`                                                                             | `201 { id, stream_id, name, created_at }`                    |
| PUT    | `/admin/departments/:id` | `{ name?, stream_id? }` (at least one)                                                            | `200 { id, stream_id, name }`                                |
| DELETE | `/admin/departments/:id` | —                                                                                                 | `204`                                                        |
| POST   | `/admin/courses`         | `{ name, department_id, academic_year }` (`academic_year` 1–5)                                    | `201 { id, department_id, academic_year, name, created_at }` |
| PUT    | `/admin/courses/:id`     | any subset of the above                                                                           | `200 { id, department_id, academic_year, name }`             |
| DELETE | `/admin/courses/:id`     | —                                                                                                 | `204`                                                        |
| POST   | `/admin/resources`       | `multipart/form-data`: `file`, `title`, `course_id`, `category`, `description?`, `is_free_sample` | `201 { id, title, is_free_sample, created_at }`              |
| PUT    | `/admin/resources/:id`   | `multipart/form-data`, all fields optional including `file`                                       | `200 { id, title, is_free_sample, created_at }`              |
| DELETE | `/admin/resources/:id`   | —                                                                                                 | `204`                                                        |

`category` is one of `test`, `midterm`, `final`, `ppt`, `module`,
`handout`. File uploads go through `multer` (2MB cap) then a
magic-byte signature check (`validateFileSignature`) that ignores the
client's declared `Content-Type` — both run before the controller
ever sees the request.

---

## Premium (`/admin/users`, `/admin/users/:id/grant-premium`)

Both 🔒👑. **Admin-only by design** — there is no student-facing
payment endpoint anywhere in this app. The intended flow is: a student
pays via Telegram, an admin manually verifies it, then calls
grant-premium.

| Method | Path                             | Purpose                                                                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/users?email=`            | Look up a student before granting premium.                                                                    |
| POST   | `/admin/users/:id/grant-premium` | Atomically: activate a 1-month(s) subscription, bind the student's most recent login device, and notify them. |

**Lookup** → `200 { user: { id, name, email, subscription_status, activation_status, last_device_fingerprint } }`

**Grant premium** — `POST /admin/users/:id/grant-premium`

```json
{ "note": "optional free-text note for the admin's own records" }
```

→ `200 { user_id, subscription_status: "active", subscription_expiry_date, activation_status: "activated", device_id }`

This runs inside a single database transaction — subscription,
device binding, notification, and audit log all commit together or
not at all. It fails with `409 NO_DEVICE_ON_FILE` if the student has
never logged in (there's no device fingerprint to bind yet), or
`409 DEVICE_ALREADY_ACTIVE` if they already have one (revoke it first
via the device module below — this also doubles as the "student got a
new phone" reactivation flow).

---

## Device (`/verify/heartbeat`, `/admin/users/:id/revoke-device`)

| Method | Path                             | Auth | Purpose                                                                  |
| ------ | -------------------------------- | ---- | ------------------------------------------------------------------------ |
| POST   | `/verify/heartbeat`              | 🔒   | Student-facing periodic re-verification. Body: `{ device_fingerprint }`. |
| POST   | `/admin/users/:id/revoke-device` | 🔒👑 | Un-bind a student's device without touching their subscription.          |

**Heartbeat** → `200 { subscription_status, subscription_expiry_date, locked, reason_code?, message? }`
— same `device_mismatch` reasoning as the catalog access-policy above,
just checked independently on its own schedule rather than only at
browse time.

**Revoke device** → `200 { revoked_device_id, revoked_at }`. Does
**not** change `activation_status` or `subscription_status` — per the
SRS's own framing, the student hasn't lost what they paid for, just
the device it was tied to. Access still locks immediately, since the
next heartbeat/browse call finds no active device at all.

---

## Issues (`/resources/:id/report`, `/admin/reports*`)

| Method | Path                                  | Auth | Purpose                                                               |
| ------ | ------------------------------------- | ---- | --------------------------------------------------------------------- |
| POST   | `/resources/:id/report`               | 🔒   | Student reports a problem with a resource. `{ reason, other_text? }`. |
| GET    | `/admin/reports?status=&page=&limit=` | 🔒👑 | Browse reports, `status` (`pending`/`addressed`) optional.            |
| POST   | `/admin/reports/:id/resolve`          | 🔒👑 | Mark a report addressed; notifies the original reporter.              |

`reason` is one of `broken_file`, `wrong_file`, `incorrect_category`,
`poor_quality`, `other`. Reporting **does not** hide the resource —
it stays visible to everyone while the report is pending. A student
can only have one _open_ report per resource at a time
(`409 REPORT_ALREADY_OPEN`); filing a new one after the existing one
is resolved is fine.

Report response shape (create/resolve both minimal, matching the
create/update pattern used elsewhere in the app):
`{ id, status }` — `list` returns the full object per item:
`{ id, resource_id, reporter_id, reason, other_text, status, created_at }`.

---

## Notifications (`/notifications`)

Both 🔒, student-facing only — no admin variant.

| Method | Path                      | Purpose                                |
| ------ | ------------------------- | -------------------------------------- |
| GET    | `/notifications`          | List the current user's notifications. |
| POST   | `/notifications/:id/read` | Mark one as read.                      |

`GET` → `200 { notifications: [{ id, type, message, read_status, created_at }] }`.
`type` is one of `premium_approved`, `issue_report_addressed`,
`subscription_expiring` — a closed set, no others are ever created.

---

## Health

| Method | Path      | Auth | Purpose                                                                       |
| ------ | --------- | ---- | ----------------------------------------------------------------------------- |
| GET    | `/health` | —    | Liveness check. `200 { "status": "ok" }`. Used as Render's `healthCheckPath`. |

---

## Error codes

Every code below can appear in any endpoint's error envelope where
it's semantically relevant; this isn't scoped per-route.

| Code                    | Status | Meaning                                                                |
| ----------------------- | ------ | ---------------------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400    | Request body/query failed schema validation.                           |
| `EMAIL_ALREADY_EXISTS`  | 400    | Signup: email already registered.                                      |
| `PHONE_ALREADY_EXISTS`  | 400    | Signup: phone already registered.                                      |
| `FILE_REQUIRED`         | 400    | Resource create: no file in the multipart body.                        |
| `UNAUTHORIZED`          | 401    | Missing/malformed `Authorization` header.                              |
| `INVALID_CREDENTIALS`   | 401    | Login: wrong email or password.                                        |
| `REFRESH_TOKEN_INVALID` | 401    | Refresh: bad, unknown, reused, or expired token.                       |
| `ACCOUNT_LOCKED`        | 423    | Login: too many recent failed attempts (see Auth section).             |
| `FORBIDDEN`             | 403    | Generic permission denial.                                             |
| `ADMIN_ONLY`            | 403    | Route requires the `admin` role.                                       |
| `NOT_FOUND`             | 404    | Generic missing resource.                                              |
| `USER_NOT_FOUND`        | 404    | Premium lookup/grant: no such user.                                    |
| `RESOURCE_NOT_FOUND`    | 404    | Issue report: resource doesn't exist.                                  |
| `REPORT_NOT_FOUND`      | 404    | Resolve: no such report.                                               |
| `NO_ACTIVE_DEVICE`      | 404    | Revoke-device: student has nothing to revoke.                          |
| `NO_DEVICE_ON_FILE`     | 409    | Grant-premium: student has never logged in.                            |
| `DEVICE_ALREADY_ACTIVE` | 409    | Grant-premium: student already has a bound device.                     |
| `REPORT_ALREADY_OPEN`   | 409    | Issue report: an open report already exists for this student+resource. |
| `INTERNAL_ERROR`        | 500    | Unhandled server error — never leaks internals to the client.          |
