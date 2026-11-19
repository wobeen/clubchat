# 배포 가이드 (AWS Lightsail 서울)

구성: Lightsail 인스턴스(2GB) 위의 Docker Compose(`api` + `caddy`) + 같은 리전 Lightsail 관리형 PostgreSQL. 결정 근거는 `docs/contracts/README.md`의 "운영 인프라". 구성 파일은 `deploy/`, 자동 배포는 `.github/workflows/deploy.yml`이다.

> 이 문서의 콘솔 메뉴 이름과 가격은 작성 시점의 지식에 기반한 것이라 실제 화면과 다를 수 있다. 실제 계정에서 한 번도 검증하지 않았다.

## 1. 예상 월 비용 (추정)

출처: AWS Lightsail 요금 페이지 <https://aws.amazon.com/lightsail/pricing/> (서울 리전 요금은 페이지에서 직접 확인 필요).

| 항목 | 예상 | 비고 |
| --- | --- | --- |
| 인스턴스 2GB (Linux) | 약 $12/월 (추정) | 서울 리전은 약간 다를 수 있음. 전송량 포함 |
| 관리형 PostgreSQL 최소 사양 | 약 $15/월 (추정) | 1GB RAM 표준 플랜 가정. 고가용성은 별도 |
| 고정 IP | 인스턴스에 연결 시 무료 | 미연결 시 과금 |
| 스냅샷·백업 | 용량당 소액 (추정) | |
| 도메인 | 별도(연 $10~15 추정) | |
| 합계 | 약 $27~35/월 (추정) | 확정값 아님 |

## 2. 처음 설정 절차

### 2.1 인스턴스 만들기
1. Lightsail 콘솔 → 우측 상단 리전을 **서울(ap-northeast-2)**로 → **인스턴스 만들기**.
2. 플랫폼 Linux/Unix, 블루프린트 **OS 전용 → Ubuntu 24.04 LTS**, 플랜 **2GB RAM**.
3. 이름 `itda-prod`. SSH 키는 새로 만들거나 기본 키를 내려받아 보관한다(GitHub 비밀값에 쓴다).

### 2.2 고정 IP와 방화벽
1. 인스턴스 → **네트워킹** → **고정 IP 생성** 후 연결.
2. IPv4 방화벽 규칙: **TCP 22(SSH), 80, 443**, 그리고 **UDP 443(HTTP/3, 선택)**. 22는 가능하면 본인 IP로 제한한다. 80/443이 열려야 Let's Encrypt 인증서가 발급된다.
3. 8080 등 api 포트는 열지 않는다(compose도 공개하지 않는다).

### 2.3 관리형 PostgreSQL과 사설 연결
1. **데이터베이스 만들기** → 같은 서울 리전, 엔진 PostgreSQL(**16 이상 최신**), 플랜 선택. 마스터 사용자·비밀번호 기록.
2. 데이터베이스 → **네트워킹** → **공개 모드 끄기**(사설 전용).
3. 같은 리전·같은 계정의 인스턴스는 VPC 피어링으로 **엔드포인트(사설 호스트명)**에 접속된다. 계정 설정 → **고급 → VPC 피어링 사용**이 꺼져 있으면 켠다.
4. 연결 문자열을 `.env`의 `DATABASE_URL`에 넣는다. 서버 코드는 `pg`에 연결 문자열을 넘긴다(`server/src/db.ts`).
   - 관리형 DB는 TLS를 요구한다. Lightsail DB 인증서는 Amazon RDS CA가 발급하므로 CA 번들로 인증서를 **검증**한다(`no-verify`는 쓰지 않는다).
     ```sh
     mkdir -p /opt/itda/certs
     curl -fsSL -o /opt/itda/certs/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
     ```
     출처는 Amazon RDS 인증서 번들(글로벌, 모든 리전 CA 포함, PEM)이다. `.env`에 `DATABASE_CA_FILE=/certs/global-bundle.pem`을 넣으면 compose가 `./certs`를 `/certs`로 마운트하고, 서버가 `rejectUnauthorized: true`로 연결한다.
   - `DATABASE_URL`에는 `sslmode`를 붙이지 않아도 된다. CA 파일이 있으면 서버가 URL의 `sslmode`를 제거하고 위 설정을 적용한다(node-postgres는 URL의 sslmode가 `ssl` 설정을 덮어쓰기 때문).
5. 마이그레이션은 api 시작 시 자동 적용된다(`server/src/index.ts`의 `migrate`). 별도 작업 없음. 빈 DB 하나(`dbname`)만 만들어 두면 된다.

### 2.4 DNS
1. 고정 IP를 가리키는 **A 레코드**를 도메인 DNS에 만든다(Lightsail 콘솔의 DNS 영역을 써도 된다). 예: `itda.example.com → <고정 IP>`.
2. 전파 후 `dig +short itda.example.com`으로 확인한다.

### 2.5 서버 준비 (SSH 접속 후)
```sh
sudo apt-get update && sudo apt-get install -y ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu      # 재로그인 필요
sudo mkdir -p /opt/itda/public && sudo chown -R ubuntu:ubuntu /opt/itda
```
그리고 `/opt/itda/.env`를 만든다(`deploy/.env.example`을 복사해 값을 채운다).
```sh
scp deploy/.env.example ubuntu@<고정 IP>:/opt/itda/.env   # 로컬에서
chmod 600 /opt/itda/.env                                  # 서버에서
```
- `DOMAIN`은 2.4의 도메인, `APP_ORIGIN`은 `https://<DOMAIN>`.
- `SESSION_SECRET`은 `openssl rand -hex 32`.
- **`AUTH_DEV_LOGIN`은 운영에서 설정 금지**(서버가 시작을 거부한다). 비워 둔다.
- `TAG`는 배포 워크플로가 매번 갱신한다. 첫 배포 전에는 비워도 된다.

### 2.6 GitHub 비밀값
저장소 → Settings → Secrets and variables → Actions:

| 이름 | 값 |
| --- | --- |
| `LIGHTSAIL_HOST` | 고정 IP 또는 도메인 |
| `LIGHTSAIL_SSH_KEY` | 인스턴스 SSH 개인키 전체(`-----BEGIN ...` 포함) |

두 값이 없으면 워크플로는 이미지 빌드·push까지만 하고 서버 배포 단계를 건너뛴다(실패하지 않음). SSH 사용자는 `ubuntu`로 고정했다. GHCR 패키지 `clubchat-api`는 서버가 배포 시 `GITHUB_TOKEN`으로 로그인해 pull한다. 별도 설정은 필요 없다.

### 2.7 카카오 로그인 리다이렉트 URI
Kakao Developers → 내 애플리케이션 → 카카오 로그인 → **Redirect URI**에 `https://<DOMAIN>/v1/auth/kakao/callback`을 등록하고, `.env`의 `KAKAO_REDIRECT_URI`에 같은 값을 넣는다. 두 값은 한 글자도 달라선 안 된다.

### 2.8 첫 배포
GitHub → Actions → **Deploy (Lightsail)** → Run workflow. 이후엔 `main`에 push되어 `ITDA checks`가 성공하면 자동으로 배포된다.

## 3. 동작 확인
```sh
cd /opt/itda
docker compose --env-file .env ps       # api: healthy 확인
curl -I https://<DOMAIN>/               # 200, Strict-Transport-Security 헤더
curl https://<DOMAIN>/health            # Caddy가 직접 응답. api 상태가 아님
```
- 주의: api에 `/health` 엔드포인트가 아직 없어 compose healthcheck는 TCP 연결만 검사한다. `/health`가 생기면 compose의 TODO를 교체한다.
- 정적 `index.html`에는 배포 때 `<meta name="itda-api" content="on">`이 주입된다(`deploy/build-static.mjs`). `public/index.html` 원본은 그대로다.

## 4. 로그 보기
```sh
cd /opt/itda
docker compose --env-file .env logs -f --tail=200 api
docker compose --env-file .env logs -f --tail=200 caddy
```
컨테이너 로그는 서비스당 10MB × 5개로 순환한다.

## 5. 백업
- **DB**: Lightsail 관리형 DB의 **자동 백업**(보존 기간 콘솔 확인)과 **수동 스냅샷**을 쓴다. 배포 전 중요한 스키마 변경이 있으면 수동 스냅샷을 만든다. 복원은 스냅샷에서 새 DB를 만들고 `DATABASE_URL`을 바꾼 뒤 `docker compose up -d`.
- **인스턴스**: 상태는 `/opt/itda/.env`와 Caddy 인증서 볼륨 정도다. 인스턴스 스냅샷을 주기적으로 만든다. `.env`는 비밀번호 관리자에도 보관한다.

## 6. 롤백 (이전 TAG로 되돌리기)
이미지는 커밋 앞 12자리(`TAG`)와 `latest`로 GHCR에 쌓인다.
```sh
cd /opt/itda
grep '^TAG=' .env                                   # 현재 태그
# GitHub → Packages → clubchat-api 에서 이전 태그 확인 후:
sed -i 's/^TAG=.*/TAG=<이전태그>/' .env
docker compose --env-file .env pull && docker compose --env-file .env up -d
```
- 정적 파일(`/opt/itda/public`)은 마지막 배포본이 남는다. 프런트까지 되돌리려면 이전 커밋으로 워크플로를 수동 실행(`ref` 입력)한다.
- **DB 마이그레이션은 되돌려지지 않는다.** 이전 이미지가 새 스키마와 호환되는지 확인하고, 호환되지 않으면 스냅샷에서 복원한다.

## 7. 알려진 한계
- 관리형 DB TLS 검증, `/health` 엔드포인트, WebSocket 경로는 서버 쪽 변경에 달려 있다(Caddy는 `/v1/*` 전체를 WebSocket 업그레이드 포함해 프록시한다).
- 단일 인스턴스라 배포 중 수 초의 중단이 있다(무중단 배포 아님).
