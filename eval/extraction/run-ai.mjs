#!/usr/bin/env node
// AI Extractor(docs/contracts/ai-extraction.md)를 cases.jsonl 에 실행해 split·태그별 점수를 낸다.
//
//   node --import tsx eval/extraction/run-ai.mjs --split dev [--env-file .env] [--max-usd 1]
//   node eval/extraction/run-ai.mjs --mock candidates.json --split all     (서버 모듈 없이 도구 검증)
//   node --import tsx eval/extraction/run-ai.mjs --split dev --cache eval/extraction/runs/<시각>   (API 재호출 없음)
//
// 옵션
//   --split dev|test|all   평가할 사례 (기본 dev). test 는 프롬프트 조정에 쓰지 않는다(README).
//   --mock <file.json>     { "<사례 id>": { candidates, usage?, model? } | 후보 객체 } 로 Extractor 를 대신한다.
//   --env-file <path>      ANTHROPIC_API_KEY(와 AI_MODEL)만 읽는다. 키는 출력·파일에 남기지 않는다.
//   --cache <dir>          이전 실행 폴더. 거기 있는 사례는 API 를 다시 부르지 않는다.
//   --max-usd <n>          예상 최대 비용이 이 값을 넘으면 호출 전에 중단 (기본 1).
//   --max-output-tokens <n> 비용 예측용 출력 상한 (기본 2048).
//   --model <id>           모델 id (기본: Extractor 기본값 / AI_MODEL).
//   --concurrency <n>      동시 호출 수 (기본 3).
//   --json <path>          요약을 JSON 으로 저장 (메시지 본문·키 없음).
//   --verbose              사례별 기대·결과 출력.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { caseToExtractInput, loadCases, normalizeOutput, printSummary, summarizeBySplit } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ANTHROPIC_MODULE = resolve(HERE, '../../server/src/extract/anthropic.ts');

function parseArgs(argv) {
  const o = { split: 'dev', maxUsd: 1, maxOutputTokens: 2048, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} 에 값이 필요해요.`);
      return argv[++i];
    };
    if (a === '--split') o.split = val();
    else if (a === '--mock') o.mock = val();
    else if (a === '--env-file') o.envFile = val();
    else if (a === '--cache') o.cache = val();
    else if (a === '--max-usd') o.maxUsd = Number(val());
    else if (a === '--max-output-tokens') o.maxOutputTokens = Number(val());
    else if (a === '--model') o.model = val();
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(val()) || 1);
    else if (a === '--json') o.json = val();
    else if (a === '--verbose') o.verbose = true;
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (!['dev', 'test', 'all'].includes(o.split)) throw new Error('--split 은 dev, test, all 중 하나예요.');
  if (!(o.maxUsd >= 0)) throw new Error('--max-usd 는 0 이상의 숫자예요.');
  return o;
}

// .env 형식에서 필요한 키만 읽는다.
function readEnvFile(path) {
  const wanted = new Set(['ANTHROPIC_API_KEY', 'AI_MODEL', 'AI_PRICE_INPUT_PER_MTOK', 'AI_PRICE_OUTPUT_PER_MTOK']);
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !wanted.has(m[1])) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const emptyCandidates = () => ({ decisions: [], tasks: [], unresolved: [], events: [] });

async function loadAnthropicExtractor(env, model) {
  if (!existsSync(ANTHROPIC_MODULE)) {
    throw new Error(
      'server/src/extract/anthropic.ts 가 아직 없어요. 서버 AI 모듈이 들어온 뒤에 실행하거나, ' +
        '--mock <file.json> 으로 미리 만든 후보를 평가하세요.',
    );
  }
  let mod;
  try {
    mod = await import(pathToFileURL(ANTHROPIC_MODULE).href);
  } catch (e) {
    throw new Error(
      `server/src/extract/anthropic.ts 를 불러오지 못했어요(${e.message}). ` +
        '`node --import tsx eval/extraction/run-ai.mjs ...` 로 실행했는지 확인하세요.',
    );
  }
  if (typeof mod.createAnthropicExtractor !== 'function')
    throw new Error('createAnthropicExtractor 가 export 되어 있지 않아요.');
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 가 없어요. --env-file 로 지정하거나 환경 변수로 설정하세요.');
  const opts = { apiKey, fetch: globalThis.fetch };
  if (model || env.AI_MODEL) opts.model = model || env.AI_MODEL;
  return mod.createAnthropicExtractor(opts);
}

function mockExtractor(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return {
    async extract(input, c) {
      const hit = data[c.id];
      if (!hit)
        return { candidates: emptyCandidates(), usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, model: 'mock' };
      const candidates = hit.candidates || hit;
      return {
        candidates: { ...emptyCandidates(), ...candidates },
        usage: hit.usage || { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        model: hit.model || 'mock',
      };
    },
  };
}

// 호출 전 예상 최대 비용(USD): 입력은 글자 수 기준으로 넉넉히 잡고, 출력은 상한을 전부 쓴다고 본다.
export function estimateMaxCost(cases, { inPrice, outPrice, maxOutputTokens }) {
  const OVERHEAD_TOKENS = 2500; // 시스템 프롬프트·도구 정의
  let usd = 0;
  for (const c of cases) {
    const chars = c.messages.reduce((s, m) => s + m.text.length + 40, 0);
    usd += ((OVERHEAD_TOKENS + chars) * inPrice + maxOutputTokens * outPrice) / 1e6;
  }
  return usd;
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const fileEnv = opts.envFile ? readEnvFile(opts.envFile) : {};
  const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, AI_MODEL: process.env.AI_MODEL, ...fileEnv };
  const secret = env.ANTHROPIC_API_KEY;
  const scrub = (s) => (secret ? String(s).split(secret).join('***') : String(s));

  const all = loadCases();
  const cases = opts.split === 'all' ? all : all.filter((c) => c.split === opts.split);
  if (opts.split !== 'dev')
    console.log(`주의: test 사례는 프롬프트 조정에 쓰지 않아요. 최종 통과선 확인(${opts.split})에만 쓰세요.`);

  const cacheDir = opts.cache ? resolve(opts.cache) : null;
  const cachePath = (id) => join(cacheDir, `${id}.json`);
  const cached = (c) => cacheDir && existsSync(cachePath(c.id));
  const todo = opts.mock ? [] : cases.filter((c) => !cached(c));

  let extractor = null;
  let runDir = null;
  if (opts.mock) extractor = mockExtractor(resolve(opts.mock));
  else if (todo.length) {
    const inPrice = Number(
      env.AI_PRICE_INPUT_PER_MTOK ?? fileEnv.AI_PRICE_INPUT_PER_MTOK ?? process.env.AI_PRICE_INPUT_PER_MTOK ?? 1,
    );
    const outPrice = Number(
      env.AI_PRICE_OUTPUT_PER_MTOK ?? fileEnv.AI_PRICE_OUTPUT_PER_MTOK ?? process.env.AI_PRICE_OUTPUT_PER_MTOK ?? 5,
    );
    const est = estimateMaxCost(todo, { inPrice, outPrice, maxOutputTokens: opts.maxOutputTokens });
    console.log(
      `호출 ${todo.length}건 (캐시 ${cases.length - todo.length}건) · 예상 최대 비용 $${est.toFixed(4)} (단가 입력 $${inPrice}/출력 $${outPrice} per MTok, 출력 상한 ${opts.maxOutputTokens}) · 한도 $${opts.maxUsd}`,
    );
    if (est > opts.maxUsd) {
      throw new Error(
        `예상 최대 비용 $${est.toFixed(4)} 가 --max-usd $${opts.maxUsd} 를 넘어요. 호출하지 않고 중단합니다.`,
      );
    }
    extractor = await loadAnthropicExtractor(env, opts.model);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    runDir = resolve(HERE, 'runs', stamp);
    mkdirSync(runDir, { recursive: true });
    console.log(`원 응답 캐시: ${runDir}`);
  }

  const outputs = {};
  await pool(cases, opts.concurrency, async (c) => {
    try {
      let res;
      if (cached(c)) res = JSON.parse(readFileSync(cachePath(c.id), 'utf8'));
      else {
        res = await extractor.extract(caseToExtractInput(c), c);
        if (runDir) writeFileSync(join(runDir, `${c.id}.json`), JSON.stringify(res, null, 2));
      }
      outputs[c.id] = { actual: normalizeOutput(res.candidates || {}), usage: res.usage };
    } catch (e) {
      outputs[c.id] = { actual: {}, error: scrub(e.message) };
    }
    if (opts.verbose)
      console.log(`\n# ${c.id}\n기대: ${JSON.stringify(c.expected)}\n결과: ${JSON.stringify(outputs[c.id].actual)}`);
  });

  const res = summarizeBySplit(cases, outputs);
  console.log(
    `\nITDA 추출 평가 — ${opts.mock ? `모의 ${opts.mock}` : 'AI Extractor'}, ${opts.split}, 사례 ${cases.length}건`,
  );
  printSummary(opts.split, res.all, { perCase: true });
  if (opts.split === 'all') {
    if (res.dev) printSummary('dev', res.dev);
    if (res.test) printSummary('test', res.test);
  }
  if (opts.json) writeFileSync(opts.json, JSON.stringify({ split: opts.split, ...res }, null, 2));
  if (res.all.errors) process.exitCode = 1;
  return res;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`오류: ${e.message}`);
    process.exit(2);
  });
}
