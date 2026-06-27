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

const app = express();
const portValue = process.env.PORT;

if (!portValue) {
  throw new Error('PORT is required');
}

const PORT = Number(portValue);

if (!Number.isFinite(PORT)) {
  throw new Error(`PORT must be a valid number, got: ${portValue}`);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes - organized by service domain
app.use('/jobs', jobsRouter);
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
