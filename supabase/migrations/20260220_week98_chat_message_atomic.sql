-- Week 98 follow-up migration
-- Add atomic chat message mutation functions to reduce array overwrite races.

create or replace function public.append_chat_message(
  p_chat_id uuid,
  p_message jsonb,
  p_touch_updated_at boolean default true
)
returns boolean
language plpgsql
as $$
begin
  update public.chats
  set
    messages = coalesce(messages, '[]'::jsonb) || p_message,
    updated_at = case when p_touch_updated_at then now() else updated_at end
  where id = p_chat_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Chat not found or access denied';
  end if;

  return true;
end;
$$;

create or replace function public.set_chat_messages(
  p_chat_id uuid,
  p_messages jsonb,
  p_touch_updated_at boolean default true
)
returns boolean
language plpgsql
as $$
begin
  update public.chats
  set
    messages = coalesce(p_messages, '[]'::jsonb),
    updated_at = case when p_touch_updated_at then now() else updated_at end
  where id = p_chat_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Chat not found or access denied';
  end if;

  return true;
end;
$$;

create or replace function public.upsert_chat_message(
  p_chat_id uuid,
  p_message jsonb,
  p_touch_updated_at boolean default true
)
returns boolean
language plpgsql
as $$
declare
  v_message_id text;
  v_current jsonb;
  v_next jsonb;
begin
  select coalesce(messages, '[]'::jsonb)
  into v_current
  from public.chats
  where id = p_chat_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Chat not found or access denied';
  end if;

  v_message_id := nullif(trim(coalesce(p_message->>'id', '')), '');
  if v_message_id is null then
    v_next := v_current || p_message;
  else
    with exploded as (
      select value as elem, ordinality as ord
      from jsonb_array_elements(v_current) with ordinality
    ),
    has_match as (
      select exists(select 1 from exploded where elem->>'id' = v_message_id) as present
    )
    select
      case
        when (select present from has_match)
          then coalesce(
            (select jsonb_agg(
              case when elem->>'id' = v_message_id then p_message else elem end
              order by ord
            ) from exploded),
            '[]'::jsonb
          )
        else v_current || p_message
      end
    into v_next;
  end if;

  update public.chats
  set
    messages = coalesce(v_next, '[]'::jsonb),
    updated_at = case when p_touch_updated_at then now() else updated_at end
  where id = p_chat_id
    and user_id = auth.uid();

  return true;
end;
$$;

create or replace function public.mark_chat_user_messages_read(
  p_chat_id uuid,
  p_touch_updated_at boolean default false
)
returns boolean
language plpgsql
as $$
declare
  v_current jsonb;
  v_next jsonb;
begin
  select coalesce(messages, '[]'::jsonb)
  into v_current
  from public.chats
  where id = p_chat_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Chat not found or access denied';
  end if;

  with exploded as (
    select value as elem, ordinality as ord
    from jsonb_array_elements(v_current) with ordinality
  )
  select coalesce(
    jsonb_agg(
      case
        when elem->>'role' = 'user' and coalesce(elem->>'status', '') <> 'read'
          then jsonb_set(elem, '{status}', '"read"'::jsonb, true)
        else elem
      end
      order by ord
    ),
    '[]'::jsonb
  )
  into v_next
  from exploded;

  update public.chats
  set
    messages = v_next,
    updated_at = case when p_touch_updated_at then now() else updated_at end
  where id = p_chat_id
    and user_id = auth.uid();

  return v_next <> v_current;
end;
$$;

create or replace function public.append_chat_message_generation_log(
  p_chat_id uuid,
  p_message_id text,
  p_log_entry text,
  p_touch_updated_at boolean default false
)
returns boolean
language plpgsql
as $$
declare
  v_message_id text;
  v_log_entry text;
  v_current jsonb;
  v_next jsonb;
  v_has_match boolean;
begin
  v_message_id := nullif(trim(coalesce(p_message_id, '')), '');
  v_log_entry := nullif(trim(coalesce(p_log_entry, '')), '');
  if v_message_id is null or v_log_entry is null then
    return false;
  end if;

  select coalesce(messages, '[]'::jsonb)
  into v_current
  from public.chats
  where id = p_chat_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Chat not found or access denied';
  end if;

  with exploded as (
    select value as elem, ordinality as ord
    from jsonb_array_elements(v_current) with ordinality
  )
  select exists(select 1 from exploded where elem->>'id' = v_message_id)
  into v_has_match;

  if not v_has_match then
    return false;
  end if;

  with exploded as (
    select value as elem, ordinality as ord
    from jsonb_array_elements(v_current) with ordinality
  )
  select coalesce(
    jsonb_agg(
      case
        when elem->>'id' = v_message_id then jsonb_set(
          elem,
          '{generationLogs}',
          case
            when coalesce(elem->'generationLogs', '[]'::jsonb) ? v_log_entry
              then coalesce(elem->'generationLogs', '[]'::jsonb)
            else coalesce(elem->'generationLogs', '[]'::jsonb) || to_jsonb(v_log_entry)
          end,
          true
        )
        else elem
      end
      order by ord
    ),
    '[]'::jsonb
  )
  into v_next
  from exploded;

  update public.chats
  set
    messages = v_next,
    updated_at = case when p_touch_updated_at then now() else updated_at end
  where id = p_chat_id
    and user_id = auth.uid();

  return true;
end;
$$;

create or replace function public.remove_chat_message(
  p_chat_id uuid,
  p_message_id text,
  p_touch_updated_at boolean default true
)
returns boolean
language plpgsql
as $$
declare
  v_message_id text;
  v_current jsonb;
  v_next jsonb;
begin
  v_message_id := nullif(trim(coalesce(p_message_id, '')), '');
  if v_message_id is null then
    return false;
  end if;

  select coalesce(messages, '[]'::jsonb)
  into v_current
  from public.chats
  where id = p_chat_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Chat not found or access denied';
  end if;

  with exploded as (
    select value as elem, ordinality as ord
    from jsonb_array_elements(v_current) with ordinality
  )
  select coalesce(
    jsonb_agg(elem order by ord),
    '[]'::jsonb
  )
  into v_next
  from exploded
  where elem->>'id' <> v_message_id;

  if v_next = v_current then
    return false;
  end if;

  update public.chats
  set
    messages = v_next,
    updated_at = case when p_touch_updated_at then now() else updated_at end
  where id = p_chat_id
    and user_id = auth.uid();

  return true;
end;
$$;
