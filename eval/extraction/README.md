# 추출 평가셋 (eval/extraction)

한국어 회의 대화에서 **결정 · 할 일 · 미결 · 일정**을 뽑아내는 추출기를 비교하기 위한 평가셋과 기준선 러너.
기준선은 규칙 기반 `public/domain.js`의 `extractDraft`(접두어 `결정:` `할 일:` `미결:` `일정:` `다음 회의:` 전용)이고, AI 추출기(계약: [`docs/contracts/ai-extraction.md`](../../docs/contracts/ai-extraction.md))는 같은 사례·같은 채점으로 비교한다.

```sh
node eval/extraction/run-baseline.mjs            # 사례별·전체 점수
node eval/extraction/run-baseline.mjs --verbose  # 기대값·결과 원문 함께 출력
node eval/extraction/run-baseline.mjs --json out.json

# AI 추출기(Extractor) 평가 — 아래 "AI 실행 도구" 참고
node --import tsx eval/extraction/run-ai.mjs --split dev
node eval/extraction/selftest.mjs                 # 평가 도구 자체 검증
```

파일: `cases.jsonl`(사례), `lib.mjs`(사례 읽기·ExtractInput 변환·채점·출력, 두 러너 공용), `run-baseline.mjs`, `run-ai.mjs`, `selftest.mjs`, `runs/`(AI 원 응답 캐시, git 제외).

## cases.jsonl 형식

한 줄에 사례 하나(JSON). 총 66건: 접두어 12(`p*`), 자연어 50(`n*`), 혼합 4(`m*`). 기존 29건(`p01`–`m04`)에 자연어 37건(`n14`–`n50`)을 더했다.

```json
{
  "id": "p05-prefix-reversal",
  "split": "dev | test",
  "referenceTime": "2026-11-03T11:10:00.000Z",
  "members": [{ "id": "minsu", "name": "김민수" }],
  "messages": [{ "id": "m1", "authorId": "seojun", "text": "...", "createdAt": "2026-11-03T11:00:00.000Z" }],
  "expected": {
    "decisions": [{ "text": "", "evidenceIds": ["m3", "m1"] }],
    "tasks": [{ "text": "", "ownerId": "minsu | [\"minsu\",\"jieun\"] | null", "dueAt": "ISO | null", "evidenceIds": [] }],
    "unresolved": [{ "text": "", "evidenceIds": [] }],
    "events": [{ "text": "", "at": "ISO | null", "hasTime": true, "location": "", "participantIds": [], "kind": "event | next", "evidenceIds": [] }]
  },
  "tags": ["prefix", "reversal"]
}
```

규칙:

- 시간대는 Asia/Seoul(+09:00). 시각은 ISO 문자열(UTC `Z`로 직렬화, 예: KST 19:00 = `10:00:00.000Z`).
- `referenceTime`은 추출을 실행하는 시각(= 마지막 메시지 시각). **상대 표현("내일", "다음 주 목요일", "모레")은 그 표현이 들어 있는 메시지의 `createdAt`(KST) 기준**으로 푼다. "다음 주 X요일" = 다음 주 월요일 기준 그 주의 X요일.
- `ownerId`는 문자열, **복수 담당자는 배열**, 담당 불명확은 `null`. `dueAt`이 불명확하면 `null`. 날짜 없이 시각만 있거나 "다음에"처럼 모호한 일정은 `at: null, hasTime: false`(= "확인 필요", 값을 지어내지 않음).
- 날짜만 있고 시각이 없는 마감은 `18:00`을 대표값으로 쓰되 채점은 날짜(KST)만 본다.
- "자정까지"는 그날이 끝나는 24시 = **다음 날 00:00**. "오전 12시"는 00:00, "오후 12시"·"정오"는 12:00.
- **번복·변경**은 최종 상태만 기대값으로 두고, 근거 ID에 최종 메시지와 이전 메시지를 모두 넣는다(최종 메시지 먼저).
- 사담은 기대값에 포함하지 않는다(`empty` 사례는 전부 빈 배열 = 아무것도 만들지 않아야 정답).
- `unresolved`는 "아직 못 정했다/다음에 다시"처럼 결정되지 않은 쟁점.
- **취소된 일정**(`cancel`)과 끝내 정해지지 않은 결정은 항목으로 만들지 않는다(취소·번복 후 최종 상태만 기대값).
- 일정 참여자를 말하지 않으면 전체 멤버로 본다. 기대값에는 **전화번호·계좌번호를 넣지 않는다**(`pii` 사례는 입력에만 있다).
- 새 자연어 사례는 존댓말·반말 혼용, 오타, 이모지, 줄임말, 한 대화 다중 결정, 번복, 긴 사담, 질문형 확인("금요일까지 할 수 있어요?" → "네"), 성명·이름만·호칭("민수 씨", "지은이") 이름 표기를 섞었다.

## 분할: dev / test

- `dev`(33건)는 프롬프트·후처리 조정에 쓴다. `test`(33건)는 **프롬프트 조정에 쓰지 않는다.** 실패 사례를 보고 프롬프트를 고치면 시험 점수가 부풀려지므로, test 는 통과선 확인(계약 "평가 기준")에만 실행하고 결과를 보고 프롬프트를 고치지 않는다. 고쳤다면 그 사례는 dev 로 옮기고 새 test 사례를 채운다.
- 접두어(`p*`)·혼합(`m*`)은 번호 순으로 번갈아, 자연어(`n*`)는 태그 분포가 비슷하도록 나눴다(자연어 dev 27 / test 27, 접두어 7 / 7, 혼합 1 / 1).
- 태그 수(dev / test): natural 27/27 · prefix 7/7 · mixed 1/1 · relative-date 14/13 · explicit-date 8/6 · time-format 8/5 · name-variants 9/7 · reversal 7/2 · chitchat 3/4 · multi-item 3/3 · multi-owner 3/3 · emoji 4/3 · slang 3/2 · question-confirm 4/2 · ambiguous-date 4/2 · ambiguous-owner 2/1 · unresolved 2/3 · pii 2/1 · schedule-change 4/1 · year-boundary 1/3 · noon-midnight 2/1 · participants 2/1 · empty 1/2 · date-format 1/1 · cancel 1/0 · long-chitchat 1/0 · honorific-mix 0/1 · timezone-edge 0/1 · typo 0/1.

## 태그

| 태그 | 의미 |
| --- | --- |
| `prefix` / `natural` / `mixed` | 접두어 형식 / 접두어 없는 자연어 / 둘이 섞임 |
| `reversal` | 결정 번복 |
| `multi-owner` | 복수 담당자 |
| `chitchat` | 사담 섞임 (`empty`는 사담만) |
| `schedule-change` | 일정 변경(날짜·시각·장소) |
| `relative-date` | 내일·모레·다음 주 목요일·금요일까지 등 |
| `explicit-date` | `11월 12일` 같은 명시 날짜 |
| `time-format` | `19:00`, `오후 9:00`, `저녁 7시` 등 표기 |
| `noon-midnight` | 정오·자정·오전/오후 12시 |
| `year-boundary` | 연말·연초 경계(12월 말 → 다음 해 1월) |
| `ambiguous-owner` / `ambiguous-date` | 담당·날짜 불명확(값을 비우고 확인 필요) |
| `participants` | 일부 참여자만 지정 |
| `typo` / `slang` / `emoji` | 오타 / 줄임말·초성 / 이모지 |
| `honorific-mix` | 존댓말·반말 섞임 |
| `multi-item` | 한 대화에 결정·할 일이 여러 개 |
| `question-confirm` | 질문형 제안에 "네"로 확정 |
| `name-variants` | 성명·이름만·호칭("민수 씨", "지은이") 혼용(마스킹 검증용) |
| `pii` | 전화번호·계좌번호 포함(기대값엔 번호 없음) |
| `unresolved` | 결정 못 한 쟁점이 기대값에 있음 |
| `long-chitchat` / `cancel` | 긴 사담 속 단일 결정 / 취소된 일정 |
| `date-format` / `timezone-edge` | `11/27`·`27일` 표기 / 자정 직후(KST) 메시지의 "내일" |

## 채점 규칙

종류(decisions/tasks/unresolved/events)별로 기대 항목과 결과 항목을 매칭한 뒤 점수를 낸다.

0. **복수 담당자**: 도메인 task 는 담당자가 하나다. 기대값의 `ownerId` 배열은 담당자별 task 로 펼쳐(같은 text·마감) 채점한다. 담당자별 task 가 모두 있으면 전부 일치, 일부만 있으면 그만큼만 일치다. 결과 쪽 배열도 같은 방식으로 펼친다.
1. **항목 매칭**: `text`를 공백·문장부호 제거 후 비교. 한쪽이 다른 쪽을 포함하거나 문자 바이그램 Dice 유사도 ≥ 0.5이면 후보. 유사도 높은 쌍부터(같으면 담당자가 같은 쌍 먼저) **1:1 그리디** 매칭. 일치 = TP, 남은 결과 = FP, 남은 기대 = FN. 정밀도·재현율·F1은 종류별·태그별·전체로 낸다. 기대·결과 모두 비어 있는 사례는 100%.
2. **근거 ID 정확도**: 일치한 항목의 `evidenceIds` 집합 Jaccard 평균.
3. **날짜 정확도**: 일치한 항목 중 — tasks는 `dueAt`의 KST 날짜(둘 다 `null`이면 정답), events는 `at` 순간과 `hasTime`이 모두 일치해야 정답. 두 가지로 보고한다: 일치 항목 기준, 그리고 **놓친 항목을 오답으로 포함**한 엄격 기준.
4. 보조 지표(일치 항목 기준): 담당자, 장소, 참여자(집합 동일), 일정 종류(`event`/`next`).
5. **모호 사례 무날조율**: `ambiguous-owner` 사례에서 기대 담당이 `null`인 task 의 결과 담당, `ambiguous-date` 사례에서 기대 날짜가 `null`인 task·event 의 결과 날짜가 `null`인 비율(일치한 항목 기준). 값을 지어내면 0.
6. split별 점수: 전체·dev·test 를 따로 집계한다. `run-baseline.mjs`는 셋 다, `run-ai.mjs`는 `--split`에 따라 낸다.

어떤 추출기든 `{decisions, tasks, unresolved, events}`(항목은 위 `expected` 필드, 계약의 후보 스키마와 호환)를 내면 같은 채점기(`lib.mjs`)를 쓸 수 있다.

## AI 실행 도구 (`run-ai.mjs`)

계약의 `Extractor`(`extract(ExtractInput) → { candidates, usage, model }`)를 사례에 실행해 같은 채점으로 split·태그별 점수를 낸다. 지표: 정밀도·재현율·F1, 날짜 정확도, 모호 사례 무날조율, 사례당 평균 비용.

```sh
# 실제 모델(서버 모듈 server/src/extract/anthropic.ts 의 createAnthropicExtractor 를 동적 import)
node --import tsx eval/extraction/run-ai.mjs --split dev --env-file .env
# 미리 만든 후보 JSON 으로 서버 모듈 없이 실행
node eval/extraction/run-ai.mjs --mock candidates.json --split all
# 이전 실행 폴더를 캐시로 재채점(이미 있는 사례는 API 호출 없음)
node --import tsx eval/extraction/run-ai.mjs --split dev --cache eval/extraction/runs/<시각>
```

| 옵션 | 설명 |
| --- | --- |
| `--split dev\|test\|all` | 평가 사례(기본 `dev`). `test`는 통과선 확인에만 쓴다 |
| `--mock <file.json>` | `{ "<사례 id>": { "candidates": {...}, "usage": {...} } }`. 후보 객체만 써도 된다. 없는 사례는 빈 출력 |
| `--env-file <path>` | `ANTHROPIC_API_KEY`(와 `AI_MODEL`, `AI_PRICE_*`)만 읽는다. 키는 출력·캐시·JSON 에 남기지 않고 오류 문구에서도 가린다 |
| `--cache <dir>` | 이전 `runs/<시각>/` 폴더. 있는 사례는 API 를 다시 부르지 않는다 |
| `--max-usd <n>` | 호출 전에 **예상 최대 비용**(입력은 글자 수+고정 오버헤드, 출력은 상한 전부, 단가 기본 $1/$5 per MTok)을 출력하고, 넘으면 호출 없이 중단한다(기본 1) |
| `--json <path>` | 요약(전체·dev·test, 태그·종류별)을 JSON 으로 저장. 메시지 본문은 넣지 않는다 |
| `--max-output-tokens`, `--model`, `--concurrency`, `--verbose` | 비용 예측용 출력 상한(2048), 모델 id, 동시 호출 수(3), 사례별 출력 |

- 원 응답(Extractor 결과)은 `eval/extraction/runs/<시각>/<사례 id>.json`에 캐시한다(`.gitignore`). 메시지 본문은 저장하지 않지만 모델 출력 후보에는 요약 문장이 들어 있으니 공유하지 않는다.
- **사례 → `ExtractInput` 변환**은 `lib.mjs`의 `caseToExtractInput(case)`다. `messages`, `context: []`, `existingTexts: []`, `members`(id·name), `referenceTime`, `timeZone: 'Asia/Seoul'`. 실제 모델 평가·프롬프트 조정 단계에서도 이 함수를 그대로 쓴다.
- 오류가 난 사례는 빈 출력으로 채점하고 종료 코드 1 로 끝난다. 설정 오류(모듈 없음, 키 없음, 비용 초과)는 종료 코드 2.
- `node eval/extraction/selftest.mjs`는 도구를 검증한다: 기대값과 같은 모의 출력은 모든 지표 100%, 빈 출력은 재현율 0, 복수 담당 규칙, 입력 변환, 비용 한도 중단, 분할 요건(60건 이상, test 25건 이상, pii 2건 이상).

## 기준선 결과 (규칙 기반 `extractDraft`, 2026-11-20, 66건)

사례를 29건에서 66건으로 늘리고 복수 담당 규칙을 바꿔(담당자별 펼침) 이전(29건, 69.0%) 수치와는 직접 비교할 수 없다. 자연어가 54건(82%)으로 늘어 F1 이 크게 내려갔다.

| 지표 | 전체(66) | dev(33) | test(33) |
| --- | --- | --- | --- |
| 항목 정밀도 | 93.5% | 87.5% | 100.0% |
| 항목 재현율 | 27.4% | 26.9% | 27.8% |
| 항목 **F1** | 42.3% | **41.2%** | **43.5%** |
| `natural` F1 (27/27건) | 13.6% | 13.6% | 13.6% |
| `prefix` F1 (14건; 7/7) | 90.6% | 87.5% | 93.8% |
| 근거 ID 정확도 | 94.8% | 89.3% | 100.0% |
| 날짜 정확도(일치 항목) | 88.2% | 87.5% | 88.9% |
| 날짜 정확도(놓친 항목 포함) | 20.0% | 17.9% | 22.2% |
| 담당자 정확도(일치 업무) | 66.7% | 50.0% | 75.0% |
| 모호 사례 무날조율 | 100%(3항목) | 100%(3항목) | 해당 항목 없음 |
| 종류별 F1 (전체) | decisions 56.0, tasks 24.0, unresolved 52.6, events 51.2 | | |

해석:

- 접두어 사례는 여전히 거의 만점이나 **자연어는 거의 전부 놓친다**(재현율 0에 가까움). AI 추출기가 넘어야 할 핵심 격차는 위 `natural` 수치다.
- 접두어 형식에서도 번복·변경(이전 항목 잔존), 복수 담당자(`null`), 연말 경계의 연도 해석이 약하다.
- 모호 사례 무날조율은 규칙 기반이 애초에 모호 항목을 거의 못 뽑아 표본이 3항목뿐이라 의미가 약하다. AI 평가에서 본격적으로 본다.
- 정밀도가 높은 것은 접두어가 있는 문장만 뽑기 때문이지 자연어 이해가 좋다는 뜻이 아니다.
