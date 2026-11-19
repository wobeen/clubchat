// 추출 평가 공용 모듈: 사례 읽기, ExtractInput 변환, 채점, 요약, 출력.
// run-baseline.mjs(규칙 기반)와 run-ai.mjs(AI Extractor)가 같은 채점을 쓰도록 한 곳에 둔다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TYPES = ['decisions', 'tasks', 'unresolved', 'events'];
export const SPLITS = ['dev', 'test'];
export const CASES_PATH = fileURLToPath(new URL('./cases.jsonl', import.meta.url));

export function loadCases(path = CASES_PATH) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      let c;
      try {
        c = JSON.parse(l);
      } catch (e) {
        throw new Error(`cases.jsonl ${i + 1}번째 줄이 JSON이 아니에요: ${e.message}`);
      }
      if (!SPLITS.includes(c.split)) throw new Error(`${c.id}: split 이 dev/test 가 아니에요`);
      return c;
    });
}

// ---------- 사례 -> ExtractInput (계약 docs/contracts/ai-extraction.md) ----------
// 실제 모델 평가·프롬프트 조정 단계에서도 이 함수를 그대로 쓴다.
export function caseToExtractInput(c) {
  return {
    messages: c.messages.map((m) => ({ id: m.id, authorId: m.authorId, text: m.text, createdAt: m.createdAt })),
    context: [],
    existingTexts: [],
    members: c.members.map((m) => ({ id: m.id, name: m.name })),
    referenceTime: c.referenceTime,
    timeZone: 'Asia/Seoul',
  };
}

// ---------- 정규화: 복수 담당 기대값은 담당자별 task 로 펼친다 ----------
export function expandOwners(tasks = []) {
  const out = [];
  for (const t of tasks) {
    if (Array.isArray(t.ownerId)) {
      if (!t.ownerId.length) out.push({ ...t, ownerId: null });
      else for (const o of t.ownerId) out.push({ ...t, ownerId: o });
    } else out.push({ ...t, ownerId: t.ownerId ?? null });
  }
  return out;
}
export function normalizeOutput(o = {}) {
  return {
    decisions: (o.decisions || []).map((x) => ({ text: x.text, evidenceIds: x.evidenceIds || [] })),
    tasks: expandOwners(o.tasks || []).map((x) => ({
      text: x.text,
      ownerId: x.ownerId ?? null,
      dueAt: x.dueAt ?? null,
      evidenceIds: x.evidenceIds || [],
    })),
    unresolved: (o.unresolved || []).map((x) => ({ text: x.text, evidenceIds: x.evidenceIds || [] })),
    events: (o.events || []).map((x) => ({
      text: x.text,
      at: x.at ?? null,
      hasTime: !!x.hasTime,
      location: x.location || '',
      participantIds: x.participantIds || [],
      kind: x.kind || 'event',
      evidenceIds: x.evidenceIds || [],
    })),
  };
}
export const normalizeExpected = (e) => normalizeOutput(e);

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
// 그리디 1:1 매칭(유사도 높은 쌍부터). 같은 유사도면 담당자가 같은 쌍을 먼저 잇는다.
export function matchItems(expected, actual, type) {
  const pairs = [];
  expected.forEach((e, i) =>
    actual.forEach((a, j) => {
      const s = similarity(e.text, a.text);
      if (s >= MATCH_THRESHOLD) pairs.push([s, type === 'tasks' && e.ownerId === a.ownerId ? 1 : 0, i, j]);
    }),
  );
  pairs.sort((p, q) => q[0] - p[0] || q[1] - p[1]);
  const usedE = new Set(),
    usedA = new Set(),
    out = [];
  for (const [, , i, j] of pairs) {
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
    f.owner = (e.ownerId ?? null) === (a.ownerId ?? null) ? 1 : 0;
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

export function newAgg() {
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
    ambig: [], // 모호 사례 무날조: 1 = 비워야 할 담당·날짜를 비워 둠, 0 = 값을 지어냄
  };
}
export function scoreCase(c, actualRaw) {
  const expected = normalizeExpected(c.expected);
  const actual = normalizeOutput(actualRaw);
  const ambOwner = c.tags.includes('ambiguous-owner'),
    ambDate = c.tags.includes('ambiguous-date');
  const per = {};
  for (const type of TYPES) {
    const exp = expected[type],
      act = actual[type];
    const pairs = matchItems(exp, act, type);
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
      if (type === 'tasks' && ambOwner && e.ownerId === null) a.ambig.push(x.ownerId === null ? 1 : 0);
      if (type === 'tasks' && ambDate && e.dueAt === null) a.ambig.push(x.dueAt === null ? 1 : 0);
      if (type === 'events' && ambDate && e.at === null) a.ambig.push(x.at === null ? 1 : 0);
    }
    if (type === 'tasks' || type === 'events') a.dateStrictN += exp.length - pairs.length; // 놓친 항목의 날짜는 오답
    per[type] = a;
  }
  return per;
}
export const merge = (into, from) => {
  for (const k of ['tp', 'fp', 'fn', 'dateStrictHit', 'dateStrictN']) into[k] += from[k];
  for (const k of ['ev', 'date', 'owner', 'loc', 'ppl', 'kind', 'ambig']) into[k].push(...from[k]);
};
export const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
export const prf = (a) => {
  const p = a.tp + a.fp ? a.tp / (a.tp + a.fp) : null;
  const r = a.tp + a.fn ? a.tp / (a.tp + a.fn) : null;
  // 기대값과 결과가 모두 비어 있으면 완전 정답으로 본다.
  if (a.tp + a.fp + a.fn === 0) return { p: 1, r: 1, f1: 1 };
  const f1 = p && r ? (2 * p * r) / (p + r) : 0;
  return { p: p ?? 0, r: r ?? 0, f1 };
};
export const pct = (v) => (v === null || v === undefined ? '  -  ' : (v * 100).toFixed(1).padStart(5) + '%');

// ---------- 요약 ----------
// outputs: { [caseId]: { actual, error?, usage? } }
export function summarize(cases, outputs) {
  const rows = [];
  const total = newAgg();
  const byType = Object.fromEntries(TYPES.map((t) => [t, newAgg()]));
  const byTag = {};
  const costs = [];
  let errors = 0;
  for (const c of cases) {
    const o = outputs[c.id] || { actual: {}, error: '결과 없음' };
    if (o.error) errors++;
    if (o.usage && typeof o.usage.costUsd === 'number') costs.push(o.usage.costUsd);
    const per = scoreCase(c, o.actual || {});
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
      split: c.split,
      tags: c.tags,
      error: o.error || null,
      ...prf(caseAgg),
      evidence: mean(caseAgg.ev),
      date: mean(caseAgg.date),
      exp: caseAgg.tp + caseAgg.fn,
      got: caseAgg.tp + caseAgg.fp,
      tp: caseAgg.tp,
    });
  }
  const tagStats = {};
  for (const [tag, a] of Object.entries(byTag))
    tagStats[tag] = { cases: cases.filter((c) => c.tags.includes(tag)).length, ...prf(a) };
  const typeStats = {};
  for (const t of TYPES)
    typeStats[t] = {
      ...prf(byType[t]),
      tp: byType[t].tp,
      exp: byType[t].tp + byType[t].fn,
      got: byType[t].tp + byType[t].fp,
    };
  const overall = prf(total);
  return {
    caseCount: cases.length,
    errors,
    rows,
    overall: {
      ...overall,
      evidence: mean(total.ev),
      dateMatched: mean(total.date),
      dateStrict: total.dateStrictN ? total.dateStrictHit / total.dateStrictN : null,
      owner: mean(total.owner),
      location: mean(total.loc),
      participants: mean(total.ppl),
      kind: mean(total.kind),
      ambiguousNoFabrication: mean(total.ambig),
      ambiguousItems: total.ambig.length,
      avgCostUsd: mean(costs),
      totalCostUsd: costs.length ? costs.reduce((s, v) => s + v, 0) : null,
    },
    byType: typeStats,
    byTag: tagStats,
  };
}

export function summarizeBySplit(cases, outputs) {
  const res = { all: summarize(cases, outputs) };
  for (const s of SPLITS) {
    const sub = cases.filter((c) => c.split === s);
    if (sub.length) res[s] = summarize(sub, outputs);
  }
  return res;
}

// ---------- 출력 ----------
export function printSummary(title, s, { perCase = false } = {}) {
  console.log(`\n===== ${title} — 사례 ${s.caseCount}건${s.errors ? `, 오류 ${s.errors}건` : ''} =====`);
  if (perCase) {
    console.log('사례'.padEnd(38) + '기대 결과 일치   정밀도  재현율     F1  근거   날짜');
    for (const r of s.rows) {
      console.log(
        `${r.id.padEnd(36)}${String(r.exp).padStart(4)}${String(r.got).padStart(4)}${String(r.tp).padStart(4)}  ${pct(r.p)} ${pct(r.r)} ${pct(r.f1)} ${pct(r.evidence)} ${pct(r.date)}${r.error ? '  ERR ' + r.error : ''}`,
      );
    }
  }
  console.log('[항목 종류별]');
  for (const [ty, v] of Object.entries(s.byType))
    console.log(
      `${ty.padEnd(11)} 정밀도${pct(v.p)} 재현율${pct(v.r)} F1${pct(v.f1)}  (일치 ${v.tp} / 기대 ${v.exp} / 결과 ${v.got})`,
    );
  console.log('[태그별 F1]');
  for (const tag of Object.keys(s.byTag).sort())
    console.log(`${tag.padEnd(18)} ${pct(s.byTag[tag].f1)}  (사례 ${s.byTag[tag].cases}건)`);
  const o = s.overall;
  console.log('[전체]');
  console.log(`항목 일치  정밀도${pct(o.p)} 재현율${pct(o.r)} F1${pct(o.f1)}`);
  console.log(`근거 ID 정확도(일치 항목 평균 Jaccard)  ${pct(o.evidence)}`);
  console.log(`날짜 정확도(일치 항목 기준)            ${pct(o.dateMatched)}`);
  console.log(`날짜 정확도(놓친 항목 오답 포함)        ${pct(o.dateStrict)}`);
  console.log(`담당자 정확도(일치 업무 기준)           ${pct(o.owner)}`);
  console.log(
    `모호 사례 무날조율(${String(o.ambiguousItems).padStart(2)}항목)        ${pct(o.ambiguousNoFabrication)}`,
  );
  if (o.avgCostUsd !== null)
    console.log(`사례당 평균 비용 $${o.avgCostUsd.toFixed(5)} (합계 $${o.totalCostUsd.toFixed(4)})`);
}
