// Backend entry point
// Express server with all services and routes configured

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error';
import jobsRouter from './routes/jobs';
import projectsRouter from './routes/projects';
import quotesRouter from './routes/quotes';
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
// Global middleware & CORS
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      // Allow localhost dev servers, extension schemes, and production domains
      const isAllowed =
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        origin.startsWith('chrome-extension://') ||
        origin.endsWith('.fabnetwork.com.ng') ||
        origin === 'https://fabnetwork.com.ng';

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in development
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Prism-Key'],
  }),
);

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
// API v1 Routes (Standard API path used by dfn-ui and @dfn/api-client)
// ---------------------------------------------------------------------------
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/quotes', quotesRouter);
app.use('/api/v1/recommendations', recommendationsRouter);
app.use('/api/v1/models', modelsRouter);
app.use('/api/v1/extraction', extractionRouter);
app.use('/api/v1/scoring', scoringRouter);
app.use('/api/v1/enrichment', enrichmentRouter);
app.use('/api/v1/queue', queueRouter);
app.use('/api/v1/batch', batchRouter);
app.use('/api/v1/analytics', analyticsApp);

// ---------------------------------------------------------------------------
// Root aliases for backward compatibility
// ---------------------------------------------------------------------------
app.use('/jobs', jobsRouter);
app.use('/projects', projectsRouter);
app.use('/quotes', quotesRouter);
app.use('/models', modelsRouter);
app.use('/extraction', extractionRouter);
app.use('/scoring', scoringRouter);
app.use('/enrichment', enrichmentRouter);
app.use('/recommendations', recommendationsRouter);
app.use('/queue', queueRouter);
app.use('/batch', batchRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`DFN Discovery Backend listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

