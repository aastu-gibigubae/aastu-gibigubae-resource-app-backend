import express from 'express';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// module routers get mounted here as each module is built, e.g.:
// app.use('/auth', authRouter);

export default app;