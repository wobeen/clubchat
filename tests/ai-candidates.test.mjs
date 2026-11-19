import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seedState,
  createMeeting,
  sendMessage,
  extractDraft,
  getPendingMessageCount,
  validationErrors,
} from '../public/domain.js';

function setup() {
  const state = seedState();
  state.meetings = [];
  state.calendar = [];
  const m = createMeeting(state, { title: 'AI 초안', memberIds: ['minsu'] });
  const [a, b, c] = [
    '포스터는 민수가 금요일까지 만들기로 해요',
    '좋아요 그렇게 해요',
    '아 그리고 장소는 아직 못 정했어요',
  ].map((text) => sendMessage(state, m, text));
  return { state, m, a, b, c };
}

test('AI candidates become draft items only with evidence, members and real dates', () => {
  const { state, m, a, b } = setup();
  extractDraft(state, m, {
    candidateMessageIds: [a.id, b.id],
    candidates: {
      decisions: [
        { text: '포스터는 민수가 맡는다', evidenceIds: [a.id, b.id] },
        { text: '근거 없는 결정', evidenceIds: ['made-up'] },
      ],
      tasks: [
        {
          text: '포스터 제작',
          ownerId: 'minsu',
          dueAt: '2026-11-06T18:00:00+09:00',
          dateText: '금요일',
          evidenceIds: [a.id],
        },
        { text: '외부인 업무', ownerId: 'not-a-member', dueAt: 'someday', evidenceIds: [a.id] },
      ],
      events: [{ text: '리허설', at: null, hasTime: true, participantIds: ['minsu', 'ghost'], evidenceIds: [b.id] }],
    },
  });
  assert.deepEqual(
    m.draft.decisions.map((x) => [x.text, x.evidenceIds, x.source]),
    [['포스터는 민수가 맡는다', [a.id, b.id], 'ai']],
  );
  const [poster, stranger] = m.draft.tasks;
  assert.equal(poster.ownerId, 'minsu');
  assert.equal(poster.dueAt, '2026-11-06T09:00:00.000Z');
  assert.equal(stranger.ownerId, null);
  assert.equal(stranger.dueAt, null);
  assert.equal(m.draft.events[0].hasTime, false);
  assert.deepEqual(m.draft.events[0].participantIds, ['minsu']);
  // Missing owner/date/time surface as review issues instead of being filled in.
  assert.ok(validationErrors(state, m).length > 0);
});

test('messages the suggestion did not cover stay unreflected and the rules can pick them up later', () => {
  const { state, m, a, b } = setup();
  extractDraft(state, m, { candidateMessageIds: [a.id, b.id], candidates: { decisions: [] } });
  assert.deepEqual(m.draftMessageIds, [a.id, b.id]);
  assert.equal(getPendingMessageCount(m), 1);
  sendMessage(state, m, '미결: 장소 정하기');
  extractDraft(state, m);
  assert.deepEqual(
    m.draftMessageIds,
    m.messages.map((x) => x.id),
  );
  assert.equal(getPendingMessageCount(m), 0);
  assert.equal(m.draft.unresolved.at(-1).text, '장소 정하기');
  // The rule pass snapshots the AI version; its history entry names the change that replaced it.
  assert.equal(m.draftHistory.at(-1).reason, '반영: 새 대화');
});
