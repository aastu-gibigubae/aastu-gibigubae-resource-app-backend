import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiDocument } from './config/swagger/document';
import { authRouter } from './modules/auth/auth.routes';
import { deviceRouter } from './modules/device/device.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { errorHandler } from './shared/middleware/error-handler';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { issuesRouter } from './modules/issues/issues.routes';
import { premiumRouter } from './modules/premium/premium.routes';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiDocument, {
    customSiteTitle: 'AASTU Gibi Gubae — API Docs',
  }),
);

app.get('/', (_req, res) => {
  res.redirect('/docs');
});

app.use(authRouter);
app.use(deviceRouter);
app.use(notificationsRouter);
app.use(catalogRouter);
app.use(issuesRouter);
app.use(premiumRouter);

app.use(errorHandler);

export default app;
