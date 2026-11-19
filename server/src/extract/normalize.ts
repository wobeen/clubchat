import type { Candidates, EventCandidate, TaskCandidate } from './types.js';

const DAY = 86_400_000;
const MAX_TEXT = 500;
const MAX_ITEMS = 50;
const OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export interface NormalizeContext {
  /** Messages the model was allowed to cite: id -> createdAt (ISO). */
  messages: Map<string, string>;
  memberIds: Set<string>;
}

const asString = (value: unknown, max = MAX_TEXT): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []);

function evidence(raw: any, context: NormalizeContext): string[] {
  return [...new Set(list(raw?.evidenceIds).filter((id): id is string => typeof id === 'string'))].filter((id) =>
    context.messages.has(id),
  );
}

function ids(value: unknown[], allowed: Set<string>): string[] {
  return [...new Set(value.filter((id): id is string => typeof id === 'string'))].filter((id) => allowed.has(id));
}

/** Parses a model date. Returns an ISO string, or null when unparsable or outside [first evidence −1d, last evidence +400d]. */
export function normalizeDate(value: unknown, evidenceTimes: number[]): string | null {
  if (typeof value !== 'string' || !value.trim() || !evidenceTimes.length) return null;
  let text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00+09:00';
  else if (!OFFSET.test(text)) text += '+09:00'; // the model is told to use KST; assume it when the offset is missing
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return null;
  if (time < Math.min(...evidenceTimes) - DAY || time > Math.max(...evidenceTimes) + 400 * DAY) return null;
  return new Date(time).toISOString();
}

export function normalizeCandidates(raw: unknown, context: NormalizeContext): Candidates {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const result: Candidates = { decisions: [], tasks: [], unresolved: [], events: [] };
  const times = (evidenceIds: string[]) => evidenceIds.map((id) => Date.parse(context.messages.get(id)!));

  for (const item of list(source.decisions) as any[]) {
    const text = asString(item?.text);
    const evidenceIds = evidence(item, context);
    if (text && evidenceIds.length) result.decisions.push({ text, evidenceIds, source: 'ai' });
  }
  for (const item of list(source.unresolved) as any[]) {
    const text = asString(item?.text);
    const evidenceIds = evidence(item, context);
    if (text && evidenceIds.length) result.unresolved.push({ text, evidenceIds, source: 'ai' });
  }
  for (const item of list(source.tasks) as any[]) {
    const text = asString(item?.text);
    const evidenceIds = evidence(item, context);
    if (!text || !evidenceIds.length) continue;
    const owners = ids([...list(item?.ownerIds), item?.ownerId], context.memberIds);
    const dueAt = normalizeDate(item?.dueAt, times(evidenceIds));
    const dateText = asString(item?.dateText, 100);
    for (const ownerId of owners.length ? owners : [null])
      result.tasks.push({
        text,
        ownerId,
        dueAt,
        dateText,
        evidenceIds: [...evidenceIds],
        source: 'ai',
      } as TaskCandidate);
  }
  for (const item of list(source.events) as any[]) {
    const text = asString(item?.text);
    const evidenceIds = evidence(item, context);
    if (!text || !evidenceIds.length) continue;
    const at = normalizeDate(item?.at, times(evidenceIds));
    result.events.push({
      text,
      at,
      hasTime: Boolean(at && item?.hasTime === true),
      dateText: asString(item?.dateText, 100),
      location: asString(item?.location, 200),
      participantIds: ids(list(item?.participantIds), context.memberIds),
      kind: item?.kind === 'next' ? 'next' : 'event',
      evidenceIds,
      source: 'ai',
    } satisfies EventCandidate);
  }
  return result;
}
