import type { NotificationType } from '@prisma/client';

// Matches SRS §8.5 GET /notifications response shape exactly:
// { id, type, message, read_status, created_at } — no related_resource_id
// in the documented response example, so it's left off the public shape
// too (it exists on the DB row for internal use, e.g. deep-linking later,
// but nothing in the spec asks for it to be returned yet).
export interface PublicNotification {
  id: number;
  type: NotificationType;
  message: string;
  readStatus: boolean;
  createdAt: Date;
}