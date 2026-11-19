import type { ExtractInput, Prices, Usage } from './types.js';

export const MAX_OUTPUT_TOKENS = 4096;
const PROMPT_OVERHEAD_TOKENS = 1500; // system prompt + tool schema

export const costUsd = (inputTokens: number, outputTokens: number, prices: Prices): number =>
  (inputTokens * prices.inputPerMTok + outputTokens * prices.outputPerMTok) / 1_000_000;

export const usageOf = (inputTokens: number, outputTokens: number, prices: Prices): Usage => ({
  inputTokens,
  outputTokens,
  costUsd: costUsd(inputTokens, outputTokens, prices),
});

/** Conservative pre-flight estimate: ~2 tokens per character of input plus the full output cap. */
export function estimateCostUsd(input: ExtractInput, prices: Prices, maxOutputTokens = MAX_OUTPUT_TOKENS): number {
  const chars =
    [...input.messages, ...input.context].reduce((sum, m) => sum + m.text.length + 80, 0) +
    input.existingTexts.reduce((sum, text) => sum + text.length + 10, 0) +
    input.members.length * 45;
  return costUsd(Math.ceil(chars * 2) + PROMPT_OVERHEAD_TOKENS, maxOutputTokens, prices);
}
