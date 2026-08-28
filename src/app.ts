import express from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { deviceRouter } from './modules/device/device.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { errorHandler } from './shared/middleware/error-handler';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { premiumRouter } from './modules/premium/premium.routes';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Every module router bakes in its own full absolute paths (e.g.
// '/auth/login', '/verify/heartbeat') rather than relative ones — so
// every router mounts here the same uniform way, no per-module prefix.
app.use(authRouter);
app.use(deviceRouter);
app.use(notificationsRouter);
app.use(catalogRouter);
app.use(premiumRouter);

// Must be mounted last, after every route — Express requires
// error-handling middleware to be registered after everything it's
// meant to catch errors from.
app.use(errorHandler);

export default app;