import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 seedState,createMeeting,sendMessage,extractDraft,confirmMeeting,delegate,
 parseDate,parseDateDetails,parseMemberFilter,updateDraftItem,removeDraftItem,
 restoreDraft,getPendingMessageCount,getAgendaItems,setAgendaStatus,
 getConfirmationTargets,setConfirmationMembers,markMemberDeparted,transferFacilitator,
 disposeChild,createCorrection,startScheduled,getConfirmedEvents,canRead
} from '../public/domain.js';

function setup(members=['minsu']){
 const state=seedState();state.meetings=[];state.calendar=[];
 const meeting=createMeeting(state,{title:'검증 캡슐',memberIds:members});
 return {state,meeting};
}
function messages(s,m,...texts){texts.forEach(text=>sendMessage(s,m,text));}
function confirmAll(s,m){for(const id of getConfirmationTargets(m)){s.profileId=id;confirmMeeting(s,m,{expectedRevision:m.revision});}}
function nextMessage(s,m,title){sendMessage(s,m,`다음 회의: ${title} | 2027년 1월 5일 오후 9:00 | 온라인 | 전원`);}
function unchanged(s,call,pattern){const before=structuredClone(s);assert.throws(call,pattern);assert.deepEqual(s,before);}

test('오전·오후 콜론, 공백, 정오·자정과 연도 경계를 일관되게 해석한다',()=>{
 const ref='2026-12-31T14:00:00Z';
 assert.equal(parseDate('내일 오후 9:00',ref),'2027-01-01T12:00:00.000Z');
 assert.equal(parseDate('내일 오전 12:00',ref),'2026-12-31T15:00:00.000Z');
 assert.equal(parseDate('내일 오후 12시',ref),'2027-01-01T03:00:00.000Z');
 assert.equal(parseDateDetails('내일 9 : 00',ref).hasTime,true);
 assert.equal(parseDateDetails('내일',ref).hasTime,false);
 assert.equal(parseDate('2027년 2월 29일 9시',ref),null);
 assert.equal(parseDate('2028년 2월 29일 9시',ref),'2028-02-29T00:00:00.000Z');
 assert.equal(parseDate('내일 오후 15:00',ref),null);
 const {state:s,meeting:m}=setup();messages(s,m,'일정: 점검 | 2027년 1월 5일 9 : 00 | 온라인 | 전원');extractDraft(s,m);assert.equal(m.draft.events[0].hasTime,true);assert.equal(confirmMeeting(s,m),true);
});

test('미지원 부정·혼합 조건을 조용히 긍정 필터로 바꾸지 않는다',()=>{
 const {members}=seedState();
 for(const phrase of ['홍보팀 제외 2학년','홍보팀 또는 기획국','기획국 2학년 외국인','2학년 3학년']){
  const result=parseMemberFilter(phrase,members);assert.equal(result.unrecognized,true,phrase);assert.deepEqual(result.members,[]);
 }
 assert.equal(parseMemberFilter('축제 준비팀 중 2학년',members).members.length,4);
});

test('검토 중 대화와 수동 편집을 보존하며 미반영 대화·구버전 확인을 막는다',()=>{
 const {state:s,meeting:m}=setup(['minsu','jieun']);messages(s,m,'결정: 첫 결론');extractDraft(s,m);
 const item=m.draft.decisions[0],rev=m.revision;confirmMeeting(s,m);
 assert.equal(updateDraftItem(s,m,'decisions',{...item}),false);assert.equal(m.revision,rev);assert.deepEqual(m.confirmations,['minsu']);
 updateDraftItem(s,m,'decisions',{...item,text:'직접 고친 결론'},{expectedRevision:rev});assert.deepEqual(m.confirmations,[]);
 messages(s,m,'결정: 두 번째 결론');assert.equal(getPendingMessageCount(m),1);
 unchanged(s,()=>confirmMeeting(s,m),/새 대화/);
 extractDraft(s,m);assert.equal(m.draft.decisions[0].text,'직접 고친 결론');assert.equal(m.draft.decisions.length,2);
 unchanged(s,()=>confirmMeeting(s,m,{expectedRevision:rev}),/최신 버전/);
 const snapshot=m.draftHistory.find(x=>x.revision===rev);assert.equal(snapshot.draft.decisions[0].text,'첫 결론');
 restoreDraft(s,m,rev);assert.equal(m.draft.decisions[0].text,'첫 결론');assert.equal(getPendingMessageCount(m),1);assert.deepEqual(m.confirmations,[]);
});

test('미결은 세대 간 ID를 유지하고 해결 후에는 다시 나타나지 않는다',()=>{
 const {state:s,meeting:a}=setup();messages(s,a,'미결: 예산');nextMessage(s,a,'B');extractDraft(s,a);confirmAll(s,a);
 const b=s.meetings.find(x=>x.previousId===a.id),id=b.carryover[0].id;startScheduled(s,b);nextMessage(s,b,'C');extractDraft(s,b);confirmAll(s,b);
 const c=s.meetings.find(x=>x.previousId===b.id);assert.equal(c.carryover[0].id,id);startScheduled(s,c);nextMessage(s,c,'D');extractDraft(s,c);
 setAgendaStatus(s,c,id,{status:'resolved',reason:'예산 승인 완료'});confirmAll(s,c);
 const d=s.meetings.find(x=>x.previousId===c.id);assert.deepEqual(d.carryover,[]);assert.deepEqual(getAgendaItems(d),[]);
});

test('합류된 하위 미결도 해결 이후 후속 회의에서 부활하지 않는다',()=>{
 const {state:s,meeting:p}=setup();messages(s,p,'결정: 위임');const child=delegate(s,p,{title:'하위',messageIds:[p.messages[0].id],memberIds:['minsu']});
 messages(s,child,'미결: 하위 예산');extractDraft(s,child);confirmAll(s,child);nextMessage(s,p,'후속');extractDraft(s,p);
 const agenda=getAgendaItems(p)[0];setAgendaStatus(s,p,agenda.id,{status:'resolved',reason:'상위에서 해결'});confirmAll(s,p);
 const next=s.meetings.find(x=>x.previousId===p.id);assert.deepEqual(next.carryover,[]);assert.deepEqual(getAgendaItems(next),[]);
});

test('하위 대기 중 확인은 기록하고 합류하면 새 버전으로 재확인한다',()=>{
 const {state:s,meeting:p}=setup(['minsu','jieun']);messages(s,p,'결정: 상위');const child=delegate(s,p,{title:'하위',messageIds:[p.messages[0].id],memberIds:['minsu']});extractDraft(s,p);
 assert.equal(confirmMeeting(s,p),false);s.profileId='jieun';assert.equal(confirmMeeting(s,p),false);assert.equal(p.status,'review');assert.equal(p.confirmations.length,2);
 s.profileId='minsu';messages(s,child,'결정: 하위 결과');extractDraft(s,child);confirmAll(s,child);
 assert.deepEqual(p.confirmations,[]);assert.equal(p.conclusions.length,1);assert.equal('messages' in p.conclusions[0],false);confirmAll(s,p);assert.equal(p.status,'confirmed');
});

test('확인 대상 변경·탈퇴는 사유와 진행자 권한을 요구하고 재확인한다',()=>{
 const {state:s,meeting:m}=setup(['minsu','jieun','seojun']);messages(s,m,'결정: 결론');extractDraft(s,m);confirmMeeting(s,m);
 s.profileId='jieun';unchanged(s,()=>setConfirmationMembers(s,m,['minsu'],'불참'),/진행자/);s.profileId='minsu';
 unchanged(s,()=>setConfirmationMembers(s,m,['minsu'],''),/사유/);
 setConfirmationMembers(s,m,['minsu','jieun'],'서준 불참');assert.deepEqual(m.confirmations,[]);assert.equal(m.policyHistory.at(-1).reason,'서준 불참');
 markMemberDeparted(s,m,'jieun','조직 탈퇴');assert.equal(canRead(m,'jieun'),false);
 unchanged(s,()=>setConfirmationMembers(s,m,['minsu','jieun'],'다시 추가'),/확인 대상/);
 confirmAll(s,m);assert.deepEqual(m.confirmedSnapshot.confirmationMemberIds,['minsu']);assert.deepEqual(m.confirmedSnapshot.memberIds,['minsu','jieun','seojun']);
});

test('진행자 이관 이후 이전 진행자를 탈퇴 처리할 수 있다',()=>{
 const {state:s,meeting:m}=setup(['minsu','jieun']);transferFacilitator(s,m,'jieun','역할 인계');s.profileId='jieun';markMemberDeparted(s,m,'minsu','탈퇴');assert.equal(m.facilitatorId,'jieun');assert.equal(canRead(m,'minsu'),false);
});

test('하위 보류는 후속 캡슐과 사유를 남기고 취소는 상위 확정 기록에 남는다',()=>{
 const {state:s,meeting:p}=setup();messages(s,p,'결정: 상위');const c=delegate(s,p,{title:'대기',messageIds:[p.messages[0].id],memberIds:['minsu']});messages(s,c,'미결: 조사');extractDraft(s,c);
 const result=disposeChild(s,p,c.id,{status:'deferred',reason:'자료 대기'});const follow=s.meetings.find(x=>x.id===result.followUpId);assert.equal(c.status,'deferred');assert.equal(follow.previousId,c.id);assert.equal(follow.carryover[0].text,'조사');
 extractDraft(s,p);confirmAll(s,p);assert.equal(p.confirmedSnapshot.childDispositions[0].reason,'자료 대기');
});

test('확정 정정은 원본을 보존하고 일정은 최신 유효본으로 대체한다',()=>{
 const {state:s,meeting:m}=setup();messages(s,m,'일정: 점검 | 2027년 1월 5일 9시 | 온라인 | 전원');nextMessage(s,m,'다음');extractDraft(s,m);confirmAll(s,m);
 const original=structuredClone(m),next=s.meetings.find(x=>x.previousId===m.id),nextOriginal=structuredClone(next);
 const correction=createCorrection(s,m,'시간 정정');const event=correction.draft.events[0];updateDraftItem(s,correction,'events',{...event,at:'2027-01-05T02:00:00.000Z'});confirmAll(s,correction);
 assert.deepEqual(m,original);assert.deepEqual(next,nextOriginal);assert.equal(s.meetings.filter(x=>x.previousId===m.id).length,1);assert.equal(getConfirmedEvents(s,'minsu').length,2);assert.ok(getConfirmedEvents(s,'minsu').every(e=>e.meetingId===correction.id));
 unchanged(s,()=>updateDraftItem(s,m,'events',{...m.draft.events[0],text:'불법 편집'}),/검토/);
});

test('잘못된 부모와 항목 명령은 부분 변경 없이 실패한다',()=>{
 const {state:s,meeting:m}=setup();messages(s,m,'결정: 결론');extractDraft(s,m);m.parentId='missing';unchanged(s,()=>confirmMeeting(s,m),/상위/);m.parentId=null;
 unchanged(s,()=>removeDraftItem(s,m,'unknown','id'),/알 수 없는/);
 unchanged(s,()=>updateDraftItem(s,m,'tasks',{id:'task',text:'할 일',evidenceIds:[m.messages[0].id],ownerId:'missing',dueAt:'2027-01-01'}),/담당/);
});

test('검토 중인 상위에는 하위 정정 결론을 교체 합류하고 확인을 초기화한다',()=>{
 const {state:s,meeting:p}=setup();messages(s,p,'결정: 상위');const c=delegate(s,p,{title:'하위',messageIds:[p.messages[0].id],memberIds:['minsu']});messages(s,c,'결정: 초기');extractDraft(s,c);confirmAll(s,c);extractDraft(s,p);
 const correction=createCorrection(s,c,'하위 결론 정정');assert.equal(correction.parentId,p.id);assert.equal(confirmMeeting(s,p),false);
 updateDraftItem(s,correction,'decisions',{...correction.draft.decisions[0],text:'정정 결론'});confirmAll(s,correction);
 assert.equal(p.conclusions.length,1);assert.equal(p.conclusions[0].decisions[0],'정정 결론');assert.deepEqual(p.confirmations,[]);assert.equal(c.draft.decisions[0].text,'초기');
});

test('다단계 위임 보류는 자식 처분 없이 손자 캡슐을 고립시키지 않는다',()=>{
 const {state:s,meeting:p}=setup();messages(s,p,'결정: 상위');const c=delegate(s,p,{title:'하위',messageIds:[p.messages[0].id],memberIds:['minsu']});messages(s,c,'결정: 재위임');const grandchild=delegate(s,c,{title:'손자',messageIds:[c.messages[0].id],memberIds:['minsu']});
 unchanged(s,()=>disposeChild(s,p,c.id,{status:'deferred',reason:'보류'}),/남은 위임/);
 disposeChild(s,c,grandchild.id,{status:'cancelled',reason:'범위 제외'});disposeChild(s,p,c.id,{status:'cancelled',reason:'위임 취소'});assert.equal(c.status,'cancelled');assert.equal(grandchild.status,'cancelled');
});
