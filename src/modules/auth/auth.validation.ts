import { z } from 'zod';

// SRS §8.5 signup request: { name, email, password } — phone added per
// our own deliberate schema extension (not in the original SRS body,
// see schema.prisma's comment on User.phone).
export const signupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone is required'),
  // 8-character minimum is my own default — the SRS names a
  // WEAK_PASSWORD error code but never specifies an actual rule.
  // Easy to tighten later; flagged here rather than silently assumed.
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// SRS §8.5 login request: { email, password, device_fingerprint } — all
// three required, unlike signup which has no fingerprint field at all.
// snake_case keys, matching the actual wire format — this was
// previously camelCase (deviceFingerprint), which meant a real client
// sending the documented body would always fail validation, since
// req.body genuinely has device_fingerprint, not deviceFingerprint.
// auth.controller.ts maps this to auth.service's camelCase LoginInput.
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  device_fingerprint: z.string().min(1, 'Device fingerprint is required'),
});

// SRS §8.5 refresh request: { refresh_token } — same snake_case fix as
// above.
export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});