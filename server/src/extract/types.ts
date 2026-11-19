export interface ExtractMessage {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
}
export interface ExtractInput {
  messages: ExtractMessage[]; // 대상
  context: ExtractMessage[]; // 위임 원문 등, 근거로도 사용 가능
  existingTexts: string[]; // 기존 초안 항목(중복 방지)
  members: { id: string; name: string }[]; // 이름은 마스킹에만 쓰고 모델에 보내지 않는다
  referenceTime: string;
  timeZone: string; // 'Asia/Seoul'
}
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
export interface DecisionCandidate {
  text: string;
  evidenceIds: string[];
  source: 'ai';
}
export interface TaskCandidate {
  text: string;
  ownerId: string | null;
  dueAt: string | null;
  dateText: string;
  evidenceIds: string[];
  source: 'ai';
}
export interface UnresolvedCandidate {
  text: string;
  evidenceIds: string[];
  source: 'ai';
}
export interface EventCandidate {
  text: string;
  at: string | null;
  hasTime: boolean;
  dateText: string;
  location: string;
  participantIds: string[];
  kind: 'event' | 'next';
  evidenceIds: string[];
  source: 'ai';
}
export interface Candidates {
  decisions: DecisionCandidate[];
  tasks: TaskCandidate[];
  unresolved: UnresolvedCandidate[];
  events: EventCandidate[];
}
export interface ExtractResult {
  candidates: Candidates;
  usage: Usage;
  model: string;
}
export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractResult>;
}
export interface Prices {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Provider failure. `usage` is set when the provider reported billable tokens. Never carries message text. */
export class ExtractorError extends Error {
  readonly code = 'ai_unavailable';
  constructor(
    message: string,
    public usage?: Usage,
  ) {
    super(message);
  }
}
