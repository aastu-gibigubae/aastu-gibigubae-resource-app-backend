import { Router } from 'express';
import { login, logout, refresh, signUp } from './auth.service.js';
import { loginSchema, refreshSchema, signUpSchema } from './auth.validation.js';

export const authRouter = Router();

authRouter.post('/signup', async (req, res, next) => {
  try { res.status(201).json(await signUp(signUpSchema.parse(req.body))); } catch (error) { next(error); }
});

authRouter.post('/login', async (req, res, next) => {
  try { res.json(await login(loginSchema.parse(req.body))); } catch (error) { next(error); }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    res.json(await refresh(input.refreshToken, input.deviceFingerprint));
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const input = refreshSchema.pick({ refreshToken: true }).parse(req.body);
    await logout(input.refreshToken);
    res.status(204).send();
  } catch (error) { next(error); }
});
