# ITDA 서비스 전환 계약 v0.2

상태: **승인됨** · 2026-11-19. 인프라는 AWS Lightsail 서울(ap-northeast-2)로 확정했다. 계약은 업체 중립을 유지해 다른 컨테이너 호스트로도 옮길 수 있게 한다.

v0.1 (2026-11-19): 도메인 함수가 만드는 캡슐 필드 `scheduledFrom`, `confirmedSnapshot`, `correctionReason`, `correctionImpacts`와 일정의 `correctsEventId`를 스키마·캡슐 표현에 추가했다(migration `0002`). 이 밖에도 도메인 함수가 만드는 필드를 발견하면 버리지 말고 총괄에게 묻는다.

v0.2 (2026-11-19): 도메인 초안 버전 `revision`과 서버 동시성 토큰 `version`을 분리했다. 명령은 `expectedVersion`을 보내고 충돌 코드는 `version_conflict`다. `send-message`는 버전 검사를 하지 않고, 상태가 바뀌지 않은 명령은 `version`을 올리지 않는다. `resume-conversation`은 상태를 바꾸지 않는다(review 유지).

이 폴더는 여러 AI 작업자가 병렬로 개발할 때 따르는 **유일한 기준**이다. 다른 기획 문서와 충돌하면 이 폴더가 우선한다. 계약 변경은 총괄(Claude)만 하며, 변경 시 버전을 올리고 모든 작업자에게 알린다.

| 문서 | 내용 |
| --- | --- |
| [api.md](api.md) | HTTP/WebSocket 엔드포인트, 명령 형식, 오류 코드 |
| [schema.sql](schema.sql) | PostgreSQL 16 테이블·제약 |
| [permissions.md](permissions.md) | 역할 정의, 명령별 권한·상태 조건 |

## 고정 결정

- **런타임**: Node.js 22 + TypeScript, Fastify, `pg`(node-postgres). SQL 마이그레이션 파일(`server/migrations/NNNN_name.sql`)을 순서대로 적용한다. ORM은 쓰지 않는다.
- **DB**: 표준 PostgreSQL 16. 특정 업체 전용 기능(Supabase Auth/Realtime, Neon branching 등)에 의존하지 않는다.
- **배포 단위**: 단일 Docker 이미지(API + WebSocket + 예약 작업 처리기). 상태는 DB에만 둔다. 어떤 컨테이너 호스트로도 옮길 수 있어야 한다.
- **도메인 로직 재사용**: `public/domain.js`의 순수 함수를 서버가 그대로 import한다. 서버 전용 규칙(권한, 트랜잭션, 멱등성)은 서버 계층에 둔다. 도메인 함수 시그니처를 바꾸면 계약 변경으로 취급한다.
- **인증**: 카카오 OAuth 인가 코드 흐름을 서버에서 처리하고, HttpOnly·Secure·SameSite=Lax 세션 쿠키를 발급한다. 로컬 개발·테스트에는 `AUTH_DEV_LOGIN=1`일 때만 동작하는 개발용 로그인을 둔다.
- **실시간**: WebSocket은 "변경 알림"만 보낸다(`capsuleId`, `revision`). 클라이언트는 알림을 받으면 HTTP로 다시 조회한다. 데이터 본문을 소켓으로 보내지 않는다.
- **예약 작업**: `jobs` 테이블 + `FOR UPDATE SKIP LOCKED` 폴링. 별도 큐 서비스를 두지 않는다.
- **테스트 DB**: 로컬은 `@electric-sql/pglite`(인프로세스 PostgreSQL)로 Docker 없이 실행한다. CI는 PostgreSQL 16 서비스 컨테이너로 같은 테스트를 한 번 더 돌린다.
- **AI 회의록 추출**: 이번 단계에서는 기존 규칙 기반 추출을 유지한다. AI 어댑터 자리만 `server/src/extract/`에 인터페이스로 둔다.
- **운영 인프라**: AWS Lightsail 서울. 앱은 Lightsail 인스턴스(2GB)에서 Docker로 실행하고 앞단에 Caddy(자동 HTTPS)를 둔다. DB는 같은 리전의 Lightsail 관리형 PostgreSQL(가능한 최신 16+ 버전)이며 사설 연결로 접속한다. 배포는 GitHub Actions → 이미지 빌드 → SSH로 `docker compose pull && up -d`. 배포 구성은 서버 기능 완성 후 별도 작업으로 만든다.

## 환경 변수

| 이름 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `APP_ORIGIN` | 허용 Origin(예: `https://itda.example`). 변경 요청의 Origin 검사에 사용 |
| `SESSION_SECRET` | 세션 서명 키(32바이트 이상) |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` / `KAKAO_REDIRECT_URI` | 카카오 로그인 |
| `AUTH_DEV_LOGIN` | `1`이면 개발용 로그인 허용. 운영에서 설정 시 서버가 시작을 거부 |
| `DATABASE_CA_FILE` | 관리형 PostgreSQL의 CA 인증서(PEM) 경로. 있으면 인증서를 검증하는 TLS로 연결 |
| `PORT` | 기본 8080 |

## 작업 소유권

| 경로 | 소유 | 다른 작업자 |
| --- | --- | --- |
| `docs/contracts/**` | 총괄 Claude | 읽기 전용. 변경 요청은 `orca orchestration ask` |
| `server/**`, `tests/server/**` | Codex 워커 | 읽기 전용 |
| `public/**`(UI·클라이언트 저장소 어댑터), `tests/e2e/**` | 총괄 Claude | 읽기 전용 |
| `eval/**`, `docs/research/**` | Gemini(또는 조사 담당) | 코드 수정 금지 |
| `public/domain.js` | 총괄 Claude | 서버는 import만. 수정 필요 시 요청 |

## 완료 보고 형식

변경 파일, 실행한 검사와 결과(명령·통과 수), 계약과 다르게 구현한 부분, 남은 위험. 이 네 가지만 보고한다.
