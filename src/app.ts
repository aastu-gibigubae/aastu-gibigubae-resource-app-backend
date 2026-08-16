import express from 'express';
import { authRouter } from './modules/auth/auth.router.js';
import { userRouter } from './modules/users/user.router.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/users', userRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
