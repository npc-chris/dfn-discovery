/**
 * AI Analysis Workers Service
 *
 * Orchestrates extraction, summarization, and explanation tasks using AI providers.
 * Coordinates with adapter factory to support OpenAI, Anthropic, and Google models.
 *
 * Responsibilities:
 * - Route work to appropriate AI provider adapters
 * - Manage AI model selection and fallback
 * - Extract structured data from job attachments
 * - Summarize evidence and findings
 * - Generate explanations for recommendations
 * - Handle API rate limiting and retries
 * - Track token usage and costs
 */

import { AIExtractionRequest, AIExtractionResponse, AISummarizationRequest, AISummarizationResponse, AIExplanationRequest, AIExplanationResponse, AIProvider, AIProviderConfig } from './ai-providers/types.ts';
import { createAIProviderAdapter, AIProviderAdapter } from './ai-providers/adapter.ts';
import { getDefaultModelForProvider } from './ai-providers/model-registry.ts';

// Token usage tracking for cost optimization
interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  startTime: Date;
}

export class AIAnalysisWorkers {
  private adapter: AIProviderAdapter;
  private provider: AIProvider;
  private model: string;
  private tokenUsage: TokenUsage;

  constructor(provider: AIProvider, apiKey: string, model?: string) {
    this.provider = provider;
    const selectedModel = model || getDefaultModelForProvider(provider)?.id || 'gpt-4o';
    this.model = selectedModel;

    const config: AIProviderConfig = { provider, apiKey };
    this.adapter = createAIProviderAdapter(config, selectedModel);

    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startTime: new Date(),
    };
  }

  /**
   * Extract structured job data from attachments and descriptions.
   * Used by Job Normalization Worker.
   *
   * @param request - Extraction request with job data and instructions
   * @returns Extracted data with confidence scores
   * @throws Error if extraction fails after retries
   */
  async extractJobData(request: AIExtractionRequest): Promise<AIExtractionResponse> {
    const response = await this.adapter.extract(request);
    this.trackTokenUsage(response.usage);
    return response;
  }

  /**
   * Summarize evidence findings and factory capabilities.
   * Used by Evidence Enrichment and Scoring workers.
   *
   * @param request - Content to summarize with length constraints
   * @returns Summarized content preserving key details
   * @throws Error if summarization fails
   */
  async summarizeEvidence(request: AISummarizationRequest): Promise<AISummarizationResponse> {
    const response = await this.adapter.summarize(request);
    this.trackTokenUsage(response.usage);
    return response;
  }

  /**
   * Generate detailed explanations for why a factory was recommended.
   * Used by Recommendation Presentation Layer.
   *
   * @param request - Scenario context and evidence
   * @returns Explanation with key points highlighted
   * @throws Error if explanation generation fails
   */
  async explainRecommendation(request: AIExplanationRequest): Promise<AIExplanationResponse> {
    const response = await this.adapter.explain(request);
    this.trackTokenUsage(response.usage);
    return response;
  }

  /**
   * Validate that API keys are valid for the configured provider.
   * Called during initialization and credential rotation.
   *
   * @returns True if valid, false if invalid
   */
  async validateApiKey(): Promise<boolean> {
    return this.adapter.validateApiKey();
  }

  /**
   * Get token usage and cost metrics for billing and optimization.
   *
   * @returns Usage statistics for current session
   */
  getUsageMetrics() {
    const inputCost = this.estimateCost('input', this.tokenUsage.totalInputTokens);
    const outputCost = this.estimateCost('output', this.tokenUsage.totalOutputTokens);

    return {
      provider: this.provider,
      model: this.model,
      totalInputTokens: this.tokenUsage.totalInputTokens,
      totalOutputTokens: this.tokenUsage.totalOutputTokens,
      estimatedInputCost: inputCost,
      estimatedOutputCost: outputCost,
      estimatedTotalCost: inputCost + outputCost,
      sessionStartTime: this.tokenUsage.startTime,
      sessionDurationMinutes: Math.round(
        (new Date().getTime() - this.tokenUsage.startTime.getTime()) / 60000,
      ),
    };
  }

  /**
   * Reset token usage tracking (e.g., at start of new billing cycle)
   */
  resetUsageMetrics() {
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startTime: new Date(),
    };
  }

  private trackTokenUsage(usage: { inputTokens: number; outputTokens: number }) {
    this.tokenUsage.totalInputTokens += usage.inputTokens;
    this.tokenUsage.totalOutputTokens += usage.outputTokens;
  }

  private estimateCost(type: 'input' | 'output', tokens: number): number {
    // Pricing per 1k tokens (approximate USD)
    const pricing: Record<string, Record<string, number>> = {
      openai: {
        input: 0.005,
        output: 0.015,
      },
      anthropic: {
        input: 0.003,
        output: 0.015,
      },
      google: {
        input: 0.075,
        output: 0.3,
      },
    };

    const modelPricing = pricing[this.provider];
    if (!modelPricing) return 0;

    return (tokens / 1000) * (modelPricing[type] || 0);
  }
}

/**
 * Factory to create AI workers with configured provider
 */
export function createAIAnalysisWorkers(
  provider: AIProvider,
  apiKey?: string,
  model?: string,
): AIAnalysisWorkers {
  const finalApiKey = apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || '';

  if (!finalApiKey) {
    throw new Error(`Missing API key for provider: ${provider}`);
  }

  return new AIAnalysisWorkers(provider, finalApiKey, model);
}
