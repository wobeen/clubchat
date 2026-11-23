// Development/evaluation adapter. Gemini's free tier may use content to improve Google products, so production
// config refuses AI_PROVIDER=gemini and real user conversations must not be sent here.
// Request/response format verified against:
//   https://ai.google.dev/gemini-api/docs/structured-output (redirects to https://aistudio.google.com/docs/structured-output;
//     JSON-schema structured output, keywords supported/stripped)
//   https://ai.google.dev/api/generate-content (redirects to https://aistudio.google.com/api-reference/generate-content;
//     models/{model}:generateContent, Schema type enum + `nullable`, x-goog-api-key)
import { MAX_OUTPUT_TOKENS, usageOf } from './cost.js';
import { normalizeCandidates } from './normalize.js';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, buildUserContent } from './prompt.js';
import {
  ExtractorError,
  type ExtractInput,
  type ExtractResult,
  type Extractor,
  type Prices,
  type Usage,
} from './types.js';

export interface GeminiExtractorOptions {
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  prices: Prices;
  timeoutMs?: number;
  baseUrl?: string;
}

/** JSON Schema (as in prompt.ts) -> Gemini `responseSchema` (uppercase types, `nullable` instead of type arrays). */
export function toGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type') {
      const types = (Array.isArray(value) ? value : [value]) as string[];
      const real = types.find((type) => type !== 'null') ?? 'null';
      out.type = real.toUpperCase();
      if (types.includes('null') && real !== 'null') out.nullable = true;
    } else if (key === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, toGeminiSchema(child)]),
      );
    } else if (key === 'items') out.items = toGeminiSchema(value);
    else out[key] = value;
  }
  return out;
}

export function createGeminiExtractor({
  apiKey,
  model,
  fetch: fetchImpl = globalThis.fetch,
  prices,
  timeoutMs = 20_000,
  baseUrl = 'https://generativelanguage.googleapis.com',
}: GeminiExtractorOptions): Extractor {
  return {
    async extract(input: ExtractInput): Promise<ExtractResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let usage: Usage | undefined;
      try {
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: 'user', parts: [{ text: buildUserContent(input) }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: toGeminiSchema(OUTPUT_SCHEMA),
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0,
                // Gemini 3 models think by default; thought tokens count against maxOutputTokens and add tens of
                // seconds per call. Extraction needs little reasoning, so keep it short.
                thinkingConfig: { thinkingLevel: 'low' },
              },
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
        const meta = data?.usageMetadata;
        const inTokens = meta?.promptTokenCount;
        const outTokens = Number(meta?.candidatesTokenCount ?? 0) + Number(meta?.thoughtsTokenCount ?? 0);
        if (Number.isFinite(inTokens) && Number.isFinite(outTokens)) usage = usageOf(inTokens, outTokens, prices);
        if (!usage) throw new ExtractorError('missing usage');
        const candidate = data?.candidates?.[0];
        const text = Array.isArray(candidate?.content?.parts)
          ? candidate.content.parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('')
          : '';
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new ExtractorError('output did not match schema', usage);
        }
        if (candidate?.finishReason !== 'STOP' || !parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new ExtractorError('output did not match schema', usage);
        const messages = new Map([...input.context, ...input.messages].map((m) => [m.id, m.createdAt]));
        const candidates = normalizeCandidates(parsed, {
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
