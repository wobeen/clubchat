import type { AiConfig } from '../config.js';
import { createAnthropicExtractor } from './anthropic.js';
import { createGeminiExtractor } from './gemini.js';
import type { Extractor } from './types.js';

export function createProviderExtractor(ai: AiConfig, nodeEnv: string, fetch: typeof globalThis.fetch): Extractor {
  if (!ai.apiKey) throw new Error('AI API key is not set');
  const options = {
    apiKey: ai.apiKey,
    model: ai.model,
    fetch,
    prices: { inputPerMTok: ai.priceInputPerMTok, outputPerMTok: ai.priceOutputPerMTok },
    timeoutMs: ai.timeoutMs,
  };
  if (ai.provider === 'gemini') {
    if (nodeEnv === 'production') throw new Error('AI_PROVIDER=gemini is not allowed in production');
    return createGeminiExtractor(options);
  }
  return createAnthropicExtractor(options);
}
