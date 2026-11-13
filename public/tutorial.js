const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EVENTS = ['created','message','draft','edited','confirmed','next'];
export const TUTORIAL_VERSION = 1;
export function createTutorial() { return {version:TUTORIAL_VERSION, completed:[], meetingId:null, skipped:false}; }
function normalize(progress) {
  if (!progress || progress.version !== TUTORIAL_VERSION || !Array.isArray(progress.completed)) return createTutorial();
  // Only a consecutive prefix is valid; malformed/old progress cannot skip learning.
  const completed=[];
  for(const event of EVENTS){if(!progress.completed.includes(event))break;completed.push(event);}
  return {...createTutorial(),...progress,completed};
}
export function advanceTutorial(progress, event, {meetingId} = {}) {
  const next = normalize(progress);
  if (event === 'reset') return createTutorial();
  if (event === 'skip' || event === 'resume') { next.skipped = event === 'skip'; return next; }
  if (!EVENTS.includes(event)) return next;
  if (!meetingId) return next;
  if (event === 'created' && !next.meetingId) next.meetingId = meetingId;
  if (next.meetingId && meetingId && meetingId !== next.meetingId && event !== 'next') return next;
  const expected = EVENTS.find(item => !next.completed.includes(item));
  if (event === expected) next.completed.push(event);
  return next;
}
export function getTutorialStep(progress, state) {
  const p = normalize(progress);
  const meeting = state.meetings.find(m=>m.id===p.meetingId);
  const id = EVENTS.find(event=>!p.completed.includes(event)) || 'done';
  const steps = {
    created:['첫 캡슐을 만들어보세요','캡슐은 함께 결정을 만들고 다음 일로 잇는 회의 단위예요. 연습 동료와 작은 주제를 정해보세요.','create','연습 캡슐 만들기'],
    message:['결정할 내용을 남겨보세요','예: 결정: 다음 모임은 책 한 권을 함께 읽기. 이어서 “다음 회의: 독서 모임 | 내일 19:00 | 온라인 | 전원”을 보내면 다음 캡슐까지 이어볼 수 있어요.','view','대화 열기'],
    draft:['대화에서 결론을 모아요','결론 초안을 만들면 메시지가 근거로 연결돼요. 연습에서는 “결정:”처럼 표시한 내용을 모아요.','draft','결론 초안 만들기'],
    edited:['근거를 보고 한 항목 수정해보세요','결론의 근거를 열어 원문을 읽고, 수정 버튼으로 내용을 구체적으로 바꿔 저장하세요. 다음 회의 항목도 있어야 마지막 단계까지 이어져요.','view','결론 살펴보기'],
    confirmed:['함께 확인해 결론을 남겨요','내 확인을 남긴 뒤 연습 동료 확인을 실행하세요. 연습 동료의 자동 응답이며 실제 참여자의 확인은 대신하지 않아요.','view','내 확인 남기기'],
    next:['다음 캡슐로 이어보세요','확정 일정에서 다음 캡슐을 열고 지난 미결이 이어졌는지 확인해보세요.','tutorial-open-next','다음 캡슐 열기'],
    done:['첫 캡슐을 완료했어요','이제 도움말을 접고 다른 주제로 직접 해보세요. 하위 캡슐은 필요한 대화만 맡기고, 확인된 결론을 상위로 모으는 공간이에요.','tutorial-skip','도움말 접기']
  };
  const [title,description,action,label] = steps[id];
  return {id,index:EVENTS.indexOf(id),total:EVENTS.length,title,description,action,label,meeting};
}
export function practiceUrl(pathname = '/') { return `${pathname}?practice=1`; }
export function renderTutorial(progress, state, {practice = false} = {}) {
  if (!practice) return `<a class="practice-entry" href="${escape(practiceUrl())}">첫 캡슐, 3분 연습 <span>내 데이터와 분리된 연습 공간</span></a>`;
  const p = normalize(progress);
  if (p.skipped) return '<aside class="tutorial-banner compact"><strong>연습 공간</strong><button type="button" data-action="tutorial-resume">도움말 이어 보기</button><a href="/">내 캡슐로 돌아가기</a></aside>';
  const step = getTutorialStep(p,state);
  const attributes = `${p.meetingId?`data-id="${escape(p.meetingId)}"`:''} ${step.action==='view'?`data-view="${step.id==='message'?'chat':'minutes'}"`:''}`;
  return `<aside class="tutorial-banner" aria-label="첫 캡슐 체험"><div class="tutorial-heading"><span>연습 전용 · ${step.id==='done'?'완료':`${step.index+1}/${step.total}`}</span><button type="button" data-action="tutorial-skip">건너뛰기</button></div><strong>${escape(step.title)}</strong><p>${escape(step.description)}</p><div class="tutorial-actions"><button type="button" data-action="${step.action}" ${attributes}>${escape(step.label)}</button>${step.id==='confirmed'&&step.meeting?.confirmations.includes(state.profileId)?'<button type="button" data-action="tutorial-colleague">연습 동료 확인 실행</button>':''}<button type="button" data-action="tutorial-reset">처음부터 다시</button><a href="/">내 캡슐로 돌아가기</a></div></aside>`;
}
