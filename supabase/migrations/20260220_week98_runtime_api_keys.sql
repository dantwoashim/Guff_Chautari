-- Week 98 follow-up migration
-- Add dedicated runtime API key snapshots table and migrate legacy rows.

create extension if not exists pgcrypto;

create table if not exists public.runtime_api_keys (
  id text primary key default concat('rtak_', gen_random_uuid()::text),
  user_id text not null,
  key_id text not null,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key_id)
);

insert into public.runtime_api_keys (
  id,
  user_id,
  key_id,
  payload,
  schema_version,
  version,
  created_at,
  updated_at
)
select
  b.id,
  b.user_id,
  b.scope_id,
  b.payload,
  b.schema_version,
  b.version,
  b.created_at,
  b.updated_at
from public.runtime_billing_state b
where b.scope_type = 'api_key_record'
on conflict (user_id, key_id) do update
set
  payload = excluded.payload,
  schema_version = excluded.schema_version,
  version = excluded.version,
  updated_at = greatest(public.runtime_api_keys.updated_at, excluded.updated_at);

alter table if exists public.runtime_api_keys enable row level security;

drop policy if exists "runtime_api_keys_owner" on public.runtime_api_keys;
create policy "runtime_api_keys_owner"
on public.runtime_api_keys
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

create index if not exists runtime_api_keys_user_key_idx
  on public.runtime_api_keys (user_id, key_id);
create index if not exists runtime_api_keys_key_updated_idx
  on public.runtime_api_keys (key_id, updated_at desc);
