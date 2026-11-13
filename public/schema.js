export const STATE_VERSION = 3;
export class DataError extends Error {
  constructor(message, code = 'invalid-data') { super(message); this.code = code; }
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.every(x => typeof x === 'string');
const integer = value => Number.isInteger(value) && value >= 0;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const stringSet = value => strings(value) && new Set(value).size === value.length;
function require(value, message) { if (!value) throw new DataError(message); }
function unique(items, name) {
  require(items.every(x => object(x) && typeof x.id === 'string' && x.id.length), `${name}: ID가 필요해요.`);
  require(new Set(items.map(x => x.id)).size === items.length, `${name}: 중복 ID가 있어요.`);
}
export function migrateState(input) {
  require(object(input), '저장 데이터 형식이 올바르지 않아요.');
  if (input.version > STATE_VERSION) throw new DataError('더 최신 버전의 데이터예요. 원본을 보존했어요.', 'future-version');
  require([2, STATE_VERSION].includes(input.version), '지원하지 않는 데이터 버전이에요.');
  const state = structuredClone(input);
  require(typeof state.organization === 'string', '조직 이름이 손상됐어요.');
  for (const name of ['members', 'meetings', 'calendar', 'notifications']) require(Array.isArray(state[name]), `${name} 목록이 없어요.`);
  unique(state.members, '멤버'); unique(state.meetings, '캡슐');
  const members = new Set(state.members.map(x => x.id));
  require(members.has(state.profileId), '현재 참여자를 찾을 수 없어요.');
  for (const m of state.members) require(typeof m.name === 'string' && strings(m.teams), '멤버 정보가 손상됐어요.');
  const meetings = new Map(state.meetings.map(x => [x.id, x]));
  for (const m of state.meetings) {
    require(typeof m.title === 'string' && ['open', 'review', 'confirmed', 'scheduled', 'cancelled', 'deferred'].includes(m.status), '캡슐 상태가 올바르지 않아요.');
    require(date(m.createdAt), '캡슐 생성 시각이 손상됐어요.');
    require(stringSet(m.memberIds) && m.memberIds.length > 0 && m.memberIds.every(id => members.has(id)), '캡슐 참여자 정보가 손상됐어요.');
    for (const name of ['messages','sourceMessages','conclusions','carryover','confirmations']) require(Array.isArray(m[name]), `${m.title}: ${name} 목록이 없어요.`);
    require(Number.isInteger(m.revision) && m.revision >= 0, '캡슐 버전이 올바르지 않아요.');
    for (const name of ['messages','sourceMessages']) {
      unique(m[name], '메시지');
      require(m[name].every(x => typeof x.text === 'string' && members.has(x.authorId) && Number.isFinite(Date.parse(x.createdAt))), '메시지 내용이 손상됐어요.');
    }
    const targets = m.confirmationMemberIds ?? m.memberIds;
    require(stringSet(targets) && targets.length > 0 && targets.every(id => m.memberIds.includes(id)), '확인 대상 정보가 손상됐어요.');
    require(stringSet(m.confirmations) && m.confirmations.every(x => targets.includes(x)), '확인 정보가 손상됐어요.');
    if (m.facilitatorId != null) require(m.memberIds.includes(m.facilitatorId), '진행자 정보가 손상됐어요.');
    for (const key of ['memberSetVersion','conclusionVersion']) if (m[key] != null) require(integer(m[key]), '확인 버전 정보가 손상됐어요.');
    if (m.departedMemberIds != null) require(stringSet(m.departedMemberIds) && m.departedMemberIds.every(id => m.memberIds.includes(id) && !targets.includes(id)), '탈퇴 참여자 정보가 손상됐어요.');
    for (const key of ['parentId','previousId','correctionOf','deferredFrom']) if (m[key]) require(meetings.has(m[key]) && m[key] !== m.id, '연결된 캡슐을 찾을 수 없어요.');
    if (m.status === 'scheduled') require(Number.isFinite(Date.parse(m.startsAt)), '예약 날짜가 올바르지 않아요.');
    if (m.status === 'review' || m.status === 'confirmed') require(object(m.draft), '초안 데이터가 없어요.');
    if (m.status === 'confirmed') require(date(m.confirmedAt) && targets.every(id => m.confirmations.includes(id)), '확정 시각이나 공동 확인 기록이 손상됐어요.');
    const sourceIds = new Set([...m.messages, ...m.sourceMessages].map(x => x.id));
    function validateDraft(draft) {
      require(object(draft), '초안 형식이 올바르지 않아요.');
      const allIds = [];
      for (const type of ['decisions','tasks','unresolved','events']) {
        require(Array.isArray(draft[type]), '초안 항목 목록이 없어요.'); unique(draft[type], '초안 항목');
        for (const item of draft[type]) {
          allIds.push(item.id);
          require(typeof item.text === 'string' && strings(item.evidenceIds), '초안 내용이 손상됐어요.');
          require(item.evidenceIds.every(id => sourceIds.has(id)), '초안의 근거 메시지를 찾을 수 없어요.');
          if (type === 'tasks') {
            require(item.ownerId == null || item.ownerId === '' || m.memberIds.includes(item.ownerId), '할 일 담당자가 손상됐어요.');
            require(item.dueAt == null || date(item.dueAt), '할 일 마감 정보가 손상됐어요.');
          }
          if (type === 'events') {
            require(stringSet(item.participantIds) && item.participantIds.every(id => m.memberIds.includes(id)), '일정 참여자 목록이 손상됐어요.');
            require(item.at == null || date(item.at), '일정 날짜가 손상됐어요.');
            require(['event','next'].includes(item.kind) && typeof item.hasTime === 'boolean', '일정 종류나 시각 정보가 손상됐어요.');
          }
        }
      }
      require(new Set(allIds).size === allIds.length, '초안 항목 ID가 중복돼요.');
    }
    if (m.draft != null) validateDraft(m.draft);
    if (m.status === 'confirmed') {
      require(m.draft.tasks.every(x => m.memberIds.includes(x.ownerId) && date(x.dueAt)), '확정된 할 일 정보가 불완전해요.');
      require(m.draft.events.every(x => date(x.at) && x.hasTime && x.participantIds.length > 0), '확정된 일정 정보가 불완전해요.');
    }
    const validAgenda = x => object(x) && typeof x.text === 'string' && (!x.from || meetings.has(x.from)) && (x.status == null || ['open','resolved','deferred'].includes(x.status));
    require(m.carryover.every(validAgenda), '승계 안건이 손상됐어요.');
    for (const c of m.conclusions) {
      require(object(c) && meetings.has(c.meetingId) && typeof c.title === 'string' && stringSet(c.memberIds) && c.memberIds.every(id => members.has(id)) && strings(c.decisions) && Array.isArray(c.tasks) && strings(c.unresolved), '합류 결론이 손상됐어요.');
      require(c.tasks.every(x => object(x) && typeof x.text === 'string' && members.has(x.ownerId) && date(x.dueAt)), '합류한 할 일이 손상됐어요.');
      if (c.unresolvedItems != null) require(Array.isArray(c.unresolvedItems) && c.unresolvedItems.every(validAgenda), '합류한 미결 안건이 손상됐어요.');
      if (c.events != null) require(Array.isArray(c.events) && c.events.every(x => object(x) && typeof x.text === 'string' && date(x.at) && stringSet(x.participantIds) && x.participantIds.every(id => members.has(id))), '합류한 일정이 손상됐어요.');
    }
    if (m.draftMessageIds != null) require(stringSet(m.draftMessageIds) && m.draftMessageIds.every(id => m.messages.some(x => x.id === id)), '초안 기준 메시지가 손상됐어요.');
    if (m.draftHistory != null) {
      require(Array.isArray(m.draftHistory), '초안 이력이 손상됐어요.');
      for (const history of m.draftHistory) {
        require(object(history) && integer(history.revision) && history.revision < m.revision && stringSet(history.draftMessageIds) && history.draftMessageIds.every(id => m.messages.some(x => x.id === id)), '초안 이력 버전이 손상됐어요.');
        validateDraft(history.draft);
      }
    }
    if (m.confirmationRecords != null) {
      require(Array.isArray(m.confirmationRecords), '확인 이력이 손상됐어요.');
      require(m.confirmationRecords.every(r => object(r) && targets.includes(r.memberId) && r.revision === m.revision && r.memberSetVersion === (m.memberSetVersion || 0) && r.conclusionVersion === (m.conclusionVersion || 0) && date(r.at)), '확인 이력 버전이 손상됐어요.');
      const ids = m.confirmationRecords.map(r => r.memberId);
      require(new Set(ids).size === ids.length && ids.length === m.confirmations.length && ids.every(id => m.confirmations.includes(id)), '확인 이력이 일치하지 않아요.');
    } else if (input.version === 2) {
      m.confirmationRecords = m.confirmations.map(memberId => ({memberId,revision:m.revision,memberSetVersion:m.memberSetVersion || 0,conclusionVersion:m.conclusionVersion || 0,at:m.confirmedAt || m.createdAt}));
    } else {
      require(m.confirmations.length === 0, '확인 대상 버전 기록이 없어요.');
    }
    if (m.agendaStatuses != null) {
      require(object(m.agendaStatuses), '미결 처리 기록이 손상됐어요.');
      require(Object.values(m.agendaStatuses).every(x => object(x) && ['open','resolved','deferred'].includes(x.status) && typeof x.reason === 'string' && (x.targetEventIds == null || stringSet(x.targetEventIds))), '미결 처리 기록이 손상됐어요.');
    }
    if (m.policyHistory != null) require(Array.isArray(m.policyHistory) && m.policyHistory.every(x => object(x) && typeof x.kind === 'string' && typeof x.reason === 'string' && members.has(x.actorId) && date(x.at)), '정책 변경 이력이 손상됐어요.');
    if (m.delegationDisposition != null) require(object(m.delegationDisposition) && ['deferred','cancelled'].includes(m.delegationDisposition.status) && typeof m.delegationDisposition.reason === 'string' && (!m.delegationDisposition.followUpId || meetings.has(m.delegationDisposition.followUpId)), '위임 처리 기록이 손상됐어요.');
  }
  for (const relation of ['parentId','previousId','correctionOf']) for (const m of state.meetings) {
    const seen = new Set(); let current = m;
    while (current) { require(!seen.has(current.id), '캡슐 연결이 순환해요.'); seen.add(current.id); current = meetings.get(current[relation]); }
  }
  unique(state.calendar, '일정');
  require(state.calendar.every(e => object(e) && typeof e.text === 'string' && date(e.at) && meetings.has(e.meetingId) && stringSet(e.participantIds) && e.participantIds.every(id => members.has(id))), '일정 데이터가 손상됐어요.');
  require(state.notifications.every(n => object(n) && typeof n.text === 'string'), '알림 데이터가 손상됐어요.');
  if (state.reads != null) require(object(state.reads) && Object.values(state.reads).every(integer), '읽음 정보가 손상됐어요.');
  state.version = STATE_VERSION;
  return state;
}
export function parseState(raw) {
  try { return migrateState(typeof raw === 'string' ? JSON.parse(raw) : raw); }
  catch (error) { if (error instanceof DataError) throw error; throw new DataError('저장 데이터를 읽을 수 없어요. 원본을 보존했어요.'); }
}
