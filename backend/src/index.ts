// Backend entry point
// Express server with all services and routes configured

import express from 'express';
import { errorHandler } from './middleware/error';
import jobsRouter from './routes/jobs';
import modelsRouter from './routes/models';
import extractionRouter from './routes/extraction';
import scoringRouter from './routes/scoring';
import enrichmentRouter from './routes/enrichment';
import recommendationsRouter from './routes/recommendations';
import queueRouter from './routes/queue';
import batchRouter from './routes/batch';
import webhooksRouter from './routes/webhooks';
import analyticsApp from './routes/analytics';

const app = express();
const portValue = process.env.PORT;

if (!portValue) {
  throw new Error('PORT is required');
}

const PORT = Number(portValue);

if (!Number.isFinite(PORT)) {
  throw new Error(`PORT must be a valid number, got: ${portValue}`);
}

// ---------------------------------------------------------------------------
// Webhook routes — mounted BEFORE global JSON middleware so that raw body
// is captured for HMAC signature verification.
// ---------------------------------------------------------------------------
app.use(
  '/webhooks',
  express.raw({ type: '*/*', limit: '1mb', inflate: true }),
  (req, _res, next) => {
    // Attach raw buffer so webhook handlers can verify signatures.
    (req as any).rawBody = req.body as Buffer;
    next();
  },
  webhooksRouter,
);

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
import helmet from 'helmet';
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Core API routes — organized by service domain
// ---------------------------------------------------------------------------
app.use('/jobs', jobsRouter);
app.use('/models', modelsRouter);
app.use('/extraction', extractionRouter);
app.use('/scoring', scoringRouter);
app.use('/enrichment', enrichmentRouter);
app.use('/recommendations', recommendationsRouter);
app.use('/queue', queueRouter);
app.use('/batch', batchRouter);

// ---------------------------------------------------------------------------
// Phase 6.9 Analytics — separate sub-app at /api/v1/analytics
// Isolated from the core recommendation routes so it can be independently
// versioned, rate-limited, or open-sourced.
// ---------------------------------------------------------------------------
app.use('/api/v1/analytics', analyticsApp);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`DFN Discovery Backend listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
