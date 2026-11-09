-- =============================================================================
-- VBEATS — direct messages
--
-- Signed-in users can text each other one to one.
-- * Only the two people in a conversation can read it (Row Level Security).
--   Administrators have no special access to messages either.
-- * Messages are written only through send_message(): 1–2,000 characters,
--   at most 20 a minute and 500 a day per person.
-- * Anyone can block someone; after that neither of them can send messages
--   in their conversation until the block is lifted.
-- * "Delete conversation" hides the conversation and its history for you
--   only. A new message brings the conversation back (without the old ones).
-- * New messages arrive live through Supabase Realtime.
--
-- Run after files 1–7. Safe to run more than once.
-- =============================================================================

-- ------------------------------------------------------------ tables -------

-- One conversation per pair of people. The two ids are stored in a fixed
-- order (user_a < user_b) so a pair can't get two conversations.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_sender_id uuid,
  constraint conversations_ordered_pair check (user_a < user_b),
  constraint conversations_pair_key unique (user_a, user_b)
);

create index if not exists conversations_user_b_idx on public.conversations (user_b);
create index if not exists conversations_created_by_idx on public.conversations (created_by, created_at desc);

-- Each person's own state in a conversation. Only visible to that person, so
-- nobody can see when the other side deleted the conversation.
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Messages up to this time have been read.
  last_read_at timestamptz,
  -- "Delete conversation": messages up to this time are hidden for this person.
  cleared_at timestamptz not null default '-infinity',
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null constraint messages_body_length check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id, created_at desc);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ------------------------------------------------------ row security -------
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_blocks enable row level security;

drop policy if exists "people read their own conversations" on public.conversations;
create policy "people read their own conversations"
  on public.conversations for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

drop policy if exists "people read their own conversation state" on public.conversation_members;
create policy "people read their own conversation state"
  on public.conversation_members for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "people read messages in their conversations" on public.messages;
create policy "people read messages in their conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members m
      where m.conversation_id = messages.conversation_id
        and m.user_id = (select auth.uid())
        and messages.created_at > m.cleared_at
    )
  );

drop policy if exists "people see who they blocked" on public.user_blocks;
create policy "people see who they blocked"
  on public.user_blocks for select
  to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists "people block others" on public.user_blocks;
create policy "people block others"
  on public.user_blocks for insert
  to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists "people unblock others" on public.user_blocks;
create policy "people unblock others"
  on public.user_blocks for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- Same rule as every other table (file 6): a password-only session of someone
-- with two-factor authentication set up can't read or write anything.
drop policy if exists require_two_factor on public.conversations;
create policy require_two_factor on public.conversations as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists require_two_factor on public.conversation_members;
create policy require_two_factor on public.conversation_members as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists require_two_factor on public.messages;
create policy require_two_factor on public.messages as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
drop policy if exists require_two_factor on public.user_blocks;
create policy require_two_factor on public.user_blocks as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- ------------------------------------------------------------ writes -------

-- Opens (or finds) the conversation with another person and returns its id.
create or replace function public.start_conversation(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'You can''t message yourself' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  select c.id into v_id from public.conversations c
  where c.user_a = least(v_me, p_user) and c.user_b = greatest(v_me, p_user);
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.conversations c
      where c.created_by = v_me and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You''ve started a lot of new conversations today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.conversations (user_a, user_b, created_by)
  values (least(v_me, p_user), greatest(v_me, p_user), v_me)
  on conflict (user_a, user_b) do nothing
  returning id into v_id;

  if v_id is null then
    -- Created at the same moment by the other person.
    select c.id into v_id from public.conversations c
    where c.user_a = least(v_me, p_user) and c.user_b = greatest(v_me, p_user);
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (v_id, v_me), (v_id, p_user);
  end if;
  return v_id;
end;
$$;

-- Tidies a message: one kind of line break, no invisible control or
-- direction-changing characters, no spaces around it, at most one empty line
-- in a row.
create or replace function public.clean_message_body(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n'),
               '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12) || chr(14) || '-' || chr(31) || chr(127)
                   || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']',
               '', 'g'),
             '^[\s' || chr(8203) || chr(8204) || chr(8205) || chr(65279) || ']+|[\s' || chr(8203) || chr(8204) || chr(8205) || chr(65279) || ']+$',
             '', 'g'),
           E'\n{3,}', E'\n\n', 'g');
$$;

create or replace function public.send_message(p_conversation uuid, p_body text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conv public.conversations;
  v_other uuid;
  v_body text := public.clean_message_body(p_body);
  v_msg public.messages;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'Write a message first' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Messages can be up to 2,000 characters' using errcode = 'P0001';
  end if;

  -- Locking the conversation keeps its messages in order.
  select * into v_conv from public.conversations c where c.id = p_conversation for update;
  if not found or v_me not in (v_conv.user_a, v_conv.user_b) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  v_other := case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end;

  if exists (select 1 from public.user_blocks b where b.blocker_id = v_me and b.blocked_id = v_other) then
    raise exception 'You blocked this person. Unblock them to send messages.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.user_blocks b where b.blocker_id = v_other and b.blocked_id = v_me) then
    raise exception 'You can''t message this person.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.messages m
      where m.sender_id = v_me and m.created_at > clock_timestamp() - interval '1 minute') >= 20 then
    raise exception 'You''re sending messages too quickly. Wait a moment and try again.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m
      where m.sender_id = v_me and m.created_at > clock_timestamp() - interval '1 day') >= 500 then
    raise exception 'You''ve reached today''s message limit. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, body, created_at)
  values (v_conv.id, v_me, v_body, clock_timestamp())
  returning * into v_msg;

  update public.conversations
     set last_message_at = v_msg.created_at, last_sender_id = v_me
   where id = v_conv.id;
  -- Replying means you've seen the conversation.
  update public.conversation_members
     set last_read_at = v_msg.created_at
   where conversation_id = v_conv.id and user_id = v_me;

  return json_build_object(
    'id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'sender_id', v_msg.sender_id,
    'body', v_msg.body,
    'created_at', v_msg.created_at
  );
end;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to read messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  update public.conversation_members m
     set last_read_at = c.last_message_at
    from public.conversations c
   where m.conversation_id = p_conversation
     and m.user_id = v_me
     and c.id = m.conversation_id
     and c.last_message_at is not null
     and (m.last_read_at is null or m.last_read_at < c.last_message_at);
end;
$$;

-- Hides the conversation and everything in it for the caller only.
create or replace function public.delete_conversation(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to manage messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  update public.conversation_members m
     set cleared_at = coalesce(c.last_message_at, now()),
         last_read_at = coalesce(c.last_message_at, m.last_read_at)
    from public.conversations c
   where m.conversation_id = p_conversation
     and m.user_id = v_me
     and c.id = m.conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ------------------------------------------------------------- reads -------
-- These run with the caller's rights, so Row Level Security applies.

-- The caller's conversations, newest first, with the other person, the last
-- message they can see and how many messages they haven't read.
create or replace function public.list_conversations()
returns json
language sql
stable
set search_path = ''
as $$
  select coalesce(json_agg(x order by x.last_message_at desc), '[]'::json)
  from (
    select
      c.id,
      lm.created_at as last_message_at,
      json_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'producer_name', p.producer_name, 'avatar_path', p.avatar_path, 'is_verified', p.is_verified
      ) as other,
      json_build_object('body', left(lm.body, 200), 'sender_id', lm.sender_id, 'created_at', lm.created_at) as last_message,
      (
        select count(*)::int from public.messages u
        where u.conversation_id = c.id
          and u.sender_id <> me.user_id
          and u.created_at > coalesce(me.last_read_at, '-infinity')
      ) as unread_count
    from public.conversation_members me
    join public.conversations c on c.id = me.conversation_id
    join public.profiles p on p.id = case when c.user_a = me.user_id then c.user_b else c.user_a end
    cross join lateral (
      select m.body, m.sender_id, m.created_at
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) lm
    where me.user_id = (select auth.uid())
    order by lm.created_at desc
    limit 200
  ) x;
$$;

-- How many conversations have messages the caller hasn't read (navbar badge).
create or replace function public.unread_conversation_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  where m.user_id = (select auth.uid())
    and c.last_message_at is not null
    and c.last_sender_id is distinct from m.user_id
    and c.last_message_at > coalesce(m.last_read_at, '-infinity')
    and c.last_message_at > m.cleared_at;
$$;

-- One conversation for the chat screen: the other person, when they last read
-- it ("Seen") and whether either of you blocked the other. Null when the
-- caller isn't part of it.
create or replace function public.get_conversation(p_conversation uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conv public.conversations;
  v_other uuid;
begin
  if v_me is null or not public.mfa_satisfied() then
    return null;
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation;
  if not found or v_me not in (v_conv.user_a, v_conv.user_b) then
    return null;
  end if;
  v_other := case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end;

  return (
    select json_build_object(
      'id', v_conv.id,
      'other', json_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'producer_name', p.producer_name, 'avatar_path', p.avatar_path,
        'is_verified', p.is_verified, 'role', p.role
      ),
      'other_read_at', (
        select m.last_read_at from public.conversation_members m
        where m.conversation_id = v_conv.id and m.user_id = v_other
      ),
      'blocked_by_me', exists (select 1 from public.user_blocks b where b.blocker_id = v_me and b.blocked_id = v_other),
      'blocked_me', exists (select 1 from public.user_blocks b where b.blocker_id = v_other and b.blocked_id = v_me)
    )
    from public.profiles p
    where p.id = v_other
  );
end;
$$;

-- ---------------------------------------------------------- privileges -----
-- Messages are only written through the functions above; people may add and
-- remove their own blocks directly. Visitors who aren't signed in get nothing.
revoke all on public.conversations, public.conversation_members, public.messages, public.user_blocks from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant all on public.conversations, public.conversation_members, public.messages, public.user_blocks to service_role;

revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.delete_conversation(uuid) from public, anon;
revoke execute on function public.list_conversations() from public, anon;
revoke execute on function public.unread_conversation_count() from public, anon;
revoke execute on function public.get_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated, service_role;
grant execute on function public.send_message(uuid, text) to authenticated, service_role;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;
grant execute on function public.delete_conversation(uuid) to authenticated, service_role;
grant execute on function public.list_conversations() to authenticated, service_role;
grant execute on function public.unread_conversation_count() to authenticated, service_role;
grant execute on function public.get_conversation(uuid) to authenticated, service_role;
grant execute on function public.clean_message_body(text) to anon, authenticated, service_role;

-- ------------------------------------------------------------ realtime -----
-- Lets the site show new messages (and the unread badge) without reloading.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members') then
      alter publication supabase_realtime add table public.conversation_members;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
