import { z } from 'zod';
import { paginationSchema } from '../../shared/validation/common.schemas';

export const streamSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

export const departmentCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  stream_id: z.coerce.number().int().positive(),
});

// Either field optional, but at least one required — an empty PUT body
// would otherwise silently succeed and change nothing, which is a
// confusing response to send a 200 for.
export const departmentUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    stream_id: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => data.name !== undefined || data.stream_id !== undefined, {
    message: 'At least one of name or stream_id is required',
  });

export const courseCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  department_id: z.coerce.number().int().positive(),
  // 1-5 matches the DB's own CHECK constraint (schema.prisma comment:
  // "CHECK (1-5) added via raw SQL migration") — validated here too so
  // a bad value gets a friendly 400 instead of a raw Postgres error.
  academic_year: z.coerce.number().int().min(1).max(5),
});

export const courseUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    department_id: z.coerce.number().int().positive().optional(),
    academic_year: z.coerce.number().int().min(1).max(5).optional(),
  })
  .refine((data) => data.name !== undefined || data.department_id !== undefined || data.academic_year !== undefined, {
    message: 'At least one field is required',
  });

// GET /courses?stream_id=&department_id=&year=&page=&limit=
export const courseQuerySchema = z
  .object({
    stream_id: z.coerce.number().int().positive().optional(),
    department_id: z.coerce.number().int().positive().optional(),
    year: z.coerce.number().int().min(1).max(5).optional(),
  })
  .and(paginationSchema);

export const departmentQuerySchema = z.object({
  stream_id: z.coerce.number().int().positive(),
});

// Matches schema.prisma's ResourceCategory enum exactly — hardcoded
// here since Prisma's generated enum is a TS type, not a runtime value
// array zod can derive an enum from directly.
const resourceCategoryEnum = z.enum(['test', 'midterm', 'final', 'ppt', 'module', 'handout']);

// multipart/form-data has no real boolean type — every field arrives
// as a string. is_free_sample needs an explicit string->boolean
// preprocess rather than z.coerce.boolean(), since z.coerce.boolean()
// treats ANY non-empty string (including the literal string "false")
// as true — exactly the wrong behavior for a checkbox-style form field.
const formBoolean = z.preprocess((val) => val === 'true' || val === true, z.boolean());

export const resourceCreateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  course_id: z.coerce.number().int().positive(),
  category: resourceCategoryEnum,
  is_free_sample: formBoolean,
});

export const resourceUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: resourceCategoryEnum.optional(),
  is_free_sample: formBoolean.optional(),
});

// GET /courses/:id/resources?category=&page=&limit= — category is
// required (the SRS's own example always includes it; browsing is
// category-by-category, matching a tabbed UI, not an all-categories-
// at-once view).
export const resourceQuerySchema = z.object({ category: resourceCategoryEnum }).and(paginationSchema);

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
});