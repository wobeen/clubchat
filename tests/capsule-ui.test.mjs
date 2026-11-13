import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getCapsuleAction,renderCapsuleNavigation} from '../public/capsule-ui.js';
import {renderRoomList} from '../public/messenger-layouts.js';

const capsule=(overrides={})=>({id:'parent',title:'회의',memberIds:['a','b'],status:'review',messages:[],draft:{decisions:[],tasks:[],events:[],unresolved:[]},draftMessageIds:[],confirmations:[],...overrides});
const stateFor=(...meetings)=>({profileId:'a',members:[{id:'a',name:'사용자'},{id:'b',name:'동료'}],meetings});
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function list(state,listFilter){return renderRoomList({state,listFilter,listSearch:'',activeId:'',esc:escape,icon:()=>'',btn:(action,label,cls,attrs)=>`<button ${attrs||''}>${label}</button>`,canRead:(m,id)=>m.memberIds.includes(id)});}

test('하위 대기 중에도 내 확인을 먼저 안내하고 완료한 하위는 대기로 세지 않는다',()=>{
 const parent=capsule(),child=capsule({id:'child',parentId:'parent',status:'open'}),s=stateFor(parent,child);
 assert.equal(getCapsuleAction(s,parent).button,'내 확인 남기기');
 parent.confirmations=['a'];assert.match(getCapsuleAction(s,parent).label,/하위 캡슐 1개/);
 child.status='deferred';assert.match(getCapsuleAction(s,parent).label,/1명 확인 대기/);
 child.status='cancelled';assert.doesNotMatch(getCapsuleAction(s,parent).label,/하위/);
});
test('확인 대상 제외자는 확인 요청을 받지 않으며 새 메시지 반영은 먼저 안내한다',()=>{
 const m=capsule({confirmationMemberIds:['b']}),s=stateFor(m);
 assert.match(getCapsuleAction(s,m).label,/대상에서 제외/);
 assert.doesNotMatch(list(s,'review'),/data-id="parent"/);
 assert.match(list(s,'waiting'),/data-id="parent"/);
 m.messages.push({id:'new',text:'대화'});
 assert.equal(getCapsuleAction(s,m).action,'draft');
});
test('확인한 본인은 내 확인 목록에서 빠지고 대기 목록에 보인다',()=>{
 const m=capsule(),s=stateFor(m);
 assert.match(list(s,'review'),/data-id="parent"/);
 m.confirmations=['a'];
 assert.doesNotMatch(list(s,'review'),/data-id="parent"/);
 assert.match(list(s,'waiting'),/data-id="parent"/);
});
test('관계 렌더링은 비참여 하위 이름을 숨기고 참여 캡슐 제목을 escape한다',()=>{
 const m=capsule(),privateChild=capsule({id:'secret',parentId:m.id,memberIds:['b'],title:'비밀 안건'}),publicChild=capsule({id:'visible',parentId:m.id,title:'<script>악성</script>'});
 const html=renderCapsuleNavigation(stateFor(m,privateChild,publicChild),m);
 assert.doesNotMatch(html,/비밀 안건|data-id="secret"|<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/aria-current="step"/);
});
test('취소/보류는 확정으로 오표시하지 않고 비참여자는 원문 행동이 없다',()=>{
 const m=capsule({status:'cancelled'}),s=stateFor(m);
 assert.match(getCapsuleAction(s,m).label,/취소/);
 assert.equal(getCapsuleAction(s,m).action,null);
 assert.doesNotMatch(renderCapsuleNavigation(s,m),/aria-current="step"/);
 m.memberIds=['b'];assert.equal(getCapsuleAction(s,m).action,null);
});
