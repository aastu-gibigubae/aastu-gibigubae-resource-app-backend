import { z } from 'zod';

// Every module with an :id route param (notifications, and later courses,
// resources, reports, admin/users) needs the same thing: a route param
// that arrives as a string but must be a positive integer matching an
// Int primary key. One shared schema instead of each module re-writing
// this check.
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type IdParam = z.infer<typeof idParamSchema>;