import type { Request, Response } from 'express';
import type { PublicUser } from '../users/users.types';
import { loginSchema, refreshSchema, signupSchema } from './auth.validation';
import * as authService from './auth.service';

// SRS §8.5 user object shape, extended with phone since it's our own
// schema addition — a student's own phone number in their own
// signup/login response isn't sensitive to them. Includes
// activation_status in both responses for consistency, even though the
// SRS's own signup example omits it and login's includes it — a fresh
// signup's activation_status is always 'pending' regardless, so
// showing it reveals nothing new; treating both responses the same
// shape is easier to maintain than matching two examples that likely
// differ by oversight rather than intent.
const toUserResponse = (user: PublicUser) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  subscription_status: user.subscriptionStatus,
  activation_status: user.activationStatus,
});

export const signup = async (req: Request, res: Response): Promise<void> => {
  const input = signupSchema.parse(req.body);
  const result = await authService.signup(input);

  res.status(201).json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    user: toUserResponse(result.user),
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, req.ip ?? 'unknown');

  res.status(200).json({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    user: toUserResponse(result.user),
  });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await authService.refresh(refreshToken);

  res.status(200).json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  await authService.logout(req.user!.id, req.deviceFingerprint);
  res.status(204).send();
};