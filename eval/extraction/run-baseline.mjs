#!/usr/bin/env node
// 규칙 기반 extractDraft(public/domain.js)를 cases.jsonl 에 실행해 split(dev/test)별 점수를 출력한다.
// 사용법: node eval/extraction/run-baseline.mjs [--json 결과.json] [--verbose]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extractDraft } from '../../public/domain.js';
import { loadCases, summarizeBySplit, printSummary } from './lib.mjs';

// ---------- 어댑터: 사례 -> 추출 결과 ----------
export function runRuleBased(c) {
  const memberIds = c.members.map((m) => m.id);
  const state = {
    profileId: memberIds[0],
    members: c.members.map((m) => ({ ...m, grade: 2, teams: [] })),
    meetings: [],
  };
  const meeting = {
    id: c.id,
    memberIds,
    status: 'open',
    messages: c.messages.map((m) => ({ ...m })),
    sourceMessages: [],
    draft: null,
    confirmations: [],
    revision: 0,
    carryover: [],
    conclusions: [],
  };
  state.meetings.push(meeting);
  const draft = extractDraft(state, meeting);
  return {
    decisions: draft.decisions.map((x) => ({ text: x.text, evidenceIds: x.evidenceIds })),
    tasks: draft.tasks.map((x) => ({
      text: x.text,
      ownerId: x.ownerId ?? null,
      dueAt: x.dueAt ?? null,
      evidenceIds: x.evidenceIds,
    })),
    unresolved: draft.unresolved.filter((x) => !x.inherited).map((x) => ({ text: x.text, evidenceIds: x.evidenceIds })),
    events: draft.events.map((x) => ({
      text: x.text,
      at: x.at ?? null,
      hasTime: !!x.hasTime,
      location: x.location || '',
      participantIds: x.participantIds || [],
      kind: x.kind,
      evidenceIds: x.evidenceIds,
    })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const cases = loadCases();
  const outputs = {};
  for (const c of cases) {
    try {
      outputs[c.id] = { actual: runRuleBased(c) };
    } catch (e) {
      outputs[c.id] = { actual: {}, error: e.message };
    }
    if (verbose)
      console.log(`\n# ${c.id}\n기대: ${JSON.stringify(c.expected)}\n결과: ${JSON.stringify(outputs[c.id].actual)}`);
  }
  const res = summarizeBySplit(cases, outputs);
  console.log(
    `ITDA 추출 기준선 — 규칙 기반 extractDraft, 사례 ${cases.length}건 (dev ${res.dev.caseCount} / test ${res.test.caseCount})`,
  );
  printSummary('전체(dev+test)', res.all, { perCase: true });
  printSummary('dev', res.dev);
  printSummary('test', res.test);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(res, null, 2));
  if (res.all.errors) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
