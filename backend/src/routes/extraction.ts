/**
 * Extraction Routes
 * Endpoints for AI-powered extraction and analysis of job data
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createAIAnalysisWorkers } from '../services/ai-analysis-workers';
import { AppError } from '../middleware/error';

const router: Router = Router();

const AI_PROVIDER = process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'google' | undefined;
const AI_MODEL = process.env.AI_MODEL;

function resolveProvider(provider?: string): 'openai' | 'anthropic' | 'google' {
  const resolvedProvider = (provider as 'openai' | 'anthropic' | 'google' | undefined) ?? AI_PROVIDER;

  if (!resolvedProvider) {
    throw new AppError(500, 'AI_PROVIDER is required');
  }

  return resolvedProvider;
}

function resolveApiKey(provider: 'openai' | 'anthropic' | 'google'): string {
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];

  if (!apiKey) {
    throw new AppError(500, `API key not configured for provider: ${provider}`);
  }

  return apiKey;
}

/**
 * POST /extraction/extract-job-data
 * Extract structured job data from attachment or description
 *
 * Request:
 * {
 *   jobId: string;
 *   jobData: {...};
 *   instructions?: string;
 *   provider?: string; // optional override
 *   model?: string; // optional override
 * }
 *
 * Response: AIExtractionResponse with extracted data and confidence
 */
router.post('/extract-job-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, jobData, instructions, provider, model } = req.body;
    const resolvedProvider = resolveProvider(provider);

    if (!jobId || !jobData) {
      throw new AppError(400, 'jobId and jobData are required');
    }

    const workers = createAIAnalysisWorkers(resolvedProvider, resolveApiKey(resolvedProvider), model ?? AI_MODEL);
    const response = await workers.extractJobData({
      jobId,
      jobData,
      instructions,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /extraction/summarize-evidence
 * Summarize evidence findings from factory assessment
 *
 * Request:
 * {
 *   content: string;
 *   maxLength?: number;
 *   instructions?: string;
 *   provider?: string;
 *   model?: string;
 * }
 *
 * Response: AISummarizationResponse with summary
 */
router.post('/summarize-evidence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, maxLength, instructions, provider, model } = req.body;
    const resolvedProvider = resolveProvider(provider);

    if (!content) {
      throw new AppError(400, 'content is required');
    }

    const workers = createAIAnalysisWorkers(resolvedProvider, resolveApiKey(resolvedProvider), model ?? AI_MODEL);
    const response = await workers.summarizeEvidence({
      content,
      maxLength,
      instructions,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /extraction/explain-recommendation
 * Generate explanation for why a factory was recommended
 *
 * Request:
 * {
 *   scenario: string;
 *   context: {...};
 *   instructions?: string;
 *   provider?: string;
 *   model?: string;
 * }
 *
 * Response: AIExplanationResponse with detailed explanation and key points
 */
router.post('/explain-recommendation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scenario, context, instructions, provider, model } = req.body;
    const resolvedProvider = resolveProvider(provider);

    if (!scenario || !context) {
      throw new AppError(400, 'scenario and context are required');
    }

    const workers = createAIAnalysisWorkers(resolvedProvider, resolveApiKey(resolvedProvider), model ?? AI_MODEL);
    const response = await workers.explainRecommendation({
      scenario,
      context,
      instructions,
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /extraction/validate-api-key
 * Validate that API credentials are working for configured provider
 *
 * Query params:
 * - provider?: string (defaults to configured provider)
 *
 * Response: { valid: boolean; provider: string; model?: string; }
 */
router.get('/validate-api-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = resolveProvider(req.query.provider as string | undefined);
    const workers = createAIAnalysisWorkers(provider, resolveApiKey(provider), AI_MODEL);
    const valid = await workers.validateApiKey();

    res.json({
      valid,
      provider,
      model: AI_MODEL,
      metrics: valid ? workers.getUsageMetrics() : undefined,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /extraction/usage-metrics
 * Get token usage and cost metrics
 *
 * Response: { provider, model, totalInputTokens, totalOutputTokens, estimatedCost, ... }
 */
router.get('/usage-metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = resolveProvider(AI_PROVIDER);

    if (!AI_MODEL) {
      throw new AppError(500, 'AI_MODEL is required');
    }

    const workers = createAIAnalysisWorkers(provider, resolveApiKey(provider), AI_MODEL);
    const metrics = workers.getUsageMetrics();

    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

export default router;
