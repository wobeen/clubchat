# 추출 평가셋 (eval/extraction)

한국어 회의 대화에서 **결정 · 할 일 · 미결 · 일정**을 뽑아내는 추출기를 비교하기 위한 평가셋과 기준선 러너.
현재 기준선은 규칙 기반 `public/domain.js`의 `extractDraft`(접두어 `결정:` `할 일:` `미결:` `일정:` `다음 회의:` 전용)이며, 이후 AI 어댑터가 같은 사례·같은 채점으로 비교된다.

```sh
node eval/extraction/run-baseline.mjs            # 사례별·전체 점수
node eval/extraction/run-baseline.mjs --verbose  # 기대값·결과 원문 함께 출력
node eval/extraction/run-baseline.mjs --json out.json
```

## cases.jsonl 형식

한 줄에 사례 하나(JSON). 총 29건: 접두어 12(`p*`), 자연어 13(`n*`), 혼합 4(`m*`).

```json
{
  "id": "p05-prefix-reversal",
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

## 채점 규칙

종류(decisions/tasks/unresolved/events)별로 기대 항목과 결과 항목을 매칭한 뒤 점수를 낸다.

1. **항목 매칭**: `text`를 공백·문장부호 제거 후 비교. 한쪽이 다른 쪽을 포함하거나 문자 바이그램 Dice 유사도 ≥ 0.5이면 후보. 유사도 높은 쌍부터 **1:1 그리디** 매칭. 일치 = TP, 남은 결과 = FP, 남은 기대 = FN. 정밀도·재현율·F1은 종류별·태그별·전체로 낸다. 기대·결과 모두 비어 있는 사례는 100%.
2. **근거 ID 정확도**: 일치한 항목의 `evidenceIds` 집합 Jaccard 평균.
3. **날짜 정확도**: 일치한 항목 중 — tasks는 `dueAt`의 KST 날짜(둘 다 `null`이면 정답), events는 `at` 순간과 `hasTime`이 모두 일치해야 정답. 두 가지로 보고한다: 일치 항목 기준, 그리고 **놓친 항목을 오답으로 포함**한 엄격 기준.
4. 보조 지표(일치 항목 기준): 담당자(집합 동일), 장소, 참여자(집합 동일), 일정 종류(`event`/`next`).

AI 어댑터는 `run-baseline.mjs`의 `runRuleBased(case)`와 같은 모양(`{decisions, tasks, unresolved, events}`, 항목은 위 `expected` 필드)을 반환하면 같은 채점기를 쓸 수 있다.

## 기준선 결과 (규칙 기반 `extractDraft`, 2026-11-19)

| 지표 | 값 |
| --- | --- |
| 항목 정밀도 / 재현율 / F1 | 93.5% / 54.7% / 69.0% |
| 근거 ID 정확도 | 94.8% |
| 날짜 정확도(일치 항목) / (놓친 항목 포함) | 88.2% / 44.1% |
| 담당자 정확도(일치 업무) | 66.7% |
| `prefix` 태그 F1 | 93.5% |
| `natural` 태그 F1 | 33.3% (자연어 13건 중 `n13` 사담 전용 1건만 만점, 나머지는 0건 추출) |
| `mixed` F1 | 85.7% |
| 종류별 F1 | decisions 77.8, tasks 60.0, unresolved 71.4, events 68.7 |

해석:

- 접두어 사례는 거의 만점이나 **번복·변경**은 이전 항목이 그대로 남아 정밀도가 떨어진다(`p05`, `p11`: 같은 일정이 두 번, 날짜 0%).
- **자연어 사례는 거의 전부 놓친다**(재현율 0). 이것이 AI 어댑터가 넘어야 할 핵심 격차다.
- 접두어 형식에서도 **복수 담당자**(`김민수, 이지은`)는 담당자를 `null`로 만들고, **연말 경계**의 `1월 5일`은 메시지 연도(2026)로 해석해 틀린다(`p08`: 날짜 50%).
- 점수는 규칙 기반이 접두어 형식이라서 높은 것이지 자연어 이해가 좋다는 뜻이 아니다. 이후 AI 어댑터의 비교 기준선은 위 표의 전체·`natural` 수치다.
