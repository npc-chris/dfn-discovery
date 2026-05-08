// Model discovery service
// Allows querying available models from each AI provider

import { AIProvider, AIModel } from './types';
import { availableModels, getModelsByProvider, getDefaultModelForProvider, getModelById } from './model-registry';

export async function discoverModels(provider?: AIProvider): Promise<AIModel[]> {
  if (!provider) {
    return availableModels.filter((m) => !m.deprecated);
  }
  return getModelsByProvider(provider as string);
}

export async function discoverModelById(modelId: string): Promise<AIModel | null> {
  const model = getModelById(modelId);
  return model || null;
}

export async function getDefaultModel(provider: AIProvider): Promise<AIModel | null> {
  const model = getDefaultModelForProvider(provider);
  return model || null;
}

export async function listProviders(): Promise<AIProvider[]> {
  return ['openai', 'anthropic', 'google'];
}

export interface ModelFilterOptions {
  provider?: AIProvider;
  minContextWindow?: number;
  maxCostPer1kTokens?: number;
  deprecated?: boolean;
}

export async function filterModels(options: ModelFilterOptions): Promise<AIModel[]> {
  let filtered = availableModels;

  if (options.provider) {
    filtered = filtered.filter((m) => m.provider === options.provider);
  }

  if (options.minContextWindow) {
    filtered = filtered.filter((m) => (m.contextWindow || 0) >= options.minContextWindow);
  }

  if (options.maxCostPer1kTokens) {
    filtered = filtered.filter(
      (m) => !m.costPer1kInputTokens || m.costPer1kInputTokens <= options.maxCostPer1kTokens,
    );
  }

  if (options.deprecated !== undefined) {
    filtered = filtered.filter((m) => m.deprecated === options.deprecated);
  }

  return filtered;
}
