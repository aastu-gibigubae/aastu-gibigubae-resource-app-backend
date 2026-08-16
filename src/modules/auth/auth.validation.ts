import { z } from 'zod';

export const normalizePhone = (value: string): string => {
  const trimmed = value.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) throw new Error('Phone number contains invalid characters');

  const digits = trimmed.replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? `+251${digits.slice(1)}` : trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error('Phone number must be a valid international number');
  return normalized;
};

export const phoneSchema = z.string().trim().min(1).refine(
  (value) => {
    try {
      normalizePhone(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Phone number must be a valid international number' },
).transform(normalizePhone);

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

export const signUpSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: phoneSchema,
  password,
  deviceFingerprint: z.string().trim().min(8).max(512).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password,
  deviceFingerprint: z.string().trim().min(8).max(512).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceFingerprint: z.string().trim().min(8).max(512).optional(),
});
