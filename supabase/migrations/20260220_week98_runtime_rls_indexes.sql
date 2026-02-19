-- Week 98 runtime RLS + index hardening
-- Date: 2026-02-20

-- Helper predicates use text user ids because runtime ids are not guaranteed uuid-formatted.

alter table if exists public.runtime_workspaces enable row level security;
alter table if exists public.runtime_workspace_members enable row level security;
alter table if exists public.runtime_workspace_invites enable row level security;
alter table if exists public.runtime_conversation_metadata enable row level security;
alter table if exists public.runtime_workflow_state enable row level security;
alter table if exists public.runtime_knowledge_state enable row level security;
alter table if exists public.runtime_memory_entries enable row level security;
alter table if exists public.runtime_org_state enable row level security;
alter table if exists public.runtime_billing_state enable row level security;

-- runtime_workspaces

drop policy if exists "runtime_workspaces_select" on public.runtime_workspaces;
create policy "runtime_workspaces_select"
on public.runtime_workspaces
for select
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_workspaces.user_id
      and m.workspace_id = runtime_workspaces.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_workspaces_mutate" on public.runtime_workspaces;
create policy "runtime_workspaces_mutate"
on public.runtime_workspaces
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

-- runtime_workspace_members

drop policy if exists "runtime_workspace_members_select" on public.runtime_workspace_members;
create policy "runtime_workspace_members_select"
on public.runtime_workspace_members
for select
using (
  auth.uid()::text = user_id
  or member_user_id = auth.uid()::text
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_workspace_members.user_id
      and m.workspace_id = runtime_workspace_members.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_workspace_members_mutate" on public.runtime_workspace_members;
create policy "runtime_workspace_members_mutate"
on public.runtime_workspace_members
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

-- runtime_workspace_invites

drop policy if exists "runtime_workspace_invites_select" on public.runtime_workspace_invites;
create policy "runtime_workspace_invites_select"
on public.runtime_workspace_invites
for select
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_workspace_invites.user_id
      and m.workspace_id = runtime_workspace_invites.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_workspace_invites_mutate" on public.runtime_workspace_invites;
create policy "runtime_workspace_invites_mutate"
on public.runtime_workspace_invites
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

-- conversation/workflow/knowledge/memory are workspace-scoped runtime records

drop policy if exists "runtime_conversation_metadata_select" on public.runtime_conversation_metadata;
create policy "runtime_conversation_metadata_select"
on public.runtime_conversation_metadata
for select
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_conversation_metadata.user_id
      and m.workspace_id = runtime_conversation_metadata.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_conversation_metadata_mutate" on public.runtime_conversation_metadata;
create policy "runtime_conversation_metadata_mutate"
on public.runtime_conversation_metadata
for all
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_conversation_metadata.user_id
      and m.workspace_id = runtime_conversation_metadata.workspace_id
      and m.member_user_id = auth.uid()::text
  )
)
with check (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_conversation_metadata.user_id
      and m.workspace_id = runtime_conversation_metadata.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_workflow_state_select" on public.runtime_workflow_state;
create policy "runtime_workflow_state_select"
on public.runtime_workflow_state
for select
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_workflow_state.user_id
      and m.workspace_id = runtime_workflow_state.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_workflow_state_mutate" on public.runtime_workflow_state;
create policy "runtime_workflow_state_mutate"
on public.runtime_workflow_state
for all
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_workflow_state.user_id
      and m.workspace_id = runtime_workflow_state.workspace_id
      and m.member_user_id = auth.uid()::text
  )
)
with check (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_workflow_state.user_id
      and m.workspace_id = runtime_workflow_state.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_knowledge_state_select" on public.runtime_knowledge_state;
create policy "runtime_knowledge_state_select"
on public.runtime_knowledge_state
for select
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_knowledge_state.user_id
      and m.workspace_id = runtime_knowledge_state.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_knowledge_state_mutate" on public.runtime_knowledge_state;
create policy "runtime_knowledge_state_mutate"
on public.runtime_knowledge_state
for all
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_knowledge_state.user_id
      and m.workspace_id = runtime_knowledge_state.workspace_id
      and m.member_user_id = auth.uid()::text
  )
)
with check (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_knowledge_state.user_id
      and m.workspace_id = runtime_knowledge_state.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_memory_entries_select" on public.runtime_memory_entries;
create policy "runtime_memory_entries_select"
on public.runtime_memory_entries
for select
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_memory_entries.user_id
      and m.workspace_id = runtime_memory_entries.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

drop policy if exists "runtime_memory_entries_mutate" on public.runtime_memory_entries;
create policy "runtime_memory_entries_mutate"
on public.runtime_memory_entries
for all
using (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_memory_entries.user_id
      and m.workspace_id = runtime_memory_entries.workspace_id
      and m.member_user_id = auth.uid()::text
  )
)
with check (
  auth.uid()::text = user_id
  or exists (
    select 1
    from public.runtime_workspace_members m
    where m.user_id = runtime_memory_entries.user_id
      and m.workspace_id = runtime_memory_entries.workspace_id
      and m.member_user_id = auth.uid()::text
  )
);

-- org + billing snapshots are owner-scoped

drop policy if exists "runtime_org_state_owner" on public.runtime_org_state;
create policy "runtime_org_state_owner"
on public.runtime_org_state
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "runtime_billing_state_owner" on public.runtime_billing_state;
create policy "runtime_billing_state_owner"
on public.runtime_billing_state
for all
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

-- Required indexes
create index if not exists runtime_workspaces_user_workspace_idx
  on public.runtime_workspaces (user_id, workspace_id);
create index if not exists runtime_workspaces_workspace_updated_idx
  on public.runtime_workspaces (workspace_id, updated_at desc);

create index if not exists runtime_workspace_members_user_workspace_idx
  on public.runtime_workspace_members (user_id, workspace_id);
create index if not exists runtime_workspace_members_workspace_updated_idx
  on public.runtime_workspace_members (workspace_id, updated_at desc);

create index if not exists runtime_workspace_invites_user_workspace_idx
  on public.runtime_workspace_invites (user_id, workspace_id);
create index if not exists runtime_workspace_invites_workspace_updated_idx
  on public.runtime_workspace_invites (workspace_id, updated_at desc);

create index if not exists runtime_conversation_metadata_user_workspace_idx
  on public.runtime_conversation_metadata (user_id, workspace_id);
create index if not exists runtime_conversation_metadata_workspace_updated_idx
  on public.runtime_conversation_metadata (workspace_id, updated_at desc);
create index if not exists runtime_conversation_metadata_conversation_idx
  on public.runtime_conversation_metadata (conversation_id);

create index if not exists runtime_workflow_state_user_workspace_idx
  on public.runtime_workflow_state (user_id, workspace_id);
create index if not exists runtime_workflow_state_workspace_updated_idx
  on public.runtime_workflow_state (workspace_id, updated_at desc);

create index if not exists runtime_knowledge_state_user_workspace_idx
  on public.runtime_knowledge_state (user_id, workspace_id);
create index if not exists runtime_knowledge_state_workspace_updated_idx
  on public.runtime_knowledge_state (workspace_id, updated_at desc);

create index if not exists runtime_memory_entries_user_workspace_idx
  on public.runtime_memory_entries (user_id, workspace_id);
create index if not exists runtime_memory_entries_workspace_updated_idx
  on public.runtime_memory_entries (workspace_id, updated_at desc);
