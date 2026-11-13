import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedState,uid} from '../public/domain.js';
import {addMessengerExamples} from '../public/demo-conversations.js';
test('새 목록 시연 데이터를 한 번만 추가하고 기존 회의는 보존한다',()=>{const state=seedState();state.meetings[0].messages.push({id:'mine',text:'내가 작성한 대화'});assert.equal(addMessengerExamples(state),true);assert.equal(state.meetings.length,6);assert.equal(state.meetings[0].messages.at(-1).id,'mine');assert.equal(addMessengerExamples(state),false);assert.equal(state.meetings.length,6);assert.ok(state.meetings.every(m=>m.memberIds.includes('minsu')));});
test('LAN HTTP에서 randomUUID 없이도 UUID v4를 생성한다',()=>{const id=uid({getRandomValues:bytes=>{bytes.fill(123);return bytes;}});assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);});
