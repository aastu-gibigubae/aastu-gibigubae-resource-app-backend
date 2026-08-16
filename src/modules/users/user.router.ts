import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware.js';
import { phoneSchema } from '../auth/auth.validation.js';
import { findActiveUserById, updateActiveUser } from './user.service.js';

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema.optional(),
}).refine((value) => value.name !== undefined || value.phone !== undefined, {
  message: 'Provide at least one field to update',
});

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/me', async (req, res, next) => {
  try {
    res.json({ user: await findActiveUserById(req.auth!.userId) });
  } catch (error) { next(error); }
});

userRouter.patch('/me', async (req, res, next) => {
  try {
    const input = updateProfileSchema.parse(req.body);
    const data = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
    };
    res.json({ user: await updateActiveUser(req.auth!.userId, data) });
  } catch (error) { next(error); }
});
