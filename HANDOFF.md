# HANDOFF — ClubChat 안정화(7a) 진행 상황

작성: 2026-10-14. 새 세션 시작 시 이 파일과 `CLAUDE.md`(§3·§4·§8의 7a)를 먼저 읽을 것. 비밀값(토큰·키)은 이 파일에 없다.

## 라우팅 규칙 (goat-router)
`/goat-router` 사용: triage → (quick|build|deep) → verifier. 실패 시 한 단계만 올려 재시도. 메인 모델은 `/model sonnet`.
에이전트: triage, quick, build, deep, escalate, verifier + db-schema(DB 전담), tester, reviewer, ui-builder, realtime-chat.
Stop 훅(`.claude/hooks/check.sh`)은 `.claude/test-command`(= `npm run typecheck`)를 실행한다.

## 확정된 결정 (2026-10-14)
- 위키는 **마크다운 유지** (`pages.content`, 블록 JSON 안 씀).
- 프로필 민감정보(`grade`, `birth_year`, `gender`)는 **본인 + 해당 동아리 owner/admin만** 조회. 구현은 db-schema 에이전트가 결정(별도 테이블 `profile_private` 또는 뷰+컬럼 권한).
- 계약 문서 `CLAUDE.md`는 실제 구현에 맞게 갱신 완료 (커밋 `89cd506`).

## 완료
- `tsc --noEmit` 앱 코드 오류 0건, Deno 코드는 tsconfig에서 제외 (커밋 `54f0339`).
- CLAUDE.md 계약 갱신 + 7a 안정화 단계 추가 (커밋 `89cd506`).
- 7a-4: `package.json`에 `typecheck` 스크립트, `.claude/test-command` 생성.
- 7a-5: `WikiViewer.tsx`에 링크 허용목록(http/https/mailto), `app.json`에서 `RECORD_AUDIO` 제거 + expo-camera `recordAudioAndroid: false`.

## 미커밋 변경 (검증됨: `npm run typecheck` 0건)
`package.json`, `app.json`, `src/features/wiki/WikiViewer.tsx`, `.claude/test-command`(신규).
→ 사용자 승인 후 커밋할 것. 스테이징돼 있던 `self-host/*`, `.gitignore`, `supabase/.temp/cli-latest`는 이 작업과 무관하므로 건드리지 말 것(경로 지정 커밋 `git commit -- <paths>` 사용).

## 막힌 지점: 7a-1 타입 재생성
- 명령: `npx supabase gen types typescript --linked` (프로젝트 ref는 `supabase/.temp/project-ref`).
- 실패 원인: 토큰에 `database_read` 권한 없음 (`Missing required permission(s): database_read`). Claude Code 세션은 비-TTY라 브라우저 로그인 불가 → 토큰 방식(`supabase login --token`) 필요.
- 사용자가 새 토큰으로 로그인했다고 함. **재시도부터 시작.** 또 같은 오류면 토큰 권한/프로젝트 범위 확인 필요.
- **원인 확인됨 (2026-10-14 재시도):** 셸 프로세스에 `SUPABASE_ACCESS_TOKEN` 환경변수(`sbp_…`, 44자)가 상속돼 있고, CLI는 `supabase login` 저장 토큰보다 이 값을 우선한다. 이 값은 사용자·시스템 환경변수, Claude `settings*.json`, `.env`에는 없음 → Claude Code를 연 터미널에서 export된 이전 토큰으로 추정. 이 토큰은 `database_read`·`projects_read` 권한이 없다.
  - `env -u SUPABASE_ACCESS_TOKEN`으로 변수를 빼고 실행하면 `Invalid access token` → 저장된 로그인 토큰도 이 세션에서 유효하지 않음(다른 터미널/자격 증명 저장소에 로그인했거나 저장 실패. `~/.supabase`에 토큰 파일 없음).
  - **해결 순서:** ① 대시보드에서 `database_read`·`projects_read` 포함 새 토큰 생성 ② 새 터미널에서 `$env:SUPABASE_ACCESS_TOKEN="<새 토큰>"` 설정(또는 해제 후 `npx supabase login --token ...`) 후 Claude Code 실행 ③ 시작 시 `echo ${#SUPABASE_ACCESS_TOKEN}`로 변수 상태 확인(값 출력 금지) ④ `npx supabase projects list`가 성공하는지 먼저 확인 ⑤ 그 후 타입 재생성.
  - 우회안: `--db-url`(DB 접속 문자열) 방식.
- 주의: `src/types/supabase.ts`는 현재 **UTF-16 LE + CRLF**. 재생성 결과는 **UTF-8**로 저장할 것(PowerShell `>` 리디렉션 금지, Bash로 리디렉션하고 `file`로 확인). 교체 전 현재 파일과 diff하여 변경점(profiles 신규 컬럼, join_requests, events.club_id 등) 확인.
- 생성 후: `as any` 제거 (예: `app/(app)/index.tsx`의 프로필 update), `npm run typecheck` 0건 확인.

## 남은 작업 (CLAUDE.md §8 7a)
1. 타입 재생성 + `as any` 제거 ← 지금 여기
2. 프로필 민감정보 RLS 제한 — db-schema 에이전트, 위험도 high(verifier + reviewer 포함). **DB 적용 대상 결정 필요**: (a) 클라우드에 바로 적용 / (b) 테스트용 별도 Supabase 프로젝트 / (c) 로컬 Docker. 추천은 (b). 현재 실데이터·실사용자 유무를 사용자에게 먼저 물을 것.
3. RLS 회귀 테스트(pages, events/event_responses, storage attachments, profiles, join_requests) — tester 에이전트. 서로 다른 사용자(멤버/admin/비멤버) 시나리오.
4. (완료) typecheck 스크립트 연결.
5. 위키 링크 스킴 제한은 구현됨 — 실제 `javascript:` 링크 동작 검증은 미실시. 마크다운 이미지 URL 스킴 제한은 보류.
6. 대형 파일 분리(`chat.tsx` 993줄, `app/(app)/index.tsx` 822줄, `clubs/[id].tsx` 576줄), 마이그레이션 정리본(운영 이전용).

그 다음: 8단계(OCI 셀프호스팅 이전, `self-host/` 커밋 필요), 9단계(EAS 빌드·푸시·딥링크 실기기 검증).

## 알려진 위험 (우선순위)
1. 민감정보가 같은 방/동아리 멤버에게 노출됨(profiles SELECT 컬럼 제한 없음).
2. 테스트 없음, RLS 수정 마이그레이션 다수(회귀 위험).
3. `src/types/supabase.ts`가 구버전(그래서 `as any` 사용).

## 보안 정리 (사용자 확인 필요)
- 이전 대화에 Supabase 액세스 토큰 2개가 노출됨 → 대시보드(Account → Access Tokens)에서 **폐기(Revoke)** 했는지 확인. 새 토큰도 작업 후 폐기.
- 로그인 정보는 CLI에 저장되므로 필요 없으면 `npx supabase logout`.
