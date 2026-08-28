import { z } from 'zod';

// SRS's own example always includes a note ("50 birr via Telebirr,
// confirmed via @student_handle on Telegram"), but nothing in the spec
// says it's required — kept optional. Worth logging when present: it's
// the only after-the-fact traceability for a payment that was verified
// entirely outside the system (SRS Section 10, Item #7's own framing).
export const grantPremiumSchema = z.object({
  note: z.string().optional(),
});

// GET /admin/users?email=
export const adminUserLookupQuerySchema = z.object({
  email: z.string().email('Invalid email address'),
});