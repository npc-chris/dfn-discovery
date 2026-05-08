// Model registry: available models from each AI provider
// This is the source of truth for model availability, pricing, and capabilities

import { AIModel } from './types';

export const availableModels: AIModel[] = [
  // OpenAI models
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    costPer1kInputTokens: 0.005,
    costPer1kOutputTokens: 0.015,
    releaseDate: '2024-05-13',
    deprecated: false,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    costPer1kInputTokens: 0.01,
    costPer1kOutputTokens: 0.03,
    releaseDate: '2023-11-06',
    deprecated: false,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextWindow: 16385,
    costPer1kInputTokens: 0.0005,
    costPer1kOutputTokens: 0.0015,
    releaseDate: '2023-03-15',
    deprecated: false,
  },

  // Anthropic models
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
    releaseDate: '2024-06-20',
    deprecated: false,
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200000,
    costPer1kInputTokens: 0.015,
    costPer1kOutputTokens: 0.075,
    releaseDate: '2024-03-04',
    deprecated: false,
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    contextWindow: 200000,
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
    releaseDate: '2024-03-04',
    deprecated: false,
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextWindow: 200000,
    costPer1kInputTokens: 0.00025,
    costPer1kOutputTokens: 0.00125,
    releaseDate: '2024-03-04',
    deprecated: false,
  },

  // Google models
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    costPer1kInputTokens: 0.075,
    costPer1kOutputTokens: 0.3,
    releaseDate: '2024-12-20',
    deprecated: false,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    contextWindow: 2000000,
    costPer1kInputTokens: 0.00375,
    costPer1kOutputTokens: 0.015,
    releaseDate: '2024-06-12',
    deprecated: false,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    contextWindow: 1000000,
    costPer1kInputTokens: 0.0375,
    costPer1kOutputTokens: 0.15,
    releaseDate: '2024-06-12',
    deprecated: false,
  },
];

export function getModelsByProvider(provider: string): AIModel[] {
  return availableModels.filter((m) => m.provider === provider && !m.deprecated);
}

export function getModelById(id: string): AIModel | undefined {
  return availableModels.find((m) => m.id === id);
}

export function getDefaultModelForProvider(provider: string): AIModel | undefined {
  const models = getModelsByProvider(provider);
  if (provider === 'openai') return models.find((m) => m.id === 'gpt-4o') || models[0];
  if (provider === 'anthropic') return models.find((m) => m.id === 'claude-3-5-sonnet') || models[0];
  if (provider === 'google') return models.find((m) => m.id === 'gemini-2.0-flash') || models[0];
  return models[0];
}
