// AI Provider adapter factory
// Selects and initializes the correct provider based on configuration

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { AIProviderConfig, AIExtractionRequest, AIExtractionResponse, AISummarizationRequest, AISummarizationResponse, AIExplanationRequest, AIExplanationResponse } from './types';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
};

// Helper for retry logic
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = RETRY_CONFIG.maxRetries,
  delayMs = RETRY_CONFIG.initialDelayMs,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (maxRetries <= 0) throw error;

    // Check if error is retryable
    const isRetryable =
      (error instanceof Error && /rate_limit|429|500|502|503|timeout/.test(error.message)) ||
      (error as any)?.status >= 500;

    if (!isRetryable) throw error;

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retryWithBackoff(fn, maxRetries - 1, delayMs * RETRY_CONFIG.backoffMultiplier);
  }
}

export interface AIProviderAdapter {
  extract(req: AIExtractionRequest): Promise<AIExtractionResponse>;
  summarize(req: AISummarizationRequest): Promise<AISummarizationResponse>;
  explain(req: AIExplanationRequest): Promise<AIExplanationResponse>;
  validateApiKey(): Promise<boolean>;
}

class OpenAIAdapter implements AIProviderAdapter {
  private client: OpenAI;
  private model: string;

  constructor(config: AIProviderConfig, model: string = 'gpt-4o') {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = model;
  }

  async extract(req: AIExtractionRequest): Promise<AIExtractionResponse> {
    return retryWithBackoff(async () => {
      const systemPrompt = `You are a data extraction expert. Extract structured data from the provided job information.
Return a valid JSON object with the following fields: company_name, product_name, process_type, material_type, volume_band, location.
Ensure all values are strings. Be concise and accurate.`;

      const userPrompt = `Job Instructions: ${req.instructions || 'Extract job details'}

Job Data:
${JSON.stringify(req.jobData, null, 2)}

Extract and return only valid JSON.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content || '';
      const extracted = JSON.parse(content);

      return {
        extracted,
        confidence: 0.85,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        model: this.model,
        stopReason: response.choices[0].finish_reason,
      };
    });
  }

  async summarize(req: AISummarizationRequest): Promise<AISummarizationResponse> {
    return retryWithBackoff(async () => {
      const maxLengthHint = req.maxLength ? ` Limit to ${req.maxLength} characters.` : '';

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a concise summarization expert. Create clear, factual summaries preserving key details.${maxLengthHint}`,
          },
          { role: 'user', content: `Summarize:\n\n${req.content}` },
        ],
        temperature: req.temperature ?? 0.5,
        max_tokens: req.maxLength ? Math.min(req.maxLength / 4, 500) : 300,
      });

      const summary = response.choices[0].message.content || '';

      return {
        summary,
        confidence: 0.8,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        model: this.model,
      };
    });
  }

  async explain(req: AIExplanationRequest): Promise<AIExplanationResponse> {
    return retryWithBackoff(async () => {
      const systemPrompt = `You are an expert analyst. Provide clear, detailed explanations with key points highlighted.
Focus on actionable insights and evidence-based reasoning.`;

      const prompt = `${req.instructions || 'Explain this scenario:'}

Scenario: ${req.scenario}

Context: ${JSON.stringify(req.context, null, 2)}

Provide explanation and identify 3-5 key points.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: req.temperature ?? 0.6,
        max_tokens: 1500,
      });

      const explanation = response.choices[0].message.content || '';
      const keyPoints = this.extractKeyPoints(explanation);

      return {
        explanation,
        keyPoints,
        confidence: 0.82,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        model: this.model,
      };
    });
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  private extractKeyPoints(text: string): string[] {
    const lines = text.split('\n');
    const keyPoints: string[] = [];

    for (const line of lines) {
      if (line.match(/^[•\-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const point = line.replace(/^[•\-*\d.]\s+/, '').trim();
        if (point && point.length > 0) {
          keyPoints.push(point);
          if (keyPoints.length >= 5) break;
        }
      }
    }

    return keyPoints.length > 0 ? keyPoints : [text.substring(0, 200) + '...'];
  }
}

class AnthropicAdapter implements AIProviderAdapter {
  private client: Anthropic;
  private model: string;

  constructor(config: AIProviderConfig, model: string = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = model;
  }

  async extract(req: AIExtractionRequest): Promise<AIExtractionResponse> {
    return retryWithBackoff(async () => {
      const systemPrompt = `You are a data extraction expert. Extract structured data from the provided job information.
Return a valid JSON object with the following fields: company_name, product_name, process_type, material_type, volume_band, location.
Ensure all values are strings. Be concise and accurate.`;

      const userPrompt = `Job Instructions: ${req.instructions || 'Extract job details'}

Job Data:
${JSON.stringify(req.jobData, null, 2)}

Extract and return only valid JSON.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content[0];
      const text = content.type === 'text' ? content.text : '';
      const extracted = JSON.parse(text);

      return {
        extracted,
        confidence: 0.85,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: this.model,
        stopReason: response.stop_reason ?? undefined,
      };
    });
  }

  async summarize(req: AISummarizationRequest): Promise<AISummarizationResponse> {
    return retryWithBackoff(async () => {
      const maxLengthHint = req.maxLength ? ` Limit to ${req.maxLength} characters.` : '';

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxLength ? Math.min(req.maxLength / 4, 500) : 300,
        system: `You are a concise summarization expert. Create clear, factual summaries preserving key details.${maxLengthHint}`,
        messages: [{ role: 'user', content: `Summarize:\n\n${req.content}` }],
      });

      const summary = response.content[0].type === 'text' ? response.content[0].text : '';

      return {
        summary,
        confidence: 0.8,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: this.model,
      };
    });
  }

  async explain(req: AIExplanationRequest): Promise<AIExplanationResponse> {
    return retryWithBackoff(async () => {
      const systemPrompt = `You are an expert analyst. Provide clear, detailed explanations with key points highlighted.
Focus on actionable insights and evidence-based reasoning.`;

      const prompt = `${req.instructions || 'Explain this scenario:'}

Scenario: ${req.scenario}

Context: ${JSON.stringify(req.context, null, 2)}

Provide explanation and identify 3-5 key points.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const explanation = response.content[0].type === 'text' ? response.content[0].text : '';
      const keyPoints = this.extractKeyPoints(explanation);

      return {
        explanation,
        keyPoints,
        confidence: 0.82,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: this.model,
      };
    });
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  private extractKeyPoints(text: string): string[] {
    const lines = text.split('\n');
    const keyPoints: string[] = [];

    for (const line of lines) {
      if (line.match(/^[•\-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const point = line.replace(/^[•\-*\d.]\s+/, '').trim();
        if (point && point.length > 0) {
          keyPoints.push(point);
          if (keyPoints.length >= 5) break;
        }
      }
    }

    return keyPoints.length > 0 ? keyPoints : [text.substring(0, 200) + '...'];
  }
}

class GoogleAdapter implements AIProviderAdapter {
  private client: GoogleGenAI;
  private model: string;

  constructor(config: AIProviderConfig, model: string = 'gemini-2.0-flash') {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = model;
  }

  async extract(req: AIExtractionRequest): Promise<AIExtractionResponse> {
    return retryWithBackoff(async () => {
      const systemPrompt = `You are a data extraction expert. Extract structured data from the provided job information.
Return a valid JSON object with the following fields: company_name, product_name, process_type, material_type, volume_band, location.
Ensure all values are strings. Be concise and accurate.`;

      const userPrompt = `Job Instructions: ${req.instructions || 'Extract job details'}

Job Data:
${JSON.stringify(req.jobData, null, 2)}

Extract and return only valid JSON.`;

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: systemPrompt + '\n\n' + userPrompt,
        config: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 1000,
        },
      });

      const text = response.text || '';
      const extracted = JSON.parse(text);

      return {
        extracted,
        confidence: 0.85,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        },
        model: this.model,
      };
    });
  }

  async summarize(req: AISummarizationRequest): Promise<AISummarizationResponse> {
    return retryWithBackoff(async () => {
      const maxLengthHint = req.maxLength ? ` Limit to ${req.maxLength} characters.` : '';

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: `You are a concise summarization expert. Create clear, factual summaries preserving key details.${maxLengthHint}\n\nSummarize:\n\n${req.content}`,
        config: {
          temperature: req.temperature ?? 0.5,
          maxOutputTokens: req.maxLength ? Math.min(req.maxLength / 4, 500) : 300,
        },
      });

      const summary = response.text || '';

      return {
        summary,
        confidence: 0.8,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        },
        model: this.model,
      };
    });
  }

  async explain(req: AIExplanationRequest): Promise<AIExplanationResponse> {
    return retryWithBackoff(async () => {
      const systemPrompt = `You are an expert analyst. Provide clear, detailed explanations with key points highlighted.
Focus on actionable insights and evidence-based reasoning.`;

      const prompt = `${req.instructions || 'Explain this scenario:'}

Scenario: ${req.scenario}

Context: ${JSON.stringify(req.context, null, 2)}

Provide explanation and identify 3-5 key points.`;

      const response = await this.client.models.generateContent({
        model: this.model,
        contents: systemPrompt + '\n\n' + prompt,
        config: {
          temperature: req.temperature ?? 0.6,
          maxOutputTokens: 1500,
        },
      });

      const explanation = response.text || '';
      const keyPoints = this.extractKeyPoints(explanation);

      return {
        explanation,
        keyPoints,
        confidence: 0.82,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        },
        model: this.model,
      };
    });
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.client.models.generateContent({
        model: this.model,
        contents: 'test',
        config: { maxOutputTokens: 10 },
      });
      return true;
    } catch {
      return false;
    }
  }

  private extractKeyPoints(text: string): string[] {
    const lines = text.split('\n');
    const keyPoints: string[] = [];

    for (const line of lines) {
      if (line.match(/^[•\-*]\s+/) || line.match(/^\d+\.\s+/)) {
        const point = line.replace(/^[•\-*\d.]\s+/, '').trim();
        if (point && point.length > 0) {
          keyPoints.push(point);
          if (keyPoints.length >= 5) break;
        }
      }
    }

    return keyPoints.length > 0 ? keyPoints : [text.substring(0, 200) + '...'];
  }
}

export function createAIProviderAdapter(config: AIProviderConfig, model?: string): AIProviderAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config, model);
    case 'anthropic':
      return new AnthropicAdapter(config, model);
    case 'google':
      return new GoogleAdapter(config, model);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}
