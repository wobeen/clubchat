# ClubChat 기술 스택 정리

> 실제 코드 기준 (`package.json`, `app.json`, `eas.json`, `supabase/migrations/`, `self-host/`)
> 최종 정리: 2026-09-04

---

## 1. 언어 · 타입

| 항목 | 내용 |
|---|---|
| 언어 | TypeScript (strict), `typescript ~6.0.3` |
| DB 타입 | `supabase gen types typescript` → `src/types/supabase.ts` — DB와 UI 사이의 계약 |
| 구조 | 기능 단위 `src/features/<도메인>` (auth, chat, club, schedule, wiki, notifications, deeplink, ui) |

## 2. 프런트엔드 (크로스 플랫폼)

- **Expo SDK 56** + **React Native 0.85.3** + **React 19.2** — iOS / Android / Web 단일 코드베이스
- **expo-router 56** (파일 기반 라우팅, `typedRoutes` 켜짐) — `app/(auth)`, `app/(app)/clubs/[id]`, `app/(app)/channels/[id]`
- **react-native-web** + Metro — 웹 빌드
- UI 보조: `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `react-native-markdown-display`(위키 렌더), `@react-native-community/datetimepicker`(일정)
- 자체 UI 프리미티브: `ActionSheet`, `ConfirmDialog`, `Skeleton`, `Toast` (`src/features/ui/`) — 외부 UI 라이브러리 없음
- 플랫폼 분기 파일 패턴: `DatePickerField.native.tsx` / `DatePickerField.web.tsx`

## 3. 백엔드 · 데이터

- **Supabase** (Postgres + Auth + Realtime + Storage + RLS), 클라이언트 `@supabase/supabase-js ^2.108`
- 단일 클라이언트 진입점 `src/lib/supabase.ts`
- 마이그레이션 28개 (`supabase/migrations/`) — 테이블·RLS·RPC 모두 SQL로 버전 관리
- Postgres 기능 활용:
  - **RLS 정책** (전 테이블)
  - **RPC 함수** — 초대 검증 `get_invite_preview`, 미읽음 집계 `unread_counts_fn`, 방 비밀번호 `set_channel_password`
  - **pgcrypto** — 비밀번호 해시
  - **full-text search** — `messages_search`
  - **Realtime publication** — `realtime_messages`

## 4. 인증 · 보안

- **Supabase Auth + Google OAuth**: `expo-auth-session` + `expo-web-browser` (`src/features/auth/useGoogleAuth.ts`)
- 세션 저장: `expo-secure-store`(네이티브) / `@react-native-async-storage/async-storage`
- 방 입장: 초대 토큰(링크·QR) + 비밀번호 해시(pgcrypto, 원문 저장 없음)
- 경계는 전부 서버 RLS — 클라이언트 권한 판단 없음
- E2EE는 정책상 미도입 (TLS + 저장 시 암호화 + 엄격한 RLS로 대체)

## 5. 실시간

- Supabase **Realtime** — 메시지 구독(`postgres_changes`), **Presence**(입력중 표시)
- 읽음표시는 메시지별 행이 아닌 `channel_reads.last_read_at` 포인터 1개 방식

## 6. 파일 · 미디어

- **Supabase Storage** 비공개 버킷 + 서명 URL (`storage_attachments` 마이그레이션)
- 업로드 경로: `expo-image-picker`, `expo-document-picker`, `expo-file-system`, `expo-camera`(QR 스캔)
- 업로드 훅 `src/features/chat/useAttachmentUpload.ts`

## 7. 알림

- **Expo Push Notifications** (`expo-notifications` + `expo-device`) → 내부적으로 FCM / APNs
- 토큰 등록 `src/features/notifications/usePushToken.ts`, `push_tokens` 테이블 + RLS

## 8. 초대 · 딥링크

- `expo-linking` + 커스텀 스킴 `clubchat://`
- 딥링크 파싱 `src/features/deeplink/parseInviteLink.ts`, 미로그인 시 보류 처리 `pendingDeepLink.ts`
- QR: `react-native-qrcode-svg`(생성) / `expo-camera`(스캔), 링크 복사 `expo-clipboard`

## 9. 빌드 · 배포

| 타깃 | 방식 |
|---|---|
| 데스크톱/웹 | **PWA** — `app.json` web 설정(standalone, themeColor, scope), `dist/` 정적 출력 |
| iOS | **EAS Build** → TestFlight (`production` 프로파일, m-medium) |
| Android | **EAS Build** → preview는 APK 직배포, production은 AAB |

- 번들 ID `com.clubchat.app`, `runtimeVersion` 고정

## 10. 인프라 (운영 이전 대상)

- 현재: **Supabase Cloud 무료 티어**
- 목표: **Oracle Cloud OCI Always Free (ARM Ampere A1)** 위 셀프호스팅 — `self-host/`에 실제 구성 존재
  - `docker-compose.yml` + Caddy(TLS) / S3 스토리지 변형 compose
  - Kong API 게이트웨이(`volumes/api/kong.yml`), Supavisor 풀러, Postgres 초기화 SQL, 로그 스택
  - 키 생성 스크립트 `utils/generate-keys.sh`, `add-new-auth-keys.sh`

## 11. 개발 워크플로

- **Claude Code 멀티 에이전트**: `db-schema`(DB·RLS 단독 소유), `ui-builder`, `realtime-chat`, `reviewer`, `tester`
- `CLAUDE.md`가 데이터 모델·보안 규칙의 단일 진실 공급원

---

## 의도적으로 제외한 것

- **E2EE** — 운영 복잡도 대비 이득이 적어 TLS + RLS로 대체
- **WebRTC 자체 운영** — 통화는 추후 Daily.co / LiveKit 임베드 방식
- **상태관리 라이브러리** (Redux / Zustand) — 훅 + Supabase 구독으로 처리
- **UI 컴포넌트 라이브러리** — 자체 프리미티브로 처리
