import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';

// Every module with an :id route param (notifications, and later courses,
// resources, reports, admin/users) needs the same thing: a route param
// that arrives as a string but must be a positive integer matching an
// Int primary key. One shared schema instead of each module re-writing
// this check.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type IdParam = z.infer<typeof idParamSchema>;

// FR-3.5 — GET /courses and GET /courses/:id/resources pagination.
// Query params arrive as strings, so z.coerce.number() converts them;
// missing entirely falls through to .default() (coerce runs first, and
// undefined coerces to NaN, not 0 — that's why default is attached
// after coerce, not used as coerce's fallback).
//
// limit is clamped via .transform(), not rejected via .max() — per the
// SRS wording, a client asking for limit=500 gets served limit=50, not
// a 400. page has no upper bound to clamp: paging past the last page
// isn't an error, it's just an empty items array with the same
// total/total_pages the client can already see.
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
});

export type PaginationParams = z.infer<typeof paginationSchema>;