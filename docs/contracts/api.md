# API 계약 v0.1

기본 경로 `/v1`. 요청·응답은 JSON(UTF-8). 시각은 ISO 8601 UTC 문자열, 조직 시간대는 `organizations.time_zone`(기본 `Asia/Seoul`).

## 공통 규칙

- **인증**: 세션 쿠키 `itda_session`. 없거나 만료되면 `401 unauthenticated`.
- **CSRF**: `GET`/`HEAD` 외 요청은 `Origin`이 `APP_ORIGIN`과 같아야 한다. 아니면 `403 bad_origin`.
- **낙관적 동시성**: 캡슐을 바꾸는 모든 명령은 `expectedRevision`을 받는다. DB의 현재 `capsules.revision`과 다르면 아무것도 바꾸지 않고 `409 revision_conflict`와 최신 `revision`을 돌려준다.
- **멱등성**: 변경 요청은 `Idempotency-Key` 헤더(UUID)를 필수로 받는다. 같은 사용자·같은 키의 재요청은 처음 응답을 그대로 돌려준다(24시간 보관). 키 없이 오면 `400 idempotency_key_required`.
- **오류 형식**: `{ "error": { "code": "revision_conflict", "message": "사용자에게 보여줄 한국어 문장", "details": {} } }`
- **권한**: 비참여자에게는 캡슐의 존재도 드러내지 않는다. 읽기 권한이 없으면 `404 not_found`, 읽을 수는 있지만 명령 권한이 없으면 `403 forbidden`.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `invalid_request`, `idempotency_key_required` | 형식 오류 |
| 401 | `unauthenticated` | 로그인 필요 |
| 403 | `forbidden`, `bad_origin` | 권한·출처 거부 |
| 404 | `not_found` | 없거나 읽을 권한 없음 |
| 409 | `revision_conflict` | 오래된 화면에서 보낸 변경 |
| 422 | `domain_rule` | 도메인 규칙 위반(예: 하위 캡슐 미확정). `message`는 도메인 함수의 오류 문구 |
| 429 | `rate_limited` | 요청 과다 |

## 인증

| 메서드·경로 | 설명 |
| --- | --- |
| `GET /v1/auth/kakao/start` | `state` 생성·저장 후 카카오 인가 URL로 302 |
| `GET /v1/auth/kakao/callback?code&state` | `state` 검증 → 토큰 교환 → `users` upsert → 세션 발급 → `APP_ORIGIN`으로 302 |
| `POST /v1/auth/dev-login` `{ "userId" }` | `AUTH_DEV_LOGIN=1`일 때만 존재. 테스트용 |
| `POST /v1/auth/logout` | 세션 폐기 |
| `GET /v1/me` | `{ user, organizations: [{ id, name, role }] }` |

카카오 액세스 토큰은 로그인 처리 직후 버리고 저장하지 않는다.

## 조직·초대

| 메서드·경로 | 권한 | 설명 |
| --- | --- | --- |
| `POST /v1/organizations` `{ name, timeZone? }` | 로그인 | 생성자는 `admin` |
| `GET /v1/organizations/:orgId/members` | 조직 멤버 | `[{ userId, name, teams, grade, role }]` |
| `PATCH /v1/organizations/:orgId/members/:userId` `{ teams?, grade?, role? }` | admin | 역할 변경은 마지막 admin 제거 금지 |
| `POST /v1/organizations/:orgId/invites` `{ expiresInHours ≤ 168, maxUses? }` | admin | `{ code, url, expiresAt }`. 코드는 서버 생성 난수 |
| `DELETE /v1/organizations/:orgId/invites/:inviteId` | admin | 즉시 무효 |
| `POST /v1/invites/:code/accept` | 로그인 | 만료·취소·횟수 초과 시 `404 not_found` |

## 캡슐 조회

| 메서드·경로 | 설명 |
| --- | --- |
| `GET /v1/organizations/:orgId/capsules?filter=all\|needs_my_confirmation\|waiting\|children\|scheduled` | 내가 읽을 수 있는 캡슐 목록. 각 항목은 `{ id, title, status, revision, parentId, previousId, lastMessage, unreadCount, blockers }` |
| `GET /v1/capsules/:id` | 캡슐 전체(아래 "캡슐 표현"). 메시지는 최근 50개만 |
| `GET /v1/capsules/:id/messages?before=<messageId>&limit≤100` | 과거 메시지 페이지 |
| `GET /v1/organizations/:orgId/calendar?from&to` | 내가 참여한 확정 캡슐의 일정. 확정된 정정 캡슐이 있는 원본 캡슐의 일정은 제외한다(도메인 `getConfirmedEvents`와 같은 규칙) |
| `GET /v1/events/:eventId.ics` | 일정 1건의 ICS. `makeICS` 결과 |
| `POST /v1/capsules/:id/read` `{ lastMessageId }` | 읽음 포인터 갱신. 멱등, revision 불필요 |

**캡슐 표현**은 브라우저 저장소 v3의 meeting 객체와 같은 필드 이름을 쓴다(`memberIds`, `confirmationMemberIds`, `draft`, `draftHistory`, `confirmationRecords`, `agendaStatuses`, `policyHistory`, `delegationDisposition`, `conclusions`, `carryover`, `revision`, `memberSetVersion`, `conclusionVersion` 등). 기존 화면 코드가 그대로 렌더링할 수 있게 하기 위함이다. 하위 캡슐의 `messages`/`sourceMessages`는 그 하위 캡슐 참여자에게만 포함한다. 상위 참여자는 `conclusions`만 본다.

## 캡슐 명령

```
POST /v1/capsules/:id/commands/:command
Idempotency-Key: <uuid>
{ "expectedRevision": 12, "payload": { ... } }

200 { "capsule": <캡슐 표현>, "affected": [{ "id": "<부모·후속 캡슐 id>", "revision": 4 }] }
```

생성 명령만 경로가 다르다: `POST /v1/organizations/:orgId/capsules` `{ title, memberIds, description?, startsAt? }`.

| command | payload | 대응 도메인 함수 |
| --- | --- | --- |
| `send-message` | `{ text }` | `sendMessage` |
| `delegate` | `{ title, messageIds, memberIds }` | `delegate` (하위 캡슐 생성, 응답 `affected`에 새 id) |
| `extract-draft` | `{}` | `extractDraft` |
| `update-draft-item` | `{ type, item }` | `updateDraftItem` |
| `remove-draft-item` | `{ type, id }` | `removeDraftItem` |
| `restore-draft` | `{ revision }` | `restoreDraft` |
| `resume-conversation` | `{}` | `resumeConversation` |
| `confirm` | `{}` | `confirmMeeting` (확인자 = 세션 사용자) |
| `set-confirmation-members` | `{ memberIds, reason }` | `setConfirmationMembers` |
| `mark-member-departed` | `{ memberId, reason }` | `markMemberDeparted` |
| `transfer-facilitator` | `{ memberId, reason }` | `transferFacilitator` |
| `set-agenda-status` | `{ agendaId, status, reason, targetEventIds? }` | `setAgendaStatus` |
| `dispose-child` | `{ childId, status, reason, followUpId? }` | `disposeChild` |
| `create-correction` | `{ reason }` | `createCorrection` |
| `start-scheduled` | `{}` | `startScheduled` |

`confirm`이 마지막 확인이면 같은 트랜잭션에서 캡슐 확정, 일정 저장(`sourceId` 기준 중복 방지), 상위 결론 합류, 다음 캡슐 예약·승계, 알림 생성까지 처리한다. 중간에 실패하면 전부 되돌린다.

클라이언트가 보내는 `profileId`, `actorId`, `authorId`는 무시한다. 행위자는 항상 세션 사용자다.

## WebSocket

`GET /v1/ws` (세션 쿠키·Origin 검사 후 업그레이드)

| 방향 | 메시지 |
| --- | --- |
| 클라이언트 → 서버 | `{ "type": "subscribe", "capsuleIds": ["..."] }` 읽기 권한이 있는 것만 구독, 나머지는 조용히 무시 |
| 서버 → 클라이언트 | `{ "type": "capsule.changed", "capsuleId", "revision" }` |
| 서버 → 클라이언트 | `{ "type": "calendar.changed", "orgId" }`, `{ "type": "notification", "id", "text" }` |

알림은 커밋 이후에만 보낸다(`outbox` 테이블 → 발송). 재접속한 클라이언트는 구독 중인 캡슐을 HTTP로 다시 조회한다.

## 예약 작업

| kind | 실행 내용 |
| --- | --- |
| `activate-scheduled` | `startsAt`이 지난 `scheduled` 캡슐을 `activateScheduled`로 열기 |
| `cleanup` | 만료 세션·멱등 키·초대 정리(매시간) |

작업은 `run_at`, `attempts`, `last_error`를 기록하고 5회 실패 시 `failed`로 멈춘다.

## 클라이언트 저장소 어댑터

`public/`은 `createBrowserRepository`와 같은 인터페이스의 `createRemoteRepository({ baseUrl, fetch, WebSocket })`를 추가한다. 화면 코드는 저장소 종류를 몰라야 한다. 로컬 데모 모드(`?demo=1`)와 연습 모드(`?practice=1`)는 기존 브라우저 저장소를 그대로 쓴다.
