# 일정(Schedule) 기능 명세서 — ClubChat

> 이 문서는 일정 기능의 설계 계약이다. 구현 전에 이 내용을 `CLAUDE.md`의 해당 절(§3 데이터 모델, §4 보안, §5 기능 범위)에 합친 뒤 빌드한다.
> 새 기능은 "CLAUDE.md 먼저 수정 → 계획 확인 → 구현 → 커밋" 순서로 진행한다.

---

## 0. 기능 추가 워크플로 (모든 신규 기능 공통)

1. **계약 먼저**: 즉흥 채팅으로 시키지 말고, 기능을 `CLAUDE.md`(데이터 모델·기능 범위·보안)에 먼저 반영한다. 에이전트들은 이 계약을 보고 일하므로, 계약이 없으면 서로 어긋난다.
2. **계획 확인 후 구현**: "바로 코드 짜지 말고 어떤 테이블·화면이 필요한지 계획만 보여주고 내 확인을 받고 진행해"라고 지시한다.
3. **보안 필수**: 데이터에 접근하는 기능은 반드시 RLS 정책을 함께 만든다. "이 방 멤버만 접근 가능하게 RLS도 같이 넣어줘"를 항상 덧붙인다.
4. **한 기능씩 + 커밋**: 기능 하나를 완성하고 `git add . && git commit -m "..."` 한 뒤 다음으로 넘어간다. 꼬이면 직전 커밋으로 되돌린다.

## 1. 개요 / 목적

- 동아리의 방(채널) 단위로 일정을 만들고, 멤버가 참석 여부를 응답하는 기능.
- 업무용이므로 "해당 방 멤버만 보고, 방장·작성자만 수정"이라는 보안 경계를 지킨다.
- 일정은 방(channel)에 소속된다. 동아리 전체 일정이 필요하면 모두가 속한 공지용 방을 쓰면 된다(클럽 단위 직접 소속은 추후 확장).

## 2. 데이터 모델 (→ CLAUDE.md §3에 추가)

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `events` | id(PK), channel_id(↔channels), title, description(nullable), starts_at, ends_at(nullable), location(nullable), created_by(↔profiles), created_at, updated_at | 일정 |
| `event_responses` | id(PK), event_id(↔events), user_id(↔profiles), status('going'\|'not_going'\|'maybe'), responded_at, **unique(event_id,user_id)** | 참석 응답 |

- 인덱스: `events(channel_id, starts_at)` — 방별 일정을 시간순으로 빠르게 조회.
- 일정 삭제 시 `event_responses`는 함께 삭제(ON DELETE CASCADE).

## 3. 보안 / RLS (→ CLAUDE.md §4 연동)

진짜 경계는 RLS다. 모든 테이블에 RLS를 켜고 아래 정책을 명시한다.

**events**
- SELECT: 요청자가 `event.channel_id`의 `channel_members`에 속한 경우에만.
- INSERT: 해당 방의 멤버만. `created_by`는 본인(auth.uid())으로 강제.
- UPDATE / DELETE: 작성자 본인(`created_by = auth.uid()`) **또는** 그 방의 방장(`channels.owner_id`)만.

**event_responses**
- SELECT: 그 일정이 속한 방의 멤버만.
- INSERT / UPDATE / DELETE: 본인 응답만(`user_id = auth.uid()`). 남의 참석 여부를 바꿀 수 없다.

## 4. 기능 범위 (→ CLAUDE.md §5에 추가)

- **MVP(1차)**: 일정 생성·수정·삭제(방장/작성자), 방 멤버의 일정 목록·상세 조회, 참석/불참/미정 응답, 응답 집계 표시.
- **추후(2차)**: 일정 시작 전 푸시 알림, 반복 일정, 캘린더 뷰(월/주), 외부 캘린더(iCal) 내보내기.
- **범위 밖(현재)**: 일정별 첨부파일, 화상회의 링크 자동 생성.

## 5. 화면 (UI)

- **일정 목록**: 현재 방의 다가오는 일정을 시간순으로. 각 항목에 제목·날짜·내 응답 상태.
- **일정 상세**: 제목·일시·장소·설명, 참석자 집계(참석 N / 불참 N / 미정 N), 내 응답 버튼(참석/불참/미정).
- **일정 생성·수정**: 제목·시작/종료 일시·장소·설명 입력. 방장 또는 작성자에게만 수정/삭제 버튼 노출(단, 실제 차단은 RLS가 담당. UI는 편의일 뿐).
- iOS·Android·Web 모두에서 동작(react-native-web 호환 유의), 로딩·에러·빈 상태 처리.

## 6. 푸시 알림 연동 (2차)

- 일정 생성 시 방 멤버에게, 시작 전(예: 1시간 전)에 응답자에게 Expo Push 발송.
- 기존 §푸시 구조(Database Webhook / Edge Function → Expo Push) 재사용. realtime-chat 에이전트 담당.

## 7. 에이전트 분담

- **db-schema**: `events`·`event_responses` 테이블, 인덱스, CASCADE, 위 RLS 정책 작성. 이후 `supabase gen types typescript`로 타입 재생성.
- **ui-builder**: 5절의 화면들. 데이터는 정해진 훅/데이터 레이어로만 접근.
- **realtime-chat**: (2차) 일정 변경 실시간 반영 및 푸시 알림 트리거.
- **tester**: RLS 검증 — "방 멤버는 조회 가능 / 비멤버는 차단", "작성자·방장만 수정 / 타인은 차단", "본인 응답만 변경" 의 허용·차단을 모두 테스트.
- **reviewer**: 일정 관련 변경의 RLS 우회 가능성·권한 누락 점검.

## 8. 클로드 코드에 줄 지시문 (복붙용)

**1단계 — 계약 반영 + 계획 확인**
```
이 저장소의 SPEC-schedule.md를 읽고, 그 내용을 CLAUDE.md의
§3 데이터 모델 / §4 보안 / §5 기능 범위에 합쳐서 CLAUDE.md를 수정해줘.
그다음 구현 계획(만들 테이블·RLS 정책·화면 목록)만 요약해서 보여주고,
내 확인을 받기 전에는 코드를 작성하지 마.
```

**2단계 — DB부터 구현 (확인 후)**
```
좋아, 진행해. 먼저 db-schema 에이전트로 events와 event_responses 테이블,
인덱스, ON DELETE CASCADE, 그리고 SPEC-schedule.md §3의 RLS 정책을 마이그레이션으로 만들어줘.
끝나면 supabase gen types typescript로 타입을 재생성하고 변경 요약을 보여줘.
```

**3단계 — UI 구현**
```
ui-builder 에이전트로 SPEC-schedule.md §5의 일정 목록·상세·생성/수정 화면을 만들어줘.
데이터는 기존 데이터 레이어를 통해 접근하고, 로딩·에러·빈 상태를 처리해.
```

**4단계 — 검증**
```
tester 에이전트로 SPEC-schedule.md §3의 RLS를 검증하는 테스트를 작성·실행해줘.
허용되어야 할 접근과 차단되어야 할 접근을 모두 테스트하고, 실패한 것만 요약해줘.
```

## 9. 구현 순서 / 커밋 전략

1. 계약 반영(CLAUDE.md 수정) → 커밋 `"명세: 일정 기능 추가"`
2. DB 스키마 + RLS → 커밋 `"일정: 테이블과 RLS 추가"`
3. UI 화면 → 커밋 `"일정: 목록/상세/생성 화면 추가"`
4. 테스트 통과 확인 → 커밋 `"일정: RLS 테스트 추가"`
5. (2차) 푸시·캘린더 뷰는 별도 기능으로 분리해 진행
