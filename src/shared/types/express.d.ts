import type { Role } from '@prisma/client';

// Architecture doc, Flow 1: "verifies JWT, attaches req.user (id, role)
// and req.deviceFingerprint (the claim embedded at login — FR-1.5)".
// Populated by shared/middleware/require-auth.ts; nothing else should
// set these.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: Role;
      };
      deviceFingerprint?: string;
    }
  }
}

export {};
