import { maskText } from './mask.js';
import type { ExtractInput } from './types.js';

export const TOOL_NAME = 'submit_meeting_draft';

export const SYSTEM_PROMPT = `당신은 한국어 팀 대화에서 회의록 초안 항목을 뽑는 도우미입니다. 제안만 하며, 사람이 확인합니다.

규칙:
- 대화에 실제로 드러난 내용만 뽑습니다. 사담, 인사, 잡담, 농담은 무시합니다. 지어내지 않습니다.
- 항목 종류: decisions(결정), tasks(할 일), unresolved(미결·추가 논의 필요), events(일정, 다음 회의 포함).
- text는 회의록에 적을 짧은 명사구로 씁니다(예: "부스 위치는 B구역", "포스터 부착", "예산 초과분 처리 방안", "엠티 집합"). "~합니다", "~해야 합니다", "~하기로 결정했습니다" 같은 문장 어미를 붙이지 않습니다.
- 한 내용은 한 종류에만 넣습니다. 날짜·시각이 있는 모임·마감 일정은 events에만 넣고 같은 내용을 decisions에 또 넣지 않습니다.
- 누군가에게 부탁하거나 필요하다고 말한 일은, 맡겠다는 사람이 없어도 tasks에 넣고 담당자를 비웁니다. 질문형 제안("~할 수 있는 분?")도 같습니다. 해야 할지 말지가 아직 정해지지 않은 쟁점만 unresolved입니다.
- 취소된 모임·계획은 어떤 종류의 항목으로도 만들지 않습니다(취소했다는 결정도 만들지 않음). 끝내 정해지지 않은 결정도 decisions에 넣지 않습니다.
- 모든 항목은 근거 메시지 id를 evidenceIds에 넣습니다. 제공된 메시지 id만 씁니다. 결정·약속이 확정된 메시지를 맨 앞에 두고, 내용에 직접 기여한 메시지만 넣습니다(단순 반응·이모지·관련 없는 질문은 빼되, 담당자의 수락 답변은 넣습니다).
- 말이 번복되면 최종 상태만 항목으로 뽑고, 번복 이전 제안 메시지도 evidenceIds에 함께 넣습니다.
- 담당자는 본문의 @<id> 표기 또는 memberIds에 있는 멤버 id만 씁니다. 모르거나 모호하면 비웁니다. 담당자가 여럿이면 ownerIds에 모두 넣습니다.
- 날짜·시각은 기준 시각과 메시지 시각을 바탕으로 한국 표준시(KST) 오프셋을 붙인 ISO 8601(예: 2026-12-03T19:00:00+09:00)로 씁니다. 상대 표현("내일", "다음 주 목요일")은 그 말이 나온 메시지의 시각(KST)을 기준으로 풉니다. "다음 주 X요일"은 다음 주 월요일이 시작하는 주의 X요일입니다.
- 날짜가 모호하면(예: "조만간", "다음에", "축제 전날", 어느 주인지 불확실한 요일) null로 둡니다. "7시에 만나요"처럼 시각만 있고 날짜를 말하지 않았으면 오늘로 가정하지 말고 at=null, hasTime=false로 둡니다. 시각 없이 날짜만 확실하면 그 날짜의 00:00:00+09:00과 hasTime=false로 씁니다.
- dateText에는 대화에 나온 날짜 표현 원문을 그대로 적습니다. 없으면 빈 문자열.
- 일정 참여자를 따로 말하지 않으면 participantIds에 memberIds 전원을 넣습니다. 일부만 말했으면 그 사람들만 넣습니다.
- 개인정보는 [전화], [계좌], [이메일]로 가려져 있습니다. 그대로 두고 복원하려 하지 않습니다.
- 이미 초안에 있는 항목(existingTexts)과 같은 내용은 다시 뽑지 않습니다.
- 항목이 없으면 빈 배열을 냅니다. 반드시 ${TOOL_NAME} 도구로만 답합니다.`;

const itemBase = {
  text: { type: 'string', description: '회의록에 적을 짧은 명사구. 문장 어미 없이.' },
  evidenceIds: {
    type: 'array',
    items: { type: 'string' },
    description: '근거가 되는 메시지 id. 번복이 있으면 이전 근거도 포함.',
  },
};
const nullableDate = { type: ['string', 'null'], description: 'KST 오프셋을 붙인 ISO 8601. 모호하면 null.' };

export const TOOL = {
  name: TOOL_NAME,
  description:
    '대화에서 뽑은 회의록 초안 항목을 제출합니다. 결정, 할 일, 미결 사항, 일정을 각각 배열로 냅니다. 해당 항목이 없으면 빈 배열을 냅니다. 근거 메시지 id가 없는 항목은 버려집니다.',
  input_schema: {
    type: 'object',
    properties: {
      decisions: {
        type: 'array',
        items: { type: 'object', properties: { ...itemBase }, required: ['text', 'evidenceIds'] },
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ...itemBase,
            ownerIds: { type: 'array', items: { type: 'string' }, description: '담당 멤버 id. 모르면 빈 배열.' },
            dueAt: nullableDate,
            dateText: { type: 'string' },
          },
          required: ['text', 'ownerIds', 'dueAt', 'dateText', 'evidenceIds'],
        },
      },
      unresolved: {
        type: 'array',
        items: { type: 'object', properties: { ...itemBase }, required: ['text', 'evidenceIds'] },
      },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ...itemBase,
            at: nullableDate,
            hasTime: { type: 'boolean', description: '시각이 확실하면 true.' },
            dateText: { type: 'string' },
            location: { type: 'string' },
            participantIds: { type: 'array', items: { type: 'string' } },
            kind: { type: 'string', enum: ['event', 'next'], description: 'next는 다음 회의.' },
          },
          required: ['text', 'at', 'hasTime', 'dateText', 'location', 'participantIds', 'kind', 'evidenceIds'],
        },
      },
    },
    required: ['decisions', 'tasks', 'unresolved', 'events'],
  },
} as const;

/** Output schema shared by every provider (Anthropic tool input_schema, Gemini responseSchema source). */
export const OUTPUT_SCHEMA = TOOL.input_schema;

const kst = (iso: string): string => {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  return new Date(time + 9 * 3_600_000).toISOString().replace('Z', '+09:00');
};

/** User turn: masked messages as JSON. Member names are never included; ids only. */
export function buildUserContent(input: ExtractInput): string {
  const mask = (text: string) => maskText(text, input.members);
  const message = (m: ExtractInput['messages'][number]) => ({
    id: m.id,
    authorId: m.authorId,
    at: kst(m.createdAt),
    text: mask(m.text),
  });
  return JSON.stringify(
    {
      referenceTime: kst(input.referenceTime),
      timeZone: input.timeZone,
      memberIds: input.members.map((member) => member.id),
      context: input.context.map(message),
      messages: input.messages.map(message),
      existingTexts: input.existingTexts.map(mask),
    },
    null,
    1,
  );
}
