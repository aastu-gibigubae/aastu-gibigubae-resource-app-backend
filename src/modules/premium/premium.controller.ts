import type { Request, Response } from 'express';
import { idParamSchema } from '../../shared/validation/common.schemas';
import * as premiumService from './premium.service';
import { adminUserLookupQuerySchema, grantPremiumSchema } from './premium.validation';

// SRS §8.5's exact documented response shape:
// { "user": { id, name, email, subscription_status, activation_status,
//   last_device_fingerprint } }
export const lookupUserByEmail = async (req: Request, res: Response): Promise<void> => {
  const { email } = adminUserLookupQuerySchema.parse(req.query);
  const user = await premiumService.findUserByEmail(email);

  res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      subscription_status: user.subscriptionStatus,
      activation_status: user.activationStatus,
      last_device_fingerprint: user.lastDeviceFingerprint,
    },
  });
};

// SRS §8.5's exact documented response shape:
// { user_id, subscription_status, subscription_expiry_date,
//   activation_status, device_id }
export const grantPremium = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const { note } = grantPremiumSchema.parse(req.body);

  const result = await premiumService.grantPremium(req.user!.id, id, note);

  res.status(200).json({
    user_id: result.userId,
    subscription_status: result.subscriptionStatus,
    subscription_expiry_date: result.subscriptionExpiryDate,
    activation_status: result.activationStatus,
    device_id: result.deviceId,
  });
};
