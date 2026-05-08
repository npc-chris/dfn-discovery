// AI Provider types and interfaces
// Supports OpenAI, Anthropic, and Google as pluggable providers

export type AIProvider = 'openai' | 'anthropic' | 'google';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  contextWindow?: number;
  costPer1kInputTokens?: number;
  costPer1kOutputTokens?: number;
  releaseDate?: string;
  deprecated?: boolean;
}

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface AIExtractionRequest {
  jobId: string;
  jobData: Record<string, unknown>;
  instructions: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIExtractionResponse {
  extracted: Record<string, unknown>;
  confidence: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  stopReason?: string;
}

export interface AISummarizationRequest {
  content: string;
  maxLength?: number;
  instructions?: string;
  temperature?: number;
}

export interface AISummarizationResponse {
  summary: string;
  confidence: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

export interface AIExplanationRequest {
  scenario: string;
  context: Record<string, unknown>;
  instructions?: string;
  temperature?: number;
}

export interface AIExplanationResponse {
  explanation: string;
  keyPoints: string[];
  confidence: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}
