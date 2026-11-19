#!/usr/bin/env node
// 평가 도구 자체 검증: 모의 후보 JSON 두 개로 run-ai.mjs --mock 을 돌린다.
//  1) 기대값과 완전히 같은 출력 → 모든 지표 100%
//  2) 빈 출력 → 재현율 0 (사례 대부분이 값이 있으니 F1 도 0 에 가깝다)
// 추가로 입력 변환(caseToExtractInput)과 복수 담당 채점 규칙, 비용 한도 중단을 확인한다.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseToExtractInput, expandOwners, loadCases, scoreCase, normalizeOutput } from './lib.mjs';

const runAi = fileURLToPath(new URL('./run-ai.mjs', import.meta.url));
const cases = loadCases();
const dir = mkdtempSync(join(tmpdir(), 'itda-eval-selftest-'));

function runMock(mockPath, split) {
  const out = join(dir, `out-${split}-${Math.random().toString(36).slice(2)}.json`);
  execFileSync(process.execPath, [runAi, '--mock', mockPath, '--split', split, '--json', out], { stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

try {
  // 사례 수·분할 요건
  const dev = cases.filter((c) => c.split === 'dev'),
    test = cases.filter((c) => c.split === 'test');
  assert.ok(cases.length >= 60, `사례가 60건 이상이어야 해요 (${cases.length})`);
  assert.ok(test.length >= 25, `test 가 25건 이상이어야 해요 (${test.length})`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, '사례 id 가 중복돼요');
  const piiCases = cases.filter((c) => c.tags.includes('pii'));
  assert.ok(piiCases.length >= 2, 'pii 사례가 2건 이상이어야 해요');
  for (const c of piiCases)
    assert.ok(!/\d{2,4}-\d{2,4}-\d{3,}/.test(JSON.stringify(c.expected)), `${c.id}: 기대값에 번호가 들어 있어요`);

  // 입력 변환 계약
  const input = caseToExtractInput(cases[0]);
  assert.deepEqual(Object.keys(input).sort(), [
    'context',
    'existingTexts',
    'members',
    'messages',
    'referenceTime',
    'timeZone',
  ]);
  assert.deepEqual(input.context, []);
  assert.deepEqual(input.existingTexts, []);
  assert.equal(input.timeZone, 'Asia/Seoul');
  assert.deepEqual(Object.keys(input.members[0]).sort(), ['id', 'name']);
  assert.deepEqual(Object.keys(input.messages[0]).sort(), ['authorId', 'createdAt', 'id', 'text']);

  // 복수 담당 채점: 담당자별 task 가 모두 있으면 만점, 하나만 있으면 일부
  const multi = cases.find((c) => c.expected.tasks.some((t) => Array.isArray(t.ownerId)));
  assert.ok(multi, '복수 담당 사례가 있어야 해요');
  const perfectOut = { ...multi.expected, tasks: expandOwners(multi.expected.tasks) };
  const sumTp = (per) => Object.values(per).reduce((s, a) => s + a.tp, 0);
  const sumFn = (per) => Object.values(per).reduce((s, a) => s + a.fn, 0);
  const full = scoreCase(multi, perfectOut);
  assert.equal(sumFn(full), 0);
  const partial = scoreCase(multi, { ...perfectOut, tasks: perfectOut.tasks.slice(0, 1) });
  assert.ok(sumFn(partial) > 0 && sumTp(partial) < sumTp(full));

  // 1) 완전 일치 모의
  const perfect = Object.fromEntries(
    cases.map((c) => [
      c.id,
      { candidates: { ...normalizeOutput(c.expected) }, usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 } },
    ]),
  );
  const perfectPath = join(dir, 'perfect.json');
  writeFileSync(perfectPath, JSON.stringify(perfect));
  for (const split of ['dev', 'test', 'all']) {
    const r = runMock(perfectPath, split).all;
    const o = r.overall;
    for (const k of [
      'p',
      'r',
      'f1',
      'evidence',
      'dateMatched',
      'dateStrict',
      'owner',
      'location',
      'participants',
      'kind',
    ])
      assert.equal(o[k], 1, `완전 일치 ${split}: ${k} = ${o[k]}`);
    assert.equal(o.ambiguousNoFabrication, 1);
    assert.ok(Math.abs(o.avgCostUsd - 0.001) < 1e-12, '사례당 평균 비용');
    assert.equal(r.errors, 0);
  }

  // 2) 빈 출력 모의
  const emptyPath = join(dir, 'empty.json');
  writeFileSync(emptyPath, '{}');
  const e = runMock(emptyPath, 'all');
  assert.equal(e.all.overall.r, 0, `빈 출력 재현율 ${e.all.overall.r}`);
  assert.equal(e.all.overall.p, 0);
  assert.ok(e.all.overall.f1 < 0.2, `빈 출력 F1 ${e.all.overall.f1}`); // 빈 기대(empty 사례)만 만점
  assert.equal(e.all.byTag.natural.r, 0);

  // 모의가 아닐 때 서버 모듈이 없으면 친절한 오류, 비용 한도 초과면 호출 전 중단
  const over = spawnSync(process.execPath, [runAi, '--split', 'all', '--max-usd', '0.0001'], { encoding: 'utf8' });
  assert.equal(over.status, 2);
  assert.match(over.stderr, /--max-usd/);
  assert.ok(!/sk-ant/.test(over.stdout + over.stderr));

  console.log('selftest 통과: 완전 일치 100%, 빈 출력 재현율 0, 입력 변환·복수 담당·비용 한도 확인');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
