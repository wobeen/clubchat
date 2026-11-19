-- ITDA PostgreSQL 16 스키마 계약 v0.2
-- 0001_init.sql 은 v0 그대로 두고, v0.1·v0.2 추가분은 server/migrations/0002_*.sql 로 만든다. 이 파일과 다르게 만들려면 총괄에게 먼저 요청한다.
-- 캡슐의 자주 바뀌고 함께 검증되는 하위 구조(draft, draftHistory, agendaStatuses, policyHistory 등)는 JSONB에 두고,
-- 권한·조회·유일성 제약이 필요한 것(참여자, 메시지, 확인, 일정)은 테이블로 정규화한다.

create table users (
  id uuid primary key default gen_random_uuid(),
  kakao_id text unique,                       -- 개발용 로그인 사용자는 null
  name text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  id text primary key,                        -- 32바이트 난수의 해시. 원문은 쿠키에만 존재
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on sessions (expires_at);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  time_zone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  teams text[] not null default '{}',
  grade text,
  left_at timestamptz,                        -- 탈퇴해도 과거 확인 기록 보존을 위해 행은 남긴다
  primary key (org_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references users(id),
  expires_at timestamptz not null,
  max_uses int,
  uses int not null default 0,
  revoked_at timestamptz
);

create table capsules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null check (status in ('open', 'review', 'confirmed', 'scheduled', 'cancelled', 'deferred')),
  revision int not null default 0,            -- 도메인 초안 버전. 도메인 함수만 바꾼다. 확인 레코드가 여기에 묶인다
  version int not null default 0,             -- v0.2 서버 동시성 토큰. 상태를 바꾼 명령마다 +1. expectedVersion 비교 대상
  member_set_version int not null default 0,
  conclusion_version int not null default 0,
  facilitator_id uuid references users(id),
  parent_id uuid references capsules(id),
  previous_id uuid references capsules(id),
  correction_of uuid references capsules(id),
  deferred_from uuid references capsules(id),
  starts_at timestamptz,
  confirmed_at timestamptz,
  draft jsonb,
  draft_message_ids uuid[],
  draft_history jsonb not null default '[]',
  carryover jsonb not null default '[]',
  conclusions jsonb not null default '[]',
  agenda_statuses jsonb not null default '{}',
  policy_history jsonb not null default '[]',
  delegation_disposition jsonb,
  -- v0.1 (migration 0002): 도메인 함수가 만드는 필드
  scheduled_from text,                        -- 다음 캡슐을 만든 초안 일정 항목 id. 중복 예약 방지
  confirmed_snapshot jsonb,                   -- 확정 당시 버전·참여·확인·하위 처리 기록
  correction_reason text,                     -- 정정 캡슐의 사유
  correction_impacts jsonb not null default '[]',
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  check (status <> 'scheduled' or starts_at is not null),
  check (status not in ('review', 'confirmed') or draft is not null),
  check (status <> 'confirmed' or confirmed_at is not null)
);
create index on capsules (org_id, status);
create index on capsules (parent_id);
create unique index on capsules (scheduled_from) where scheduled_from is not null;
create index on capsules (status, starts_at) where status = 'scheduled';

create table capsule_members (
  capsule_id uuid not null references capsules(id) on delete cascade,
  user_id uuid not null references users(id),
  is_confirmation_target boolean not null default true,
  departed_at timestamptz,
  primary key (capsule_id, user_id)
);
create index on capsule_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references capsules(id) on delete cascade,
  author_id uuid not null references users(id),
  text text not null check (length(text) between 1 and 4000),
  is_source boolean not null default false,   -- 위임 시 상위에서 복사된 sourceMessages
  source_message_id uuid,                     -- 복사 원본 id
  created_at timestamptz not null default now()
);
create index on messages (capsule_id, created_at desc, id desc);

create table confirmations (
  capsule_id uuid not null references capsules(id) on delete cascade,
  user_id uuid not null references users(id),
  revision int not null,
  member_set_version int not null,
  conclusion_version int not null,
  at timestamptz not null default now(),
  primary key (capsule_id, user_id, revision, member_set_version, conclusion_version)
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  capsule_id uuid not null references capsules(id) on delete cascade,  -- 확정한 원래 캡슐. 합류해도 바꾸지 않는다
  source_id text not null,                    -- 초안 항목 id. 중복 생성 방지
  kind text not null check (kind in ('event', 'next')),
  text text not null,
  at timestamptz not null,
  location text,
  participant_ids uuid[] not null,
  corrects_event_id text,                     -- v0.1: 정정 캡슐의 일정이 대체하는 원본 일정 source_id
  unique (capsule_id, source_id)
);
create index on calendar_events (org_id, at);

create table reads (
  capsule_id uuid not null references capsules(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  last_message_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (capsule_id, user_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  capsule_id uuid references capsules(id) on delete cascade,
  text text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

create table idempotency_keys (
  user_id uuid not null references users(id) on delete cascade,
  key uuid not null,
  request_hash text not null,                 -- 같은 키로 다른 본문을 보내면 400
  status int not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table jobs (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null default '{}',
  run_at timestamptz not null,
  attempts int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  last_error text,
  unique (kind, payload)                      -- 같은 캡슐 활성화 작업 중복 방지
);
create index on jobs (run_at) where status = 'pending';

create table outbox (
  id bigserial primary key,
  topic text not null,                        -- capsule.changed / calendar.changed / notification
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on outbox (id) where sent_at is null;
