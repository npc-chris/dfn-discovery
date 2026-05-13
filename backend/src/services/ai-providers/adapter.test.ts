import assert from 'assert';
import { createAIProviderAdapter } from './adapter.ts';
import type {
  AIExtractionResponse,
  AIExplanationResponse,
  AISummarizationResponse,
  AIProviderAdapter,
} from './types.ts';

const originalSetTimeout = globalThis.setTimeout;

function useImmediateTimeout() {
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
    if (typeof handler === 'function') {
      handler(...args);
    } else {
      eval(handler);
    }
    return 0 as any;
  }) as typeof setTimeout;
}

function restoreTimeout() {
  globalThis.setTimeout = originalSetTimeout;
}

function makeOpenAIAdapter() {
  const adapter = createAIProviderAdapter({ provider: 'openai', apiKey: 'test-key' }, 'gpt-4o') as AIProviderAdapter & {
    client: any;
  };

  let extractCalls = 0;
  adapter.client = {
    chat: {
      completions: {
        create: async (params: { messages: Array<{ role: string; content: string }> }) => {
          const combinedPrompt = params.messages.map((message) => message.content).join('\n');

          if (combinedPrompt.includes('Extract') && extractCalls === 0) {
            extractCalls += 1;
            const error = new Error('rate_limit');
            (error as any).status = 429;
            throw error;
          }

          if (combinedPrompt.includes('Extract')) {
            extractCalls += 1;
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ company_name: 'ACME', product_name: 'Widget' }),
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 12, completion_tokens: 6 },
            };
          }

          if (combinedPrompt.includes('Summarize')) {
            return {
              choices: [
                {
                  message: { content: 'Short summary' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 6, completion_tokens: 2 },
            };
          }

          return {
            choices: [
              {
                message: { content: '- first point\n- second point' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 8, completion_tokens: 5 },
          };
        },
      },
    },
    models: {
      list: async () => ({ data: [] }),
    },
  };

  return adapter;
}

function makeAnthropicAdapter() {
  const adapter = createAIProviderAdapter({ provider: 'anthropic', apiKey: 'test-key' }, 'claude-3-5-sonnet-20241022') as AIProviderAdapter & {
    client: any;
  };

  adapter.client = {
    messages: {
      create: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        const prompt = messages[0]?.content ?? '';

        if (prompt.includes('Extract')) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ company_name: 'ACME', product_name: 'Widget' }) }],
            usage: { input_tokens: 11, output_tokens: 4 },
            stop_reason: 'end_turn',
          };
        }

        if (prompt.includes('Summarize')) {
          return {
            content: [{ type: 'text', text: 'Short summary' }],
            usage: { input_tokens: 6, output_tokens: 3 },
            stop_reason: 'end_turn',
          };
        }

        return {
          content: [{ type: 'text', text: '- first point\n- second point' }],
          usage: { input_tokens: 8, output_tokens: 5 },
          stop_reason: 'end_turn',
        };
      },
    },
  };

  return adapter;
}

function makeGoogleAdapter() {
  const adapter = createAIProviderAdapter({ provider: 'google', apiKey: 'test-key' }, 'gemini-2.0-flash') as AIProviderAdapter & {
    client: any;
  };

  adapter.client = {
    models: {
      generateContent: async ({ contents }: { contents: string }) => {
        if (contents.includes('Extract')) {
          return {
            text: JSON.stringify({ company_name: 'ACME', product_name: 'Widget' }),
            usageMetadata: { promptTokenCount: 13, candidatesTokenCount: 7 },
          };
        }

        if (contents.includes('Summarize')) {
          return {
            text: 'Short summary',
            usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2 },
          };
        }

        return {
          text: '- first point\n- second point',
          usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 5 },
        };
      },
    },
  };

  return adapter;
}

async function assertAdapterBehaviors(adapter: AIProviderAdapter, provider: string) {
  const extraction = (await adapter.extract({ jobId: 'j1', jobData: { foo: 'bar' }, instructions: 'Extract job details' })) as AIExtractionResponse;
  assert.strictEqual(extraction.extracted.company_name, 'ACME', `${provider} extract`);
  assert.ok(extraction.usage.inputTokens > 0, `${provider} extract usage`);

  const summary = (await adapter.summarize({ content: 'Lots of content', maxLength: 80 })) as AISummarizationResponse;
  assert.strictEqual(summary.summary, 'Short summary', `${provider} summarize`);
  assert.ok(summary.usage.outputTokens >= 0, `${provider} summarize usage`);

  const explanation = (await adapter.explain({ scenario: 'why', context: { a: 1 } })) as AIExplanationResponse;
  assert.ok(explanation.keyPoints.length >= 1, `${provider} explain`);
  assert.ok(explanation.confidence > 0, `${provider} confidence`);

  const valid = await adapter.validateApiKey();
  assert.strictEqual(valid, true, `${provider} validate`);
}

async function run() {
  useImmediateTimeout();

  const openai = makeOpenAIAdapter();
  await assertAdapterBehaviors(openai, 'openai');

  const anthropic = makeAnthropicAdapter();
  await assertAdapterBehaviors(anthropic, 'anthropic');

  const google = makeGoogleAdapter();
  await assertAdapterBehaviors(google, 'google');

  restoreTimeout();
  console.log('AI provider adapter unit tests passed');
}

run().catch((error) => {
  restoreTimeout();
  console.error(error);
  process.exit(1);
});
