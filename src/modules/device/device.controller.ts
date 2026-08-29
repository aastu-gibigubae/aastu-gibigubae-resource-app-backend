import type { Request, Response } from 'express';
import { z } from 'zod';
import { idParamSchema } from '../../shared/validation/common.schemas';
import * as deviceService from './device.service';

const heartbeatSchema = z.object({
  device_fingerprint: z.string().min(1),
});

// SRS §8.5: Response 200: { revoked_device_id, revoked_at }
export const revokeDevice = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const result = await deviceService.revokeDevice(id, req.user!.id);
  res.status(200).json({
    revoked_device_id: result.id,
    revoked_at: result.revokedAt,
  });
};

// SRS §8.5: three documented response shapes for POST /verify/heartbeat
// — reverification_overdue intentionally excluded, per team decision
// (see device.service.ts's checkHeartbeat for why).
export const heartbeat = async (req: Request, res: Response): Promise<void> => {
  const { device_fingerprint } = heartbeatSchema.parse(req.body);
  const result = await deviceService.checkHeartbeat(req.user!.id, device_fingerprint);

  res.status(200).json({
    subscription_status: result.subscriptionStatus,
    subscription_expiry_date: result.subscriptionExpiryDate,
    locked: result.locked,
    ...(result.reasonCode === undefined ? {} : { reason_code: result.reasonCode }),
    ...(result.message === undefined ? {} : { message: result.message }),
  });
};
