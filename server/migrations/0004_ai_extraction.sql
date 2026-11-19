-- AI 회의록 추출 (docs/contracts/ai-extraction.md, schema.sql v0.3)
create table draft_suggestions (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references capsules(id) on delete cascade,
  user_id uuid not null references users(id),
  based_on_version int not null,
  message_ids uuid[] not null,
  candidates jsonb not null,
  model text not null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index on draft_suggestions (capsule_id, created_at desc);

create table ai_usage (
  id bigserial primary key,
  user_id uuid not null references users(id),
  org_id uuid not null references organizations(id) on delete cascade,
  capsule_id uuid references capsules(id) on delete set null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric(12, 6) not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index on ai_usage (created_at);
create index on ai_usage (user_id, created_at);
