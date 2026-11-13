import {getConfirmationTargets,getAgendaItems,setConfirmationMembers,markMemberDeparted,transferFacilitator,disposeChild,setAgendaStatus,createCorrection,restoreDraft,sendMessage,confirmMeeting} from './domain.js';
import {advanceTutorial} from './tutorial.js';

// UI orchestration; domain commands own policy checks and repository owns persistence.
export function createWorkflowActions(ctx) {
 const {repo,practice,esc,btn,field,openModal,modal,persist,render,toast,selectMeeting,tutorialEvent}=ctx;
 const state=()=>repo.get();
 const name=id=>state().members.find(x=>x.id===id)?.name||id;
 const checkedResult=result=>{if(!result.ok)throw Error(result.message);};
 const download=source=>{const text=repo.export({source});if(!text)throw Error('내보낼 자료가 없어요.');const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`ITDA-${source}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const form=(id,body,m)=>`<form id="${id}" data-revision="${m?.revision??0}">${body}</form>`;
 const submit=id=>`<button type="submit" form="${id}" class="primary">저장하기</button>`;
 const reason=()=>field('사유','reason','','text','required maxlength="500"');
 async function finish(){await persist();modal.close();render();}
 return {
 async action(action,target,m){
  const s=state();
  if(action==='storage-export'||action==='storage-original'){download(action==='storage-original'?'original':'current');return true;}
  if(action==='storage-retry'){checkedResult(await repo.retry());modal.close();render();toast('저장했어요.');return true;}
  if(action==='storage-reload'){openModal('최신 저장본을 불러올까요?', '<p>이 화면의 미저장 변경은 교체됩니다. 필요한 작업을 먼저 내보내세요.</p>',btn('storage-export','현재 작업 내보내기','outline')+btn('storage-reload-confirm','최신본으로 교체','primary'));return true;}
  if(action==='storage-reload-confirm'){checkedResult(await repo.reload());modal.close();ctx.selectFirst();render();return true;}
  if(action==='storage-recovery'){openModal('저장 데이터 복구',form('recovery-form','<p>복원은 현재 저장 내용을 교체합니다. 원본과 현재 내용을 먼저 내보낼 수 있어요.</p><label class="field"><span>복원할 JSON 파일</span><input type="file" name="file" accept="application/json,.json"></label><label class="field"><span>또는 JSON 붙여넣기</span><textarea name="json" rows="5"></textarea></label>'),btn('storage-export','현재 내용 내보내기','outline')+btn('storage-original','원본 내보내기','outline')+btn('storage-backup','마지막 정상 백업 복원','outline')+submit('recovery-form'));return true;}
  if(action==='storage-backup'){checkedResult(await repo.recover('backup'));modal.close();ctx.selectFirst();render();return true;}
  if(action==='tutorial-skip'||action==='tutorial-resume'){s.tutorial=advanceTutorial(s.tutorial,action==='tutorial-skip'?'skip':'resume');await persist();render();return true;}
  if(action==='tutorial-reset'){openModal('연습을 다시 시작할까요?','<p>연습 캡슐만 초기화합니다. 내 캡슐에는 영향을 주지 않아요.</p>',btn('tutorial-reset-confirm','연습 초기화','primary'));return true;}
  if(action==='tutorial-reset-confirm'){if(!practice)throw Error('연습 공간에서만 가능해요.');checkedResult(await repo.reset());ctx.selectFirst();modal.close();render();return true;}
  if(action==='practice-example'){
   if(!practice)throw Error('연습 공간에서만 가능해요.');
   for(const text of ['결정: 다음 모임은 책 한 권 함께 읽기','미결: 함께 읽을 책 고르기','다음 회의: 독서 모임 | 내일 19:00 | 온라인 | 전원'])if(!m.messages.some(x=>x.text===text))sendMessage(s,m,text);
   tutorialEvent('message');await persist();render();return true;
  }
  if(action==='tutorial-colleague'){
   if(!practice)throw Error('연습 공간에서만 가능해요.');
   const training=s.meetings.find(x=>x.id===s.tutorial?.meetingId);if(!training||!training.confirmations.includes(s.profileId))throw Error('먼저 내 확인을 남겨주세요.');
   const user=s.profileId;try{for(const id of getConfirmationTargets(training)){if(training.status==='confirmed')break;if(training.confirmations.includes(id))continue;s.profileId=id;confirmMeeting(s,training,{expectedRevision:training.revision});}}finally{s.profileId=user;}
   if(training.status==='confirmed')tutorialEvent('confirmed',training.id);await persist();render();return true;
  }
  if(action==='tutorial-open-next'){const next=s.meetings.find(x=>x.previousId===s.tutorial?.meetingId);if(!next)throw Error('결론에 다음 회의 일정을 추가하고 확정해주세요.');selectMeeting(next.id);tutorialEvent('next',next.id);await persist();render();return true;}
  if(action==='policy'){
   openModal('참여와 확인 대상',form('policy-form',`<p>진행자: ${esc(name(m.facilitatorId||m.memberIds[0]))}. 제외된 사람을 동의자로 표시하지 않으며, 변경 후 다시 확인합니다.</p><label class="field"><span>처리</span><select name="operation"><option value="targets">불참 · 확인 대상 변경</option><option value="depart">참여자 탈퇴 처리</option><option value="transfer">진행자 변경</option></select></label><div class="delegate-members">${m.memberIds.map(id=>`<label><input type="checkbox" name="target" value="${esc(id)}" ${getConfirmationTargets(m).includes(id)?'checked':''} ${(m.departedMemberIds||[]).includes(id)?'disabled':''}>${esc(name(id))}</label>`).join('')}</div><label class="field"><span>탈퇴 또는 새 진행자로 지정할 참여자</span><select name="member">${m.memberIds.map(id=>`<option value="${esc(id)}">${esc(name(id))}</option>`).join('')}</select></label>${reason()}`,m),submit('policy-form'));return true;
  }
  if(action==='disposition'){
   const children=s.meetings.filter(x=>x.parentId===m.id&&['open','review','scheduled'].includes(x.status));
   if(!children.length)throw Error('진행 중인 하위 캡슐이 없어요.');
   openModal('하위 캡슐 보류·취소',form('disposition-form',`<label class="field"><span>하위 캡슐</span><select name="child">${children.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select></label><label class="field"><span>처리</span><select name="status"><option value="deferred">보류하고 후속 캡슐로 이관</option><option value="cancelled">취소</option></select></label><p>보류하면 담당자가 참여하는 후속 캡슐이 생성됩니다. 사유는 상위 공동 확인에 포함됩니다.</p>${reason()}`,m),submit('disposition-form'));return true;
  }
  if(action==='agenda'){
   const item=getAgendaItems(m).find(x=>x.id===target.dataset.id);if(!item)throw Error('안건을 찾지 못했어요.');
   openModal('미결 안건 처리',form('agenda-form',`<input type="hidden" name="agendaId" value="${esc(item.id)}"><p>${esc(item.text)}</p><label class="field"><span>상태</span><select name="status">${[['open','계속 유지'],['resolved','해결됨'],['deferred','보류']].map(([id,label])=>`<option value="${id}" ${id===item.status?'selected':''}>${label}</option>`).join('')}</select></label><p>다음 캡슐이 여러 개면 승계 대상을 선택하세요.</p>${m.draft.events.filter(x=>x.kind==='next').map(x=>`<label><input type="checkbox" name="destination" value="${x.id}" ${item.targetEventIds?.includes(x.id)?'checked':''}>${esc(x.text)}</label>`).join('')}${reason()}`,m),submit('agenda-form'));return true;
  }
  if(action==='correction'){openModal('확정 기록 정정',form('correction-form','<p>원본은 보존하고 새 정정본을 공동 확인합니다. 이미 열린 다음 캡슐은 자동 변경하지 않습니다.</p>'+reason(),m),submit('correction-form'));return true;}
  if(action==='draft-history'){openModal('초안 버전 이력', (m.draftHistory||[]).slice().reverse().map(h=>`<article class="history-entry"><h3>버전 ${h.revision} · ${esc(h.reason)}</h3>${Object.values(h.draft).flat().map(x=>`<p>${esc(x.text)}</p>`).join('')}${m.status==='review'?btn('restore-draft','이 버전으로 복원','outline',`data-revision="${m.revision}" data-restore="${h.revision}"`):''}</article>`).join(''),btn('close','닫기','outline'));return true;}
  if(action==='restore-draft'){restoreDraft(s,m,Number(target.dataset.restore),{expectedRevision:Number(target.dataset.revision)});await finish();return true;}
  return false;
 },
 async submit(formElement,data,m){
  const s=state(),options={expectedRevision:Number(formElement.dataset.revision)},formData=new FormData(formElement);
  if(formElement.id==='policy-form'){
   if(data.operation==='targets')setConfirmationMembers(s,m,formData.getAll('target'),data.reason,options);
   else if(data.operation==='depart')markMemberDeparted(s,m,data.member,data.reason,options);
   else transferFacilitator(s,m,data.member,data.reason,options);
  }else if(formElement.id==='agenda-form'){const targets=formData.getAll('destination');setAgendaStatus(s,m,data.agendaId,{status:data.status,reason:data.reason,...(targets.length?{targetEventIds:targets}:{})},options);}
  else if(formElement.id==='disposition-form')disposeChild(s,m,data.child,{status:data.status,reason:data.reason},options);
  else if(formElement.id==='correction-form'){const corrected=createCorrection(s,m,data.reason);selectMeeting(corrected.id,'minutes');}
  else if(formElement.id==='recovery-form'){const file=formData.get('file');const raw=file?.size?await file.text():data.json;checkedResult(await repo.recover(raw));ctx.selectFirst();modal.close();render();return;}
  else return;
  await finish();
 }
 };
}
