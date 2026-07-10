# CLAUDE.md — ClubChat (동아리 업무용 메신저)

> 이 파일은 모든 작업의 **단일 진실 공급원(single source of truth)**이자 에이전트 간 **계약(contract)**이다.
> 서브에이전트는 호출 간 기억이 없고 매번 새 컨텍스트로 시작하므로, 위임 프롬프트에는 이 파일에서 필요한 부분을 직접 포함시켜야 한다.
> 데이터 모델·타입·보안 규칙을 바꿀 때는 반드시 이 파일을 먼저 수정한 뒤 코드를 바꾼다.

---

## 1. 프로젝트 개요

- **무엇**: 학교 동아리·소모임을 위한 올인원 협업 공간. 위키(동아리·방 홈페이지) + 채팅 + 일정을 하나의 앱에서.
- **UX 골격**: 마이 페이지(내 동아리 목록) → 동아리 홈페이지(위키 + 스터디 방 목록) → 스터디 방 홈페이지(위키 + 채팅)
- **핵심 원칙**: 보안 우선. "이 사용자가 이 데이터를 볼 수 있는가"는 항상 서버(RLS)에서 강제한다. 클라이언트를 신뢰하지 않는다.
- **암호화 정책**: 전송구간 TLS + 저장 시 암호화 + 엄격한 RLS. **종단간 암호화(E2EE)는 도입하지 않는다.**
- **배포**: 내부 배포 (TestFlight / APK 직접 배포 / PWA)

## 2. 기술 스택

- **프런트엔드**: Expo (React Native) + TypeScript — iOS / Android / Web 단일 코드베이스. 데스크톱은 PWA(설치형), 필요 시 추후 Tauri.
- **백엔드/데이터**: Supabase (Postgres + Realtime + Auth + Storage + RLS)
  - **개발 단계**: Supabase Cloud 무료 티어 (셋업 즉시, 빠른 반복)
  - **운영 목표**: Oracle Cloud OCI Always Free(ARM Ampere A1) 위에 Docker Compose로 셀프호스팅. 데이터 주권 확보.
  - 둘은 동일 소프트웨어 → 마이그레이션 수월. 처음부터 셀프호스팅에 시간 쓰지 말 것.
- **인증**: Supabase Auth + Google OAuth
- **푸시 알림**: Expo Push Notifications (내부적으로 FCM/APNs)
- **타입 안전성**: `supabase gen types typescript` 로 DB → TS 타입 생성. 이 생성 타입이 db-schema 에이전트와 ui-builder 에이전트 사이의 인터페이스다.

## 3. 데이터 모델 (계약)

> db-schema 에이전트가 이 정의를 권위 있는 소스로 사용한다. 변경은 이 파일을 먼저 고친 뒤 마이그레이션에 반영.

| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `profiles` | id(PK, ↔auth.users), display_name, avatar_url, created_at | 사용자 프로필 |
| `clubs` | id(PK), name, owner_id(↔profiles), invite_code(unique, 8자 대문자 hex), created_at | 동아리/소모임 |
| `memberships` | id, club_id, user_id, role('owner'\|'admin'\|'member'), created_at, **unique(club_id,user_id)** | 동아리 멤버십 |
| `channels` | id(PK), club_id(nullable=DM), name, type('group'\|'dm'), owner_id(방장), join_password_hash(nullable), is_password_protected(generated, boolean), created_at | 방 |
| `channel_members` | id, channel_id, user_id, joined_at, **unique(channel_id,user_id)** | 방 참여자 |
| `invites` | id, channel_id, token(unique), created_by, expires_at(nullable), max_uses(nullable), use_count(default 0), created_at | QR·링크 초대 |
| `messages` | id(PK), channel_id, sender_id, content, type('text'\|'file'\|'image'\|'system'), created_at, edited_at(nullable), deleted_at(nullable, 소프트삭제) | 메시지 |
| `attachments` | id, message_id, storage_path, mime_type, size_bytes, width(nullable), height(nullable) | 파일·이미지 |
| `channel_reads` | id, channel_id, user_id, last_read_at, **unique(channel_id,user_id)** | 읽음표시(포인터 방식) |
| `push_tokens` | id, user_id, expo_push_token, device_info, updated_at | 푸시 토큰 |
| `events` | id(PK), channel_id(↔channels), title, description(nullable), starts_at, ends_at(nullable), location(nullable), created_by(↔profiles), created_at, updated_at | 일정 |
| `event_responses` | id(PK), event_id(↔events), user_id(↔profiles), status('going'\|'not_going'\|'maybe'), responded_at, **unique(event_id,user_id)** | 참석 응답 |
| `pages` | id(PK), owner_type('club'\|'channel'), owner_id(uuid), title(nullable), blocks(jsonb, 블록 배열), created_by(↔profiles), created_at, updated_at, **unique(owner_type,owner_id)** | 동아리·방 홈페이지 위키 |

**읽음표시**는 메시지마다 행을 만들지 않고 `channel_reads.last_read_at` 포인터 1개로 처리한다(소규모 효율).

**일정**: `events(channel_id, starts_at)` 인덱스로 방별 시간순 조회. 일정 삭제 시 `event_responses`는 ON DELETE CASCADE로 함께 삭제.

**위키 페이지**: 동아리당·방당 1개 페이지(unique). `blocks` 배열은 `{ type, content, ... }` 형태의 JSON 블록을 순서대로 저장한다.
블록 타입: `heading1`, `heading2`, `paragraph`, `image`(storage_path·caption), `link`(url·title·description), `divider`.
페이지가 없으면 빈 상태로 "편집 시작" CTA를 표시하고, 첫 편집 시 INSERT 한다.

## 4. 보안 모델 (계약)

- **앱 로그인**: Google OAuth만. 로그인 안 한 사용자는 어떤 데이터도 접근 불가.
- **방 입장 — 초대 링크/QR**: `invites`에 토큰 발급(만료시각·최대 사용횟수 포함). QR은 초대 링크를 인코딩한 것일 뿐. 토큰 검증 통과 시에만 `channel_members`에 등록.
- **방 입장 — 비밀번호**: `channels.join_password_hash`에 **해시(argon2 또는 bcrypt)** 저장. 원문 저장 금지. 입력값을 해시 비교.
- **진짜 경계는 RLS**: 입장 UI는 편의일 뿐. 메시지/첨부 SELECT는 반드시 `channel_members`에 속한 사용자만 가능하도록 RLS로 강제. 메시지 UPDATE/DELETE는 작성자 본인만.
- **전송/저장**: 모든 통신 TLS. Storage 버킷은 비공개 + 서명 URL. 셀프호스팅 시 디스크 암호화 권장.
- **금지**: 개인정보를 URL 쿼리스트링에 넣지 않기. 클라이언트 측 권한 판단에 의존하지 않기.

**일정 RLS**
- `events` SELECT: 요청자가 해당 `channel_id`의 `channel_members`에 속한 경우만.
- `events` INSERT: 해당 방의 멤버만. `created_by`는 `auth.uid()`로 강제.
- `events` UPDATE/DELETE: 작성자 본인(`created_by = auth.uid()`)만.
- `event_responses` SELECT: 그 일정이 속한 방의 멤버 또는(club 스코프 일정이면) 그 동아리 멤버.
- `event_responses` INSERT/UPDATE/DELETE: 본인 응답만(`user_id = auth.uid()`). 타인의 응답 변경 불가.

**위키 페이지 RLS**
- `pages` SELECT:
  - `owner_type='club'` → 해당 club의 `memberships`에 속한 사용자만.
  - `owner_type='channel'` → 해당 channel의 `channel_members`에 속한 사용자만.
- `pages` INSERT: owner_type별 멤버만. `created_by`는 `auth.uid()`로 강제.
- `pages` UPDATE: 동아리 페이지는 `memberships.role IN ('owner','admin')`만. 방 페이지는 `channels.owner_id = auth.uid()` 또는 방 소속 admin만.
- `pages` DELETE: UPDATE와 동일 조건.

## 5. 기능 범위

**화면 흐름 (네비게이션 구조)**
```
로그인
  └─ 마이 페이지 (/(app)/index)
       ├─ 내 동아리 카드 목록
       ├─ "+" 버튼 → 초대 코드 입력 → 동아리 가입
       └─ 동아리 카드 탭 → 동아리 홈페이지 (/(app)/clubs/[id]/home)
            ├─ 동아리 위키 (블록 에디터, admin/owner만 편집)
            ├─ 스터디 방 목록 (기존 channels)
            └─ 스터디 방 탭 → 스터디 방 홈페이지 (/(app)/channels/[id]/home)
                 ├─ 방 위키 (블록 에디터, 방장만 편집)
                 ├─ "채팅" 버튼 → 채팅 화면 (/(app)/channels/[id]/chat)
                 └─ "일정" 버튼 → 일정 목록 (/(app)/channels/[id]/events/list)
```

**완료된 기능**: 구글 로그인, 동아리 생성/가입, 방 생성, 초대 링크·QR·비밀번호 입장, 실시간 텍스트 채팅, 파일·이미지 공유, 읽음표시, 입력중 표시(Presence), 메시지 검색, 일정 CRUD + 참석 응답, PWA 설정.

**구현 예정 (6단계)**:
- 마이 페이지 UX 개편: 동아리 카드 그리드, "+" 버튼 → 초대 코드 입력 모달(현재 별도 화면 → 인라인)
- 동아리 홈페이지(`clubs/[id]/home`): 블록 에디터 위키 + 하단 스터디 방 목록
- 스터디 방 홈페이지(`channels/[id]/home`): 블록 에디터 위키 + 채팅·일정 바로가기 버튼
- 블록 에디터: H1/H2/본문 텍스트, 이미지(Storage), 링크 카드, 구분선. 인라인 툴바.

**구현 예정 (7단계)**:
- 메시지 수정·삭제 UI, 프로필 편집(이름·아바타), 방 퇴장·동아리 탈퇴
- 앱 전반 UX 완성도: 빈 상태, 에러 처리, 로딩 스켈레톤

**2차(이후)**: 일정 시작 전 푸시 알림, 반복 일정, 캘린더 뷰(월/주), 외부 캘린더(iCal) 내보내기, 온라인 표시.
**범위 밖(현재)**: E2EE, 일정별 첨부파일, 화상회의 링크 자동 생성.
**음성·영상 통화**: 직접 구현하지 않는다. 추후 Daily.co / Livekit 등 외부 서비스 임베드 방식으로 도입 예정. WebRTC 자체 운영(시그널링·TURN 서버)은 하지 않는다.

## 6. 코딩 컨벤션

- 언어: TypeScript (strict). 프런트·백 공유 타입은 생성된 Supabase 타입 사용.
- 파일/폴더: 기능 단위(feature-based) 구조. `src/features/<도메인>/...`
- 네이밍: 컴포넌트 PascalCase, 함수/변수 camelCase, DB 컬럼 snake_case.
- 에러 처리: 모든 Supabase 호출은 에러 분기 처리. 사용자에겐 일반화된 메시지, 로그엔 상세.
- 비밀값: `.env` (커밋 금지). 키는 코드에 하드코딩 금지.

## 7. 멀티 에이전트 운영 규칙

- **계약 우선**: 작업을 나누기 전에 이 CLAUDE.md(특히 §3 데이터 모델, §4 보안)를 확정한다. 충돌의 90%는 계약 부재에서 온다.
- **좁은 에이전트만**: 한 에이전트 = 한 가지 일. "모든 걸 하는 developer 에이전트"는 안티패턴. 정의된 서브에이전트는 `.claude/agents/` 참고.
- **스키마 소유권**: DB 스키마·RLS는 `db-schema` 에이전트만 변경한다. 다른 에이전트는 생성된 타입을 읽기만 한다.
- **자기 완결 프롬프트**: 서브에이전트는 기억이 없다. 위임 시 파일 경로·결정사항·관련 스펙을 프롬프트에 직접 넣는다.
- **출력 격리**: 테스트·로그처럼 출력이 많은 작업은 `tester` 에이전트에 맡겨 실패 요약만 받는다.
- **병렬 기능 작업**: 기능 단위로 동시에 진행할 땐 git worktree 또는 Agent Teams로 세션을 분리한다.
- **비용 인지**: 서브에이전트 적극 사용 시 단일 세션 대비 토큰을 최대 ~7배까지 쓸 수 있다.

## 8. 빌드 로드맵

0. **셋업** ✅: 레포, Expo 초기화, Supabase Cloud 프로젝트, 이 CLAUDE.md + 에이전트 정의, 구글 OAuth 설정
1. **인증·조직** ✅: 구글 로그인, 프로필, 동아리 생성/가입/역할
2. **방·메시징** ✅: 방 생성, 초대 토큰/QR/비밀번호 입장, 실시간 텍스트 채팅
3. **읽음·파일** ✅: `channel_reads` 포인터, Storage 버킷·업로드·서명 URL
4. **일정** ✅: 일정 CRUD, 참석 응답 집계, 일정 RLS
5. **프레즌스·검색·PWA** ✅: 입력중 표시(Realtime Presence), 메시지 전문 검색, 데스크톱 PWA 패키징
6. **위키 홈페이지**: `pages` 테이블 + RLS, 블록 에디터 컴포넌트(H1/H2/본문/이미지/링크/구분선), 동아리 홈(`clubs/[id]/home`) + 스터디 방 홈(`channels/[id]/home`), 마이 페이지 UX 개편(카드 그리드 + "+" 모달)
7. **배포 전 필수기능**: 메시지 수정·삭제 UI, 프로필 편집(이름·아바타), 방 퇴장·동아리 탈퇴, 앱 전반 UX 완성도(빈 상태·에러 처리·로딩 스켈레톤)
8. **운영 이전**: OCI A1에 Supabase 셀프호스팅 마이그레이션, TLS·백업·방화벽 하드닝
9. **모바일 배포 + 푸시**: EAS Build로 TestFlight(iOS)/APK(Android) 배포, Expo Push 알림 Edge Function 연동, 딥링크 처리

## 9. OCI 셀프호스팅 메모 (6단계용)

- 인스턴스: Ubuntu(aarch64), Ampere A1, **On-demand capacity** 선택(선점 방지).
- 무료 한도는 콘솔에서 직접 확인(4 OCPU/24GB ↔ 2 OCPU/12GB 변경 보고 있음). 둘 다 소규모엔 충분.
- 서울 리전 우선, 용량 없으면 인접 리전. 신용카드 본인확인 필요(한도 내 무과금).
- 하드닝: OS 방화벽 + OCI 보안목록 포트 최소 개방, 리버스 프록시(SSL), DB 자동 백업, 인스턴스 유휴 회수 방지.
