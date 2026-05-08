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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
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

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`DFN Discovery Backend listening on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
