import type { Request, Response } from 'express';
import { idParamSchema } from '../../shared/validation/common.schemas';
import * as notificationsService from './notifications.service';

// Response uses snake_case keys per SRS §8.5's documented shape. Note:
// the SRS's example ids ("not_1") are illustrative only — the actual
// schema (per DATABASE_SCHEMA_DESIGN.md) uses plain Int autoincrement
// primary keys, so real responses return a number here, not a
// prefixed string.
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  const notifications = await notificationsService.list(req.user!.id);
  res.status(200).json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      read_status: n.readStatus,
      created_at: n.createdAt,
    })),
  });
};

export const markRead = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await notificationsService.markRead(id, req.user!.id);
  res.status(204).send();
};