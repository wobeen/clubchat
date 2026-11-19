// Messages API, called with fetch (no SDK). Verified against:
//   https://platform.claude.com/docs/en/api/messages (POST /v1/messages, headers, body, response)
//   https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools (tools[], tool_choice {type:'tool'}, tool_use block;
//     forced tool use is rejected (400) by Opus 5.5 / Sonnet 5.5 / Fable 5.x, accepted by claude-haiku-5-5)
//   https://platform.claude.com/docs/en/models/overview (model ids)
import { MAX_OUTPUT_TOKENS, usageOf } from './cost.js';
import { normalizeCandidates } from './normalize.js';
import { SYSTEM_PROMPT, TOOL, TOOL_NAME, buildUserContent } from './prompt.js';
import {
  ExtractorError,
  type ExtractInput,
  type ExtractResult,
  type Extractor,
  type Prices,
  type Usage,
} from './types.js';

export interface AnthropicExtractorOptions {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  prices: Prices;
  timeoutMs?: number;
  baseUrl?: string;
}

export function createAnthropicExtractor({
  apiKey,
  model,
  fetch: fetchImpl = globalThis.fetch,
  prices,
  timeoutMs = 20_000,
  baseUrl = 'https://api.anthropic.com',
}: AnthropicExtractorOptions): Extractor {
  return {
    async extract(input: ExtractInput): Promise<ExtractResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let usage: Usage | undefined;
      try {
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: SYSTEM_PROMPT,
              tools: [TOOL],
              tool_choice: { type: 'tool', name: TOOL_NAME },
              messages: [{ role: 'user', content: buildUserContent(input) }],
            }),
            signal: controller.signal,
          });
        } catch {
          throw new ExtractorError(controller.signal.aborted ? 'timeout' : 'network error');
        }
        if (!response.ok) throw new ExtractorError(`provider status ${response.status}`);
        let data: any;
        try {
          data = await response.json();
        } catch {
          throw new ExtractorError(controller.signal.aborted ? 'timeout' : 'invalid provider response');
        }
        const inTokens = data?.usage?.input_tokens;
        const outTokens = data?.usage?.output_tokens;
        if (Number.isFinite(inTokens) && Number.isFinite(outTokens)) usage = usageOf(inTokens, outTokens, prices);
        if (!usage) throw new ExtractorError('missing usage');
        const block = Array.isArray(data.content)
          ? data.content.find((item: any) => item?.type === 'tool_use' && item?.name === TOOL_NAME)
          : undefined;
        if (data.stop_reason === 'max_tokens' || !block || !block.input || typeof block.input !== 'object')
          throw new ExtractorError('output did not match schema', usage);
        const messages = new Map([...input.context, ...input.messages].map((m) => [m.id, m.createdAt]));
        const candidates = normalizeCandidates(block.input, {
          messages,
          memberIds: new Set(input.members.map((member) => member.id)),
        });
        return { candidates, usage, model };
      } catch (error) {
        if (error instanceof ExtractorError) {
          if (!error.usage && usage) error.usage = usage;
          throw error;
        }
        throw new ExtractorError('extraction failed', usage);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
