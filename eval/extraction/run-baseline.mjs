#!/usr/bin/env node
// 규칙 기반 extractDraft(public/domain.js)를 cases.jsonl 에 실행해 점수를 출력한다.
// 사용법: node eval/extraction/run-baseline.mjs [--json 결과.json] [--verbose]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractDraft } from '../../public/domain.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const TYPES = ['decisions', 'tasks', 'unresolved', 'events'];

const cases = readFileSync(here('./cases.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l, i) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      throw new Error(`cases.jsonl ${i + 1}번째 줄이 JSON이 아니에요: ${e.message}`);
    }
  });

// ---------- 어댑터: 사례 -> 추출 결과 (AI 어댑터는 이 함수 모양만 맞추면 된다) ----------
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

// ---------- 채점 ----------
const norm = (s) =>
  String(s ?? '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i++) out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) || 0) + 1);
  return out;
}
export function similarity(a, b) {
  const x = norm(a),
    y = norm(b);
  if (!x || !y) return 0;
  if (x === y || x.includes(y) || y.includes(x)) return 1;
  const A = bigrams(x),
    B = bigrams(y);
  let inter = 0,
    total = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  return total ? (2 * inter) / total : 0;
}
const MATCH_THRESHOLD = 0.5;
// 그리디 1:1 매칭(유사도 높은 쌍부터)
export function matchItems(expected, actual) {
  const pairs = [];
  expected.forEach((e, i) =>
    actual.forEach((a, j) => {
      const s = similarity(e.text, a.text);
      if (s >= MATCH_THRESHOLD) pairs.push([s, i, j]);
    }),
  );
  pairs.sort((p, q) => q[0] - p[0]);
  const usedE = new Set(),
    usedA = new Set(),
    out = [];
  for (const [, i, j] of pairs) {
    if (usedE.has(i) || usedA.has(j)) continue;
    usedE.add(i);
    usedA.add(j);
    out.push([expected[i], actual[j]]);
  }
  return out;
}
const jaccard = (a = [], b = []) => {
  const A = new Set(a),
    B = new Set(b);
  if (!A.size && !B.size) return 1;
  let i = 0;
  for (const v of A) if (B.has(v)) i++;
  return i / (A.size + B.size - i);
};
const sameSet = (a, b) => jaccard([].concat(a ?? []), [].concat(b ?? [])) === 1;
const kstDay = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10) : null);

function fieldScores(type, e, a) {
  const f = { evidence: jaccard(e.evidenceIds, a.evidenceIds) };
  if (type === 'tasks') {
    f.owner = sameSet(e.ownerId, a.ownerId) ? 1 : 0;
    f.date = kstDay(e.dueAt) === kstDay(a.dueAt) ? 1 : 0; // 마감은 KST 날짜만 비교
  }
  if (type === 'events') {
    f.date = (e.at ?? null) === (a.at ?? null) && !!e.hasTime === !!a.hasTime ? 1 : 0; // 시각은 정확히 일치
    f.location =
      norm(e.location) === norm(a.location) || (norm(e.location) && norm(a.location).includes(norm(e.location)))
        ? 1
        : 0;
    f.participants = sameSet(e.participantIds, a.participantIds) ? 1 : 0;
    f.kind = e.kind === a.kind ? 1 : 0;
  }
  return f;
}

function newAgg() {
  return {
    tp: 0,
    fp: 0,
    fn: 0,
    ev: [],
    date: [],
    dateStrictHit: 0,
    dateStrictN: 0,
    owner: [],
    loc: [],
    ppl: [],
    kind: [],
  };
}
function scoreCase(c, actual) {
  const per = {};
  for (const type of TYPES) {
    const exp = c.expected[type] || [],
      act = actual[type] || [];
    const pairs = matchItems(exp, act);
    const a = newAgg();
    a.tp = pairs.length;
    a.fp = act.length - pairs.length;
    a.fn = exp.length - pairs.length;
    for (const [e, x] of pairs) {
      const f = fieldScores(type, e, x);
      a.ev.push(f.evidence);
      if (f.date !== undefined) a.date.push(f.date);
      if (f.owner !== undefined) a.owner.push(f.owner);
      if (f.location !== undefined) a.loc.push(f.location);
      if (f.participants !== undefined) a.ppl.push(f.participants);
      if (f.kind !== undefined) a.kind.push(f.kind);
      if (f.date !== undefined) {
        a.dateStrictN++;
        a.dateStrictHit += f.date;
      }
    }
    if (type === 'tasks' || type === 'events') a.dateStrictN += exp.length - pairs.length; // 놓친 항목의 날짜는 오답
    per[type] = a;
  }
  return per;
}
const merge = (into, from) => {
  for (const k of ['tp', 'fp', 'fn', 'dateStrictHit', 'dateStrictN']) into[k] += from[k];
  for (const k of ['ev', 'date', 'owner', 'loc', 'ppl', 'kind']) into[k].push(...from[k]);
};
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const prf = (a) => {
  const p = a.tp + a.fp ? a.tp / (a.tp + a.fp) : null;
  const r = a.tp + a.fn ? a.tp / (a.tp + a.fn) : null;
  // 기대값과 결과가 모두 비어 있으면 완전 정답으로 본다.
  if (a.tp + a.fp + a.fn === 0) return { p: 1, r: 1, f1: 1 };
  const f1 = p && r ? (2 * p * r) / (p + r) : 0;
  return { p: p ?? 0, r: r ?? 0, f1 };
};
const pct = (v) => (v === null || v === undefined ? '  -  ' : (v * 100).toFixed(1).padStart(5) + '%');

// ---------- 실행 ----------
const rows = [];
const total = newAgg();
const byType = Object.fromEntries(TYPES.map((t) => [t, newAgg()]));
const byTag = {};
for (const c of cases) {
  let actual,
    error = null;
  try {
    actual = runRuleBased(c);
  } catch (e) {
    error = e.message;
    actual = { decisions: [], tasks: [], unresolved: [], events: [] };
  }
  const per = scoreCase(c, actual);
  const caseAgg = newAgg();
  for (const t of TYPES) {
    merge(caseAgg, per[t]);
    merge(byType[t], per[t]);
  }
  merge(total, caseAgg);
  for (const tag of c.tags) {
    byTag[tag] ||= newAgg();
    merge(byTag[tag], caseAgg);
  }
  rows.push({
    id: c.id,
    tags: c.tags,
    error,
    ...prf(caseAgg),
    evidence: mean(caseAgg.ev),
    date: mean(caseAgg.date),
    exp: caseAgg.tp + caseAgg.fn,
    got: caseAgg.tp + caseAgg.fp,
    tp: caseAgg.tp,
  });
  if (verbose) console.log(`\n# ${c.id}\n기대: ${JSON.stringify(c.expected)}\n결과: ${JSON.stringify(actual)}`);
}

console.log(`ITDA 추출 기준선 — 규칙 기반 extractDraft, 사례 ${cases.length}건\n`);
console.log('사례'.padEnd(38) + '기대 결과 일치   정밀도  재현율     F1  근거   날짜');
for (const r of rows) {
  console.log(
    `${r.id.padEnd(36)}${String(r.exp).padStart(4)}${String(r.got).padStart(4)}${String(r.tp).padStart(4)}  ${pct(r.p)} ${pct(r.r)} ${pct(r.f1)} ${pct(r.evidence)} ${pct(r.date)}${r.error ? '  ERR ' + r.error : ''}`,
  );
}
const t = prf(total);
console.log('\n[항목 종류별]');
for (const ty of TYPES) {
  const s = prf(byType[ty]);
  console.log(
    `${ty.padEnd(11)} 정밀도${pct(s.p)} 재현율${pct(s.r)} F1${pct(s.f1)}  (일치 ${byType[ty].tp} / 기대 ${byType[ty].tp + byType[ty].fn} / 결과 ${byType[ty].tp + byType[ty].fp})`,
  );
}
console.log('\n[태그별 F1]');
for (const tag of Object.keys(byTag).sort())
  console.log(
    `${tag.padEnd(18)} ${pct(prf(byTag[tag]).f1)}  (사례 ${cases.filter((c) => c.tags.includes(tag)).length}건)`,
  );
const dateAcc = mean(total.date),
  dateStrict = total.dateStrictN ? total.dateStrictHit / total.dateStrictN : null;
console.log('\n[전체]');
console.log(`항목 일치  정밀도${pct(t.p)} 재현율${pct(t.r)} F1${pct(t.f1)}`);
console.log(`근거 ID 정확도(일치 항목 평균 Jaccard)  ${pct(mean(total.ev))}`);
console.log(`날짜 정확도(일치 항목 기준)            ${pct(dateAcc)}`);
console.log(`날짜 정확도(놓친 항목 오답 포함)        ${pct(dateStrict)}`);
console.log(`담당자 정확도(일치 업무 기준)           ${pct(mean(total.owner))}`);
if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        cases: rows,
        overall: { ...t, evidence: mean(total.ev), dateMatched: dateAcc, dateStrict, owner: mean(total.owner) },
      },
      null,
      2,
    ),
  );
}
