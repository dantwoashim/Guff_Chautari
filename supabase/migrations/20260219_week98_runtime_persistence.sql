-- Week 98 runtime durability migration
-- Date: 2026-02-19
-- Add additive runtime snapshot tables used by API/runtime adapters.

create extension if not exists pgcrypto;

create table if not exists public.runtime_workspaces (
  id text primary key default concat('rtw_', gen_random_uuid()::text),
  user_id text not null,
  workspace_id text not null,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create table if not exists public.runtime_workspace_members (
  id text primary key default concat('rtwm_', gen_random_uuid()::text),
  user_id text not null,
  workspace_id text not null,
  member_user_id text not null,
  role text not null,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, member_user_id)
);

create table if not exists public.runtime_workspace_invites (
  id text primary key default concat('rtwi_', gen_random_uuid()::text),
  user_id text not null,
  workspace_id text not null,
  invite_id text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, invite_id)
);

create table if not exists public.runtime_conversation_metadata (
  id text primary key default concat('rtcm_', gen_random_uuid()::text),
  user_id text not null,
  workspace_id text not null,
  conversation_id text not null,
  persona_id text,
  persona_name text,
  archived_at_iso text,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, conversation_id)
);

create table if not exists public.runtime_workflow_state (
  id text primary key default concat('rtwf_', gen_random_uuid()::text),
  user_id text not null,
  workspace_id text not null,
  namespace_user_id text not null,
  state jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, namespace_user_id)
);

create table if not exists public.runtime_knowledge_state (
  id text primary key default concat('rtkg_', gen_random_uuid()::text),
  user_id text not null,
  workspace_id text not null,
  namespace_user_id text not null,
  state jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, namespace_user_id)
);

create table if not exists public.runtime_memory_entries (
  id text primary key,
  user_id text not null,
  workspace_id text not null,
  app_id text not null,
  namespace text not null,
  content text not null,
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  emotional_valence double precision not null default 0,
  decay_factor double precision not null default 0.5,
  embedding jsonb not null default '[]'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, workspace_id, app_id, namespace, id)
);

create table if not exists public.runtime_org_state (
  id text primary key default concat('rtorg_', gen_random_uuid()::text),
  user_id text not null,
  organization_id text not null,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table if not exists public.runtime_billing_state (
  id text primary key default concat('rtbill_', gen_random_uuid()::text),
  user_id text not null,
  scope_type text not null,
  scope_id text not null,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope_type, scope_id)
);
