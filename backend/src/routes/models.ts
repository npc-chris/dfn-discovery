// Model discovery API routes
// Public endpoint for querying available AI models and providers

import express from 'express';
import {
  discoverModels,
  discoverModelById,
  listProviders,
  filterModels,
  getDefaultModel,
} from '../services/ai-providers/model-discovery';

const router = express.Router();

// List all available providers
router.get('/providers', async (req, res) => {
  try {
    const providers = await listProviders();
    res.json({ providers });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// List available models, optionally filtered by provider
router.get('/models', async (req, res) => {
  try {
    const provider = (req.query.provider as string) || undefined;
    const models = await discoverModels(provider as any);
    res.json({ models, count: models.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get a specific model by ID
router.get('/models/:modelId', async (req, res) => {
  try {
    const model = await discoverModelById(req.params.modelId);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    res.json({ model });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get default model for a provider
router.get('/providers/:provider/default-model', async (req, res) => {
  try {
    const model = await getDefaultModel(req.params.provider as any);
    if (!model) {
      return res.status(404).json({ error: 'No default model for this provider' });
    }
    res.json({ model });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Filter models by criteria
router.post('/models/filter', async (req, res) => {
  try {
    const { provider, minContextWindow, maxCostPer1kTokens, deprecated } = req.body;
    const models = await filterModels({
      provider,
      minContextWindow,
      maxCostPer1kTokens,
      deprecated,
    });
    res.json({ models, count: models.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
