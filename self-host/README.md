# ClubChat — Supabase 셀프호스팅 (OCI A1)

CLAUDE.md §9 로드맵 8단계용. 여기 있는 파일들은 [supabase/supabase](https://github.com/supabase/supabase)
`docker/` 디렉터리를 원본 그대로 받아온 것 + ClubChat 전용 설정 메모.
서비스 자체(Auth/PostgREST/Realtime/Storage/Studio 등)는 Supabase Cloud와 동일 소프트웨어이므로
스키마·RLS·RPC는 손댈 필요 없이 `supabase/migrations/*.sql`을 그대로 재생한다.

## 0. 전제

- OCI Always Free 계정 + Ampere A1 (Ubuntu, aarch64) 인스턴스 생성 완료
- 인스턴스에 Docker + Docker Compose v2 설치 완료
- 도메인 하나 (self-host DB로 마이그레이션할 때 앱의 `EXPO_PUBLIC_SUPABASE_URL`이 이 도메인을 가리키게 됨)

## 1. 시크릿 생성

```bash
cd self-host
cp .env.example .env
sh utils/generate-keys.sh      # POSTGRES_PASSWORD, JWT_SECRET, SECRET_KEY_BASE 등 자동 채움
sh utils/add-new-auth-keys.sh  # 비대칭(ES256) ANON/SERVICE_ROLE 키 생성
```

`.env`는 `.gitignore`에 이미 걸려 있음 — 실제 값은 절대 커밋하지 않는다.

`.env`에서 이 프로젝트 기준으로 반드시 바꿔야 하는 값:

| 변수 | 값 |
|---|---|
| `SUPABASE_PUBLIC_URL` | `https://<도메인>` |
| `API_EXTERNAL_URL` | `https://<도메인>` |
| `SITE_URL` | 배포된 Expo 웹/PWA URL |
| `DASHBOARD_PASSWORD` | Studio 접근 비번 (강한 값으로) |
| `GOOGLE_ENABLED` / `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` | 기존 Google OAuth 앱의 값 (콜백 URL을 `https://<도메인>/auth/v1/callback`으로 추가 등록 필요) |
| `PGRST_DB_SCHEMAS` | 그대로 `public,storage,graphql_public` (변경 불필요) |

## 2. 기동

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

`docker-compose.caddy.yml`이 `PROXY_DOMAIN` 기준으로 Let's Encrypt TLS를 자동 처리한다
(TLS 설정 작업(#4)은 이 오버레이 파일로 사실상 끝 — 별도 nginx/Caddy 설정 불필요).

## 3. ClubChat 스키마 적용

Cloud와 동일하게 CLI로 마이그레이션을 순서대로 적용한다.

```bash
supabase db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@<도메인>:5432/postgres"
```

24개 마이그레이션(`20260622000001` ~ `20260707000001`)이 순서대로 다 적용되는지
`supabase migration list --db-url ...`로 확인. RLS policy가 많으므로 하나라도 실패하면
바로 다음 마이그레이션으로 넘어가지 말고 원인부터 확인.

## 4. 방화벽 (OS + OCI Security List)

외부에 열 포트는 최소한으로:

- `80`, `443` (Caddy — HTTP는 Let's Encrypt 챌린지 + HTTPS 리다이렉트용)
- 그 외 (Kong 8000/8443, Postgres 5432, Studio 등)는 **localhost 바인딩만** 하고 외부 미개방.
  Studio 관리 화면은 SSH 터널로만 접근 (`ssh -L 8000:localhost:8000 user@서버`).

OCI 콘솔의 Security List/NSG에서도 동일하게 80/443만 Ingress 허용, 나머지는 차단.
OS 방화벽(ufw)에서도 동일하게 맞춘다.

## 5. 백업

`db` 서비스는 `./volumes/db/data`에 실데이터를 bind mount (git에는 포함 안 됨, `.gitignore` 처리됨).
cron으로 매일 `pg_dump` → `self-host/backups/`에 저장 후 오프사이트(OCI Object Storage 등)로 반출 예정.
(백업 스크립트는 인스턴스가 뜬 뒤 실제 경로 확인하며 마무리 예정 — 작업 #6)

## 6. Cloud → Self-host 데이터 이전

1. Cloud 프로젝트에서 `pg_dump --data-only` (또는 Supabase 대시보드의 백업 export)
2. self-host DB로 `psql`/`pg_restore`
3. Storage 버킷 파일들은 별도로 object 단위 복사 필요 (Cloud Storage API → self-host Storage API)
4. 앱의 `.env`에서 `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`를 self-host 값으로 교체 후
   전체 기능(로그인, RLS, RPC, Realtime, Storage, Push) 회귀 테스트 — 작업 #7
