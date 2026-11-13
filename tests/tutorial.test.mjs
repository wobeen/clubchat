import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,advanceTutorial,getTutorialStep,renderTutorial} from '../public/tutorial.js';
const state={profileId:'a',meetings:[{id:'practice',confirmations:[]}]};
const event=(p,e,id='practice')=>advanceTutorial(p,e,{meetingId:id});
test('튜토리얼은 실제 작업 순서를 따르며 다른 캡슐 작업은 진행시키지 않는다',()=>{
 const initial=createTutorial();
 let p=event(initial,'draft');assert.deepEqual(p.completed,[]);
 p=advanceTutorial(p,'created');assert.deepEqual(p.completed,[]);
 p=event(p,'created');assert.equal(p.meetingId,'practice');assert.deepEqual(initial.completed,[]);
 p=event(p,'message','elsewhere');assert.deepEqual(p.completed,['created']);
 for(const e of ['message','draft','edited','confirmed'])p=event(p,e);
 assert.equal(getTutorialStep(p,state).id,'next');
 p=event(p,'next','next-capsule');assert.equal(getTutorialStep(p,state).id,'done');
 p=event(p,'next','next-capsule');assert.equal(p.completed.length,6);
});
test('건너뛰기와 이어보기는 이력을 보존하고 재시작은 연습 상태만 반환한다',()=>{
 let p=event(createTutorial(),'created');
 p=event(p,'skip');assert.equal(p.skipped,true);assert.deepEqual(p.completed,['created']);
 assert.match(renderTutorial(p,state,{practice:true}),/tutorial-resume/);
 p=event(p,'resume');assert.equal(p.skipped,false);assert.equal(getTutorialStep(p,state).id,'message');
 assert.deepEqual(event(p,'reset'),createTutorial());
});
test('잘못된 버전·진행 상태로 학습 단계를 건너뛰지 않는다',()=>{
 assert.equal(getTutorialStep({version:99,completed:['next']},state).id,'created');
 assert.equal(getTutorialStep({version:1,completed:'bad'},state).id,'created');
 assert.equal(getTutorialStep({version:1,completed:['created','confirmed'],meetingId:'practice'},state).id,'message');
});
test('연습 CTA는 연습 캡슐을 가리키며 본인 확인 후에만 동료 실행을 제안한다',()=>{
 let p=createTutorial();for(const e of ['created','message','draft','edited'])p=event(p,e);
 let html=renderTutorial(p,state,{practice:true});
 assert.match(html,/data-id="practice"/);assert.doesNotMatch(html,/data-action="tutorial-colleague"/);
 html=renderTutorial(p,{...state,meetings:[{id:'practice',confirmations:['a']}]},{practice:true});
 assert.match(html,/data-action="tutorial-colleague"/);assert.match(html,/자동 응답/);
 assert.match(renderTutorial(p,state),/\?practice=1/);
 assert.doesNotMatch(renderTutorial(p,state),/tutorial-colleague/);
});
