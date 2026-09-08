# CLAUDE.md — ClubChat (동아리 업무용 메신저)

> 이 파일은 모든 작업의 **단일 진실 공급원(single source of truth)**이자 에이전트 간 **계약(contract)**이다.
> 서브에이전트는 호출 간 기억이 없고 매번 새 컨텍스트로 시작하므로, 위임 프롬프트에는 이 파일에서 필요한 부분을 직접 포함시켜야 한다.
> 데이터 모델·타입·보안 규칙을 바꿀 때는 반드시 이 파일을 먼저 수정한 뒤 코드를 바꾼다.

---

## 1. 프로젝트 개요

- **무엇**: 학교 동아리·소모임을 위한 올인원 협업 공간. 위키(동아리·방 홈페이지) + 채팅 + 일정을 하나의 앱에서.
- **UX 골격**: 마이 페이지(내 동아리 목록) → 동아리 홈페이지(위키 + 스터디 방 목록) → 스터디 방 홈페이지(위키 + 채팅)
- **반응형 워크스페이스 셸 (진행 중)**: 위 3단계 네비게이션을 하나의 반응형 셸로 재구성 중. 넓은 화면(웹/태블릿)은 아이콘 레일+목록+본문(+상세패널)을 나란히, 좁은 화면(모바일)은 같은 구조를 드릴다운으로 보여준다. 상세 계획·진행상황은 §5 참고.
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

**화면 흐름 (네비게이션 구조) — 현재 실제 구현**

레거시 경로(`/(app)/index`, `/clubs/[id]`, `/channels/[id]/home`)는 전부 아래 `/w` 셸 주소로 **리다이렉트되는 얇은 어댑터**로 남아있다(북마크·딥링크 호환용). 실제 화면은 `/w` 아래에 있다.

```
로그인
  └─ /(app)/w                         depth 0 — 동아리 미선택
       ├─ 아이콘 레일(넓은 화면만): 동아리 아바타 목록 + "+"(초대코드 가입 시트) + 프로필 아바타(편집 시트)
       ├─ 동아리 목록 패널(ClubListPane)
       └─ 동아리 선택 → /w/[clubId]                    depth 1
            ├─ 동아리 위키(usePage/WikiViewer/WikiEditor, admin/owner만 편집) + 초대코드 복사
            ├─ 스터디 방 목록(RoomListPane)
            └─ 방 선택 → /w/[clubId]/[roomId]           depth 2
                 ├─ 방 위키(방장만 편집) + 다가오는 일정 미리보기
                 ├─ "채팅 열기" → /(app)/channels/[id]/chat (아직 별도 풀스크린 라우트, 셸 본문 통합 전)
                 └─ "일정" → /(app)/channels/[id]/events/list
```

넓은 화면(≥768px, `useBreakpoint`)은 레일+목록+본문을 나란히, 좁은 화면은 depth별로 한 패널씩 드릴다운(뒤로가기=상위 depth로 이동)한다. 상세 아키텍처·라우팅 근거는 `src/features/shell/`와 계획 문서(`~/.claude/plans/async-brewing-conway.md`, 세션 종료 후에도 남아있음) 참고.

**완료된 기능**: 구글 로그인, 동아리 생성/가입, 방 생성, 초대 링크·QR·비밀번호 입장, 실시간 텍스트 채팅, 파일·이미지 공유, 읽음표시, 입력중 표시(Presence), 메시지 검색, 일정 CRUD + 참석 응답, PWA 설정, **반응형 워크스페이스 셸 Phase 0+1**(아래 참고).

**반응형 워크스페이스 셸 — 진행 상황**:
- ✅ Phase 0(기반): 디자인 토큰 통일(`src/features/ui/theme.ts`), `useAuth`를 Context/Provider화(`src/features/auth/AuthProvider.tsx`, 시그니처 불변), `src/lib/realtime.ts`(토픽 이름 빌더), 채팅 화면을 `src/features/chat/`로 분해(`ChatScreen`이 prop만 받고 `useRouter`/`useLocalSearchParams` 직접 호출 안 함).
- ✅ Phase 1(셸 골격): `/w` 네임스페이스 + `src/features/shell/`(레일·목록 패널·반응형 프리미티브·`useWorkspaceNavigation`/`useWorkspaceData`), 레거시 경로 리다이렉트.
- ✅ Phase 2(채팅 통합): `/w/[clubId]/[roomId]`에 `view` 쿼리 파라미터(`home`|`chat`) 추가(`useWorkspaceNavigation`의 `roomView`/`openChat`/`closeChat`). `view=chat`이면 본문이 기존 위키+일정 홈 대신 `ChatScreen`(자체 헤더로 뒤로가기/검색/일정 버튼 포함)을 렌더링. 넓은 화면에서 `view=chat`일 때만 오른쪽에 `RoomDetailPane`(멤버 목록 + 위키 미리보기 + 다가오는 일정, `src/features/shell/RoomDetailPane.tsx` + `useChannelMembers.ts`) 추가 표시. 기존 풀스크린 라우트(`channels/[id]/chat.tsx`)는 딥링크 호환용으로 유지하되 "채팅 열기" 버튼은 더 이상 그쪽으로 push하지 않음.
- ✅ Phase 3(위키 에디터): `WikiEditor`(`src/features/wiki/WikiEditor.tsx`)를 인라인/시트 겸용으로 분리 — 넓은 화면은 위키 카드 안에서 그대로 펼쳐지는 인라인 편집(셸 유지), 컴팩트 화면은 기존 풀스크린 Modal 시트 유지. 상태/저장 로직은 하나의 컴포넌트에서 공유하고 `useBreakpoint()`로 렌더만 분기. 부수적으로 `w/[clubId]/index.tsx`(동아리 홈)에 `<WikiEditor>`가 아예 렌더링되지 않아 "편집" 버튼이 동작하지 않던 기존 버그도 함께 고침(방 홈에는 있었는데 동아리 홈에는 빠져 있었음). "위키·일정 상세패널"은 Phase 2의 `RoomDetailPane`으로 이미 충족.
- ✅ Phase 4(관리 화면 오버레이 + 정리): 초대(`channels/[id]/invite`)·방 관리(`channels/[id]/manage`)·메시지 검색(`channels/[id]/search`)·동아리 관리(`clubs/manage`)·멤버(`clubs/members`) 5개 화면에 `src/features/shell/ScreenOverlay.tsx` 적용 — 넓은 화면에서는 셸 위에 뜨는 다이얼로그 카드(자체 헤더+닫기), 컴팩트 화면에서는 기존 네이티브 풀스크린 그대로. 각 화면은 기존 컴포넌트를 `XScreenContent`로 이름만 바꾸고 얇은 `ScreenOverlay` 래퍼를 새 default export로 추가하는 방식이라 내부 로직(로딩/에러 분기 등)은 무변경. `app/(app)/_layout.tsx`가 `useBreakpoint()`로 이 5개 라우트의 `headerShown`을 넓은 화면에서만 끔(헤더 이중 렌더 방지). 정리: `src/features/ui/Skeleton.tsx`의 `ClubListSkeleton`(레거시 `app/(app)/index.tsx` 전용, Phase 1에서 그 화면이 리다이렉트 어댑터로 바뀌며 아무도 안 쓰던 죽은 컴포넌트)과 그 전용 스타일 제거.
- **Phase 0~4 전부 완료 — 반응형 워크스페이스 셸 이니셔티브 종료.**

**리브랜딩 (2026-09)**: 팔레트를 하늘색·시안·민트·올리브그린 그라데이션(`accentSky` `#BAE2FE` / `accentCyan` `#95E4F3` / `accentTurquoise` `#42F2F2` / `accentMint` `#24F8AE` / `accentOlive` `#63AB3F`) 기반으로 교체. `primary`는 대비 확보를 위해 올리브그린 계열을 어둡게 파생시킨 `#417029`. 배경·구분선 계층은 회색→민트→세이지→카키로 이어지는 중성 팔레트(`#F8F7FA`/`#F4F5F6`/`#EBF0F0`/`#E9EFE8`/`#EDEDDB`)로 교체. 모든 값은 `src/features/ui/theme.ts`가 단일 소스.

동아리/스터디 아이콘은 라벤더→페리윙클→시안→민트→옐로우 팔레트(`iconPalette`)에서 각각 고정색 하나씩만 쓴다(동아리=페리윙클, 스터디=민트) — 동아리마다 색이 달라 목록이 산만해 보인다는 피드백으로, id 해시 대신 고정값으로 바꿈(`getClubColor`/`getRoomColor`, `src/features/shell/shellUtils.ts`). 렌더링은 `EntityAvatar`(`src/features/shell/EntityAvatar.tsx`)로 통일했고, 이 컴포넌트는 `imageUrl` prop을 이미 받아둬서 나중에 동아리/방에 커스텀 이미지 업로드가 추가되면(예: `clubs.avatar_url`, `channels.avatar_url` — db-schema 에이전트가 컬럼 추가) 호출부가 그 값만 넘기면 된다. 채팅 멤버 아바타처럼 사람마다 색이 달라야 하는 곳(`RoomDetailPane`)은 여전히 `chatUtils.getAvatarColor`(이름 해시)를 쓴다 — 이건 통일 대상이 아니다.

**⚠️ §3 데이터 모델과 실제 구현 불일치**: 아래 §3의 `pages` 테이블 설명(`owner_type`/`owner_id`/`blocks` jsonb 블록 배열)은 실제 구현(`src/features/wiki/types.ts`: `club_id`/`room_id`(nullable)/`content`(마크다운 문자열), `react-native-markdown-display`로 렌더링)과 다르다. 위키가 실제로는 블록 에디터가 아니라 마크다운 텍스트 기반으로 구현된 것으로 보인다. db-schema 에이전트와 함께 §3을 실제 스키마에 맞게 재작성 필요(스키마 소유권은 §7 규칙에 따라 db-schema 에이전트).

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
6. **위키 홈페이지 + 반응형 워크스페이스 셸** ✅: 동아리 홈 + 스터디 방 홈 + 마이 페이지를 `/w` 네임스페이스의 반응형 셸로 재구성. **Phase 0~4 전부 완료**(§5 참고) — 토큰 통일, 채팅 분해, 레일+목록 2단 골격, 레거시 경로 리다이렉트, 채팅 본문 패널 통합 + 상세패널(멤버/위키 미리보기/일정), 위키 에디터 인라인/시트 겸용, 관리성 화면(초대/관리/멤버/검색) 오버레이.
7. **배포 전 필수기능**: 메시지 수정·삭제 UI, 프로필 편집(이름·아바타), 방 퇴장·동아리 탈퇴, 앱 전반 UX 완성도(빈 상태·에러 처리·로딩 스켈레톤)
8. **운영 이전**: OCI A1에 Supabase 셀프호스팅 마이그레이션, TLS·백업·방화벽 하드닝
9. **모바일 배포 + 푸시**: EAS Build로 TestFlight(iOS)/APK(Android) 배포, Expo Push 알림 Edge Function 연동, 딥링크 처리

## 9. OCI 셀프호스팅 메모 (6단계용)

- 인스턴스: Ubuntu(aarch64), Ampere A1, **On-demand capacity** 선택(선점 방지).
- 무료 한도는 콘솔에서 직접 확인(4 OCPU/24GB ↔ 2 OCPU/12GB 변경 보고 있음). 둘 다 소규모엔 충분.
- 서울 리전 우선, 용량 없으면 인접 리전. 신용카드 본인확인 필요(한도 내 무과금).
- 하드닝: OS 방화벽 + OCI 보안목록 포트 최소 개방, 리버스 프록시(SSL), DB 자동 백업, 인스턴스 유휴 회수 방지.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
