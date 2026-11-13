import {getConfirmationTargets, getPendingMessageCount} from './domain.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (action, label, attributes = '') => `<button type="button" data-action="${action}" ${attributes}>${escape(label)}</button>`;

export function getCapsuleAction(state, meeting, {errorCount = 0} = {}) {
  if (!meeting.memberIds.includes(state.profileId)) return {label:'담당 멤버만 원문을 볼 수 있어요', action:null};
  if (meeting.status === 'deferred') return {label:'이 위임은 보류되어 다음 캡슐로 이어졌어요', action:meeting.delegationDisposition?.followUpId?'open':null, button:'이어갈 캡슐 보기', id:meeting.delegationDisposition?.followUpId};
  if (meeting.status === 'cancelled') return {label:'사유를 남기고 취소한 캡슐이에요', action:null};
  if (meeting.status === 'scheduled') return {label:'예약된 다음 만남', action:'start-scheduled', button:'지금 시작'};
  if (meeting.status === 'confirmed') return {label:'함께 확인한 결론이 남았어요', action:'view', button:'확정 결과 보기', view:'result'};
  if (meeting.status === 'open') return {label:meeting.draft?'기존 초안을 보존하며 논의 중이에요':'대화에서 결정할 내용을 모아보세요', action:'draft', button:meeting.draft?'초안 다시 검토':'결론 초안 만들기'};
  const pending = getPendingMessageCount(meeting);
  if (pending) return {label:`새 대화 ${pending}개가 아직 초안에 반영되지 않았어요`, action:'draft', button:'새 대화 반영하기'};
  if (errorCount) return {label:`확인할 항목 ${errorCount}건이 있어요`, action:'view', button:'결론 보완하기', view:'minutes'};
  const targets = getConfirmationTargets(meeting);
  const needsMine = targets.includes(state.profileId) && !meeting.confirmations.includes(state.profileId);
  const pendingChildren = state.meetings.filter(m => m.parentId === meeting.id && !['confirmed','deferred','cancelled'].includes(m.status));
  if (needsMine) return {label:pendingChildren.length?`내 확인을 먼저 남길 수 있어요 · 하위 ${pendingChildren.length}개 대기`:'근거와 변경 내용을 확인해주세요', action:'view', button:'내 확인 남기기', view:'minutes'};
  if (pendingChildren.length) return {label:`하위 캡슐 ${pendingChildren.length}개의 결론을 기다려요`, action:'view', button:'결론과 대기 사유 보기', view:'minutes'};
  const remaining = targets.filter(id=>!meeting.confirmations.includes(id)).length;
  return {label:`${targets.includes(state.profileId)?'내 확인 완료':'나는 현재 확인 대상에서 제외됨'} · ${remaining}명 확인 대기`, action:'view', button:'검토본 보기', view:'minutes'};
}

export function renderCapsuleNavigation(state, meeting, options = {}) {
  const action = getCapsuleAction(state, meeting, options);
  const accessible = m => m.memberIds.includes(state.profileId);
  const related = (id, label) => {
    const m = state.meetings.find(item => item.id === id);
    return m && accessible(m) ? button('open', `${label} · ${m.title}`, `data-id="${escape(m.id)}"`) : '';
  };
  const children = state.meetings.filter(m => m.parentId === meeting.id);
  const childLabel = m => ({confirmed:'결론 합류',deferred:'보류·이관',cancelled:'취소',review:'공동 확인',scheduled:'예약'})[m.status] || '논의 중';
  const next = state.meetings.filter(m => m.previousId === meeting.id);
  const closed = ['deferred','cancelled'].includes(meeting.status);
  const stage = closed ? -1 : meeting.status === 'scheduled' ? 0 : meeting.status === 'open' ? 1 : meeting.status === 'review' ? 2 : 3;
  const stages = ['예약','논의','공동 확인','확정'];
  return `<div class="capsule-navigation"><nav class="capsule-relations" aria-label="캡슐 사이의 관계">${related(meeting.previousId,'이전')}${related(meeting.parentId,'상위')}<span class="current-capsule">현재 캡슐</span>${next.map(m=>related(m.id,'다음')).join('')}${children.length?`<details class="capsule-branches"><summary>위임 ${children.length}개 · 합류 ${children.filter(m=>m.status==='confirmed').length}개</summary><div>${children.map(m=>accessible(m)?button('open',`${m.title} · ${childLabel(m)}`,`data-id="${escape(m.id)}"`):`<span>담당 멤버의 하위 캡슐 · ${childLabel(m)}</span>`).join('')}</div></details>`:''}</nav><ol class="capsule-progress" aria-label="캡슐 진행 단계">${stages.map((label,i)=>`<li class="${i<stage?'done':i===stage?'current':''}" ${i===stage?'aria-current="step"':''}>${i<stage?'✓ ':''}${label}</li>`).join('')}</ol><div class="capsule-next-action"><p>${escape(action.label)}</p>${action.action?button(action.action,action.button,`${action.view?`data-view="${action.view}"`:''} ${action.id?`data-id="${escape(action.id)}"`:''}`):''}</div>${accessible(meeting)?`<nav class="capsule-view-switch" aria-label="현재 캡슐 내용">${[['chat','대화'],['minutes','결론'],['result','확정 일정']].map(([view,label])=>button('view',label,`data-view="${view}" aria-current="${(options.view||'chat')===view?'page':'false'}"`)).join('')}</nav>`:''}</div>`;
}
