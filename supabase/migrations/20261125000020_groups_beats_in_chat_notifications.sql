-- =============================================================================
-- VBEATS — group chats, pinned messages, beats in messages, notifications
--
-- * Group chats: 3 to 50 people. Anyone in a group can rename it, change its
--   picture and add people; whoever made it can remove people; anyone can
--   leave. Changes appear in the chat as small lines ("Anna renamed the
--   group"). Blocks keep applying to one-to-one chats, and nobody can put
--   someone who blocked them (or whom they blocked) into a group.
-- * Pinned messages: anyone in a conversation can pin a message or unpin it;
--   everyone in it sees the pinned messages at the top.
-- * Beats in messages: a message can carry a beat from the marketplace, shown
--   as a card with a play button.
-- * Notifications: likes on your beats, sales and free downloads, new
--   followers, collaboration invites and answers, and the review of your beats
--   and packs, with who and when. Only you can see your notifications.
--
-- Run after files 1–19. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later table changes aren't blocked.
set constraints all immediate;

-- ================================================================ tables ===
alter table public.conversations add column if not exists is_group boolean not null default false;
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists photo_path text;
alter table public.conversations alter column user_a drop not null;
alter table public.conversations alter column user_b drop not null;
alter table public.conversations drop constraint if exists conversations_ordered_pair;
alter table public.conversations drop constraint if exists conversations_kind;
alter table public.conversations add constraint conversations_kind check (
  case
    when is_group then
      user_a is null and user_b is null
      and title is not null and char_length(title) between 1 and 60
      and (photo_path is null or char_length(photo_path) <= 300)
    else
      user_a is not null and user_b is not null and user_a < user_b
      and title is null and photo_path is null
  end
);

-- When each person joined (the order members are listed in) and who added them.
alter table public.conversation_members add column if not exists joined_at timestamptz not null default now();
alter table public.conversation_members add column if not exists added_by uuid references public.profiles (id) on delete set null;

-- What a message is: text (with photos/videos), a shared beat, or a line about
-- the group ("Anna renamed the group"). Pinned messages show at the top.
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages add column if not exists beat_id uuid references public.beats (id) on delete set null;
alter table public.messages add column if not exists event jsonb;
alter table public.messages add column if not exists pinned_at timestamptz;
alter table public.messages add column if not exists pinned_by uuid references public.profiles (id) on delete set null;
alter table public.messages drop constraint if exists messages_kind;
alter table public.messages add constraint messages_kind check (kind in ('text', 'beat', 'event'));
alter table public.messages drop constraint if exists messages_body_length;
alter table public.messages add constraint messages_body_length check (
  char_length(body) <= 2000
  and (kind <> 'text' or char_length(body) >= 1 or jsonb_array_length(attachments) > 0)
);
alter table public.messages drop constraint if exists messages_event_shape;
alter table public.messages add constraint messages_event_shape check (
  (kind = 'event') = (event is not null) and (event is null or jsonb_typeof(event) = 'object')
);
create index if not exists messages_pinned_idx on public.messages (conversation_id, pinned_at desc) where pinned_at is not null;
create index if not exists messages_beat_idx on public.messages (beat_id) where beat_id is not null;

-- People see the conversations they're in (groups have no fixed pair).
drop policy if exists "people read their own conversations" on public.conversations;
create policy "people read their own conversations"
  on public.conversations for select
  to authenticated
  using (exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversations.id and m.user_id = (select auth.uid())
  ));

-- ================================================================ helpers ===
-- Whether either of two people blocked the other.
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- The name the site shows for someone.
create or replace function public.display_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.producer_name), ''), nullif(btrim(p.display_name), ''), p.username)
  from public.profiles p where p.id = p_user;
$$;

revoke all on function public.display_name_of(uuid) from public, anon, authenticated;

-- A group picture: an image the person uploaded to their own folder of the
-- public avatars bucket.
create or replace function public.valid_group_photo(p_path text, p_user uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is null
      or (p_path ~ ('^' || p_user::text || '/[A-Za-z0-9._-]{1,120}$') and p_path not like '%..%');
$$;

-- Too many messages (and group changes) in a short time.
create or replace function public.assert_message_rate(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.messages m
      where m.sender_id = p_user and m.created_at > clock_timestamp() - interval '1 minute') >= 20 then
    raise exception 'You''re sending messages too quickly. Wait a moment and try again.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.messages m
      where m.sender_id = p_user and m.created_at > clock_timestamp() - interval '1 day') >= 500 then
    raise exception 'You''ve reached today''s message limit. Try again tomorrow.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_message_rate(uuid) from public, anon, authenticated;

-- A line about the conversation ("Anna renamed the group"), from the person who did it.
create or replace function public.post_conversation_event(p_conversation uuid, p_actor uuid, p_event jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := clock_timestamp();
begin
  insert into public.messages (conversation_id, sender_id, body, kind, event, created_at)
  values (p_conversation, p_actor, '', 'event', p_event || jsonb_build_object('actor', public.display_name_of(p_actor)), v_at);
  update public.conversations set last_message_at = v_at, last_sender_id = p_actor where id = p_conversation;
  update public.conversation_members set last_read_at = v_at
   where conversation_id = p_conversation and user_id = p_actor;
end;
$$;

revoke all on function public.post_conversation_event(uuid, uuid, jsonb) from public, anon, authenticated;

-- One line of text for a message in the inbox: what it says, or what happened
-- (without the name of who did it, which the inbox adds).
create or replace function public.message_preview_text(p_message public.messages)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_message.kind = 'event' then
      case p_message.event ->> 'type'
        when 'created' then 'created the group'
        when 'renamed' then 'renamed the group “' || coalesce(p_message.event ->> 'title', '') || '”'
        when 'photo' then case when (p_message.event ->> 'removed')::boolean then 'removed the group picture' else 'changed the group picture' end
        when 'added' then 'added ' || coalesce((select string_agg(u ->> 'name', ', ') from jsonb_array_elements(p_message.event -> 'users') u), 'people')
        when 'removed' then 'removed ' || coalesce(p_message.event -> 'user' ->> 'name', 'someone')
        when 'left' then 'left the group'
        when 'pinned' then 'pinned a message'
        when 'unpinned' then 'unpinned a message'
        else 'updated the conversation'
      end
    when p_message.body <> '' then left(p_message.body, 200)
    when p_message.kind = 'beat' then '🎵 ' || coalesce((select b.title from public.beats b where b.id = p_message.beat_id), 'A beat')
    when p_message.attachments -> 0 ->> 'kind' = 'video' then '🎬 Video'
    when jsonb_array_length(p_message.attachments) > 0 then '📷 Photo'
    else ''
  end;
$$;

revoke all on function public.message_preview_text(public.messages) from public, anon, authenticated;

-- =========================================================== group chats ===
-- Makes a group with the caller and at least two other people. Returns its id.
create or replace function public.create_group(p_title text, p_members uuid[], p_photo_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_title text := btrim(regexp_replace(public.clean_message_body(p_title), '\s+', ' ', 'g'));
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_others uuid[];
  v_user uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 60 then
    raise exception 'Give the group a name (up to 60 characters)' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_others
  from unnest(coalesce(p_members, '{}'::uuid[])) u
  where u is not null and u <> v_me;
  if cardinality(v_others) < 2 then
    raise exception 'Pick at least two people for a group' using errcode = 'P0001';
  end if;
  if cardinality(v_others) > 49 then
    raise exception 'A group can have up to 50 people' using errcode = 'P0001';
  end if;
  foreach v_user in array v_others loop
    if not exists (select 1 from public.profiles p where p.id = v_user) then
      raise exception 'User not found' using errcode = 'P0002';
    end if;
    if public.blocked_between(v_me, v_user) then
      raise exception 'You can''t add % to a group.', public.display_name_of(v_user) using errcode = 'P0001';
    end if;
  end loop;
  if not public.valid_group_photo(v_photo, v_me) then
    raise exception 'Upload the group picture again' using errcode = 'P0001';
  end if;
  if (select count(*) from public.conversations c
      where c.created_by = v_me and c.is_group and c.created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve made a lot of groups today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  perform public.assert_message_rate(v_me);

  insert into public.conversations (is_group, title, photo_path, created_by)
  values (true, v_title, v_photo, v_me)
  returning id into v_id;
  insert into public.conversation_members (conversation_id, user_id, added_by, joined_at)
  values (v_id, v_me, v_me, clock_timestamp());
  insert into public.conversation_members (conversation_id, user_id, added_by, joined_at)
  select v_id, u, v_me, clock_timestamp() from unnest(v_others) u;
  perform public.post_conversation_event(v_id, v_me, jsonb_build_object('type', 'created', 'title', v_title));
  return v_id;
end;
$$;

revoke all on function public.create_group(text, uuid[], text) from public, anon;
grant execute on function public.create_group(text, uuid[], text) to authenticated, service_role;

-- Adds people to a group (anyone in it can). Returns how many were added.
create or replace function public.add_group_members(p_conversation uuid, p_members uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conv public.conversations;
  v_new uuid[];
  v_user uuid;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation for update;
  if not found or not v_conv.is_group
     or not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = v_me) then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_new
  from unnest(coalesce(p_members, '{}'::uuid[])) u
  where u is not null
    and not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = u);
  if cardinality(v_new) = 0 then
    return 0;
  end if;
  if (select count(*) from public.conversation_members m where m.conversation_id = p_conversation) + cardinality(v_new) > 50 then
    raise exception 'A group can have up to 50 people' using errcode = 'P0001';
  end if;
  foreach v_user in array v_new loop
    if not exists (select 1 from public.profiles p where p.id = v_user) then
      raise exception 'User not found' using errcode = 'P0002';
    end if;
    if public.blocked_between(v_me, v_user) then
      raise exception 'You can''t add % to a group.', public.display_name_of(v_user) using errcode = 'P0001';
    end if;
  end loop;
  perform public.assert_message_rate(v_me);

  insert into public.conversation_members (conversation_id, user_id, added_by, joined_at)
  select p_conversation, u, v_me, clock_timestamp() from unnest(v_new) u
  on conflict (conversation_id, user_id) do nothing;
  perform public.post_conversation_event(p_conversation, v_me, jsonb_build_object(
    'type', 'added',
    'users', (select jsonb_agg(jsonb_build_object('id', u, 'name', public.display_name_of(u))) from unnest(v_new) u)
  ));
  return cardinality(v_new);
end;
$$;

revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated, service_role;

-- Takes someone out of a group (only whoever runs the group), or leaves it
-- (anyone, with their own id). The last one out deletes the group.
create or replace function public.remove_group_member(p_conversation uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conv public.conversations;
  v_name text;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation for update;
  if not found or not v_conv.is_group
     or not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = v_me) then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;
  if p_user is distinct from v_me and v_conv.created_by is distinct from v_me then
    raise exception 'Only the person who runs the group can remove people' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = p_user) then
    return;
  end if;
  v_name := public.display_name_of(p_user);

  delete from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = p_user;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation) then
    delete from public.conversations c where c.id = p_conversation;
    return;
  end if;
  -- Whoever runs the group left: the person who's been in it longest takes over.
  if v_conv.created_by is not distinct from p_user then
    update public.conversations c
       set created_by = (select m.user_id from public.conversation_members m
                         where m.conversation_id = p_conversation order by m.joined_at, m.user_id limit 1)
     where c.id = p_conversation;
  end if;
  if p_user = v_me then
    perform public.post_conversation_event(p_conversation, v_me, jsonb_build_object('type', 'left'));
  else
    perform public.post_conversation_event(p_conversation, v_me,
      jsonb_build_object('type', 'removed', 'user', jsonb_build_object('id', p_user, 'name', v_name)));
  end if;
end;
$$;

revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated, service_role;

-- Renames a group and/or changes or removes its picture (anyone in it can).
create or replace function public.update_group(
  p_conversation uuid,
  p_title text default null,
  p_photo_path text default null,
  p_remove_photo boolean default false
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conv public.conversations;
  v_title text;
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  select * into v_conv from public.conversations c where c.id = p_conversation for update;
  if not found or not v_conv.is_group
     or not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = v_me) then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  if p_title is not null then
    v_title := btrim(regexp_replace(public.clean_message_body(p_title), '\s+', ' ', 'g'));
    if char_length(v_title) not between 1 and 60 then
      raise exception 'Give the group a name (up to 60 characters)' using errcode = 'P0001';
    end if;
    if v_title is distinct from v_conv.title then
      perform public.assert_message_rate(v_me);
      update public.conversations set title = v_title where id = p_conversation;
      perform public.post_conversation_event(p_conversation, v_me, jsonb_build_object('type', 'renamed', 'title', v_title));
    end if;
  end if;

  if coalesce(p_remove_photo, false) then
    if v_conv.photo_path is not null then
      perform public.assert_message_rate(v_me);
      update public.conversations set photo_path = null where id = p_conversation;
      perform public.post_conversation_event(p_conversation, v_me, jsonb_build_object('type', 'photo', 'removed', true));
    end if;
  elsif v_photo is not null then
    if not public.valid_group_photo(v_photo, v_me) then
      raise exception 'Upload the group picture again' using errcode = 'P0001';
    end if;
    if v_photo is distinct from v_conv.photo_path then
      perform public.assert_message_rate(v_me);
      update public.conversations set photo_path = v_photo where id = p_conversation;
      perform public.post_conversation_event(p_conversation, v_me, jsonb_build_object('type', 'photo', 'removed', false));
    end if;
  end if;

  return (select json_build_object('title', c.title, 'photo_path', c.photo_path) from public.conversations c where c.id = p_conversation);
end;
$$;

revoke all on function public.update_group(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_group(uuid, text, text, boolean) to authenticated, service_role;

-- ======================================================= pinned messages ===
-- Pins a message to the top of its conversation, or unpins it. Returns
-- whether it's pinned now.
create or replace function public.pin_message(p_message uuid, p_pinned boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_msg public.messages;
  v_conv public.conversations;
  v_pin boolean := coalesce(p_pinned, false);
begin
  if v_me is null then
    raise exception 'Sign in to manage messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  select * into v_msg from public.messages m where m.id = p_message for update;
  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  select * into v_conv from public.conversations c where c.id = v_msg.conversation_id;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = v_msg.conversation_id and cm.user_id = v_me and v_msg.created_at > cm.cleared_at
  ) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  if v_msg.kind = 'event' then
    raise exception 'This can''t be pinned' using errcode = 'P0001';
  end if;
  if not v_conv.is_group
     and public.blocked_between(v_me, case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end) then
    raise exception 'You can''t pin messages in this conversation.' using errcode = 'P0001';
  end if;
  if (v_msg.pinned_at is not null) = v_pin then
    return v_pin;
  end if;
  if v_pin and (select count(*) from public.messages m
                where m.conversation_id = v_msg.conversation_id and m.pinned_at is not null) >= 25 then
    raise exception 'A conversation can have up to 25 pinned messages. Unpin one first.' using errcode = 'P0001';
  end if;
  perform public.assert_message_rate(v_me);

  update public.messages
     set pinned_at = case when v_pin then clock_timestamp() end,
         pinned_by = case when v_pin then v_me end
   where id = p_message;
  perform public.post_conversation_event(v_msg.conversation_id, v_me, jsonb_build_object(
    'type', case when v_pin then 'pinned' else 'unpinned' end,
    'message_id', v_msg.id,
    'preview', left(public.message_preview_text(v_msg), 120)
  ));
  return v_pin;
end;
$$;

revoke all on function public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.pin_message(uuid, boolean) to authenticated, service_role;

-- ======================================================= sending messages ===
-- Unchanged from file 13 except: group chats (anyone in them can write; blocks
-- only apply one to one) and a beat from the marketplace (p_beat), with or
-- without text.
drop function if exists public.send_message(uuid, text, jsonb);
create or replace function public.send_message(
  p_conversation uuid,
  p_body text,
  p_attachments jsonb default '[]'::jsonb,
  p_beat uuid default null
)
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
  v_list jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_files jsonb := '[]'::jsonb;
  v_file jsonb;
  v_path text;
  v_meta jsonb;
  v_mime text;
  v_kind text;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  if jsonb_typeof(v_list) <> 'array' then
    raise exception 'Attachments must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(v_list) > 10 then
    raise exception 'You can send up to 10 photos or videos at once' using errcode = 'P0001';
  end if;
  if v_body = '' and jsonb_array_length(v_list) = 0 and p_beat is null then
    raise exception 'Write a message first' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Messages can be up to 2,000 characters' using errcode = 'P0001';
  end if;

  -- Locking the conversation keeps its messages in order.
  select * into v_conv from public.conversations c where c.id = p_conversation for update;
  if not found
     or not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = v_me) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if not v_conv.is_group then
    v_other := case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end;
    if exists (select 1 from public.user_blocks b where b.blocker_id = v_me and b.blocked_id = v_other) then
      raise exception 'You blocked this person. Unblock them to send messages.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.user_blocks b where b.blocker_id = v_other and b.blocked_id = v_me) then
      raise exception 'You can''t message this person.' using errcode = 'P0001';
    end if;
  end if;

  if p_beat is not null and not exists (select 1 from public.beats b where b.id = p_beat and b.status = 'published') then
    raise exception 'This beat isn''t available to share' using errcode = 'P0001';
  end if;

  perform public.assert_message_rate(v_me);

  -- Each attachment must be a photo or video this sender uploaded to this
  -- conversation's folder; what's stored comes from the file itself.
  for v_file in select value from jsonb_array_elements(v_list) loop
    v_path := v_file ->> 'path';
    if v_path is null or v_path not like v_conv.id::text || '/' || v_me::text || '/%' or v_path like '%..%' then
      raise exception 'Attachment not found' using errcode = 'P0001';
    end if;
    continue when v_files @> jsonb_build_array(jsonb_build_object('path', v_path));
    select o.metadata into v_meta from storage.objects o where o.bucket_id = 'message-media' and o.name = v_path;
    if not found then
      raise exception 'Attachment not found' using errcode = 'P0001';
    end if;
    v_mime := lower(coalesce(v_meta ->> 'mimetype', ''));
    v_kind := case when v_mime like 'image/%' then 'image' when v_mime like 'video/%' then 'video' end;
    if v_kind is null then
      raise exception 'Only photos and videos can be sent' using errcode = 'P0001';
    end if;
    v_files := v_files || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'path', v_path,
      'kind', v_kind,
      'mime', v_mime,
      'size', case when (v_meta ->> 'size') ~ '^\d{1,12}$' then (v_meta ->> 'size')::bigint end,
      'width', case when (v_file ->> 'width') ~ '^\d{1,5}$' then (v_file ->> 'width')::int end,
      'height', case when (v_file ->> 'height') ~ '^\d{1,5}$' then (v_file ->> 'height')::int end,
      'name', left(nullif(btrim(v_file ->> 'name'), ''), 120)
    )));
  end loop;

  insert into public.messages (conversation_id, sender_id, body, attachments, kind, beat_id, created_at)
  values (v_conv.id, v_me, v_body, v_files, case when p_beat is null then 'text' else 'beat' end, p_beat, clock_timestamp())
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
    'attachments', v_msg.attachments,
    'kind', v_msg.kind,
    'beat_id', v_msg.beat_id,
    'created_at', v_msg.created_at
  );
end;
$$;

revoke all on function public.send_message(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, jsonb, uuid) to authenticated, service_role;

-- Unchanged from file 13 except for group chats (and no reactions on group lines).
create or replace function public.react_to_message(p_message uuid, p_emoji text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_msg public.messages;
  v_conv public.conversations;
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_now text;
begin
  if v_me is null then
    raise exception 'Sign in to react to messages' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
  if v_emoji is not null and (char_length(v_emoji) > 16 or v_emoji ~ '[[:space:]A-Za-z<>&"''\\]') then
    raise exception 'Pick an emoji' using errcode = 'P0001';
  end if;

  select * into v_msg from public.messages m where m.id = p_message;
  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  select * into v_conv from public.conversations c where c.id = v_msg.conversation_id;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = v_conv.id and cm.user_id = v_me and v_msg.created_at > cm.cleared_at
  ) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  if v_msg.kind = 'event' then
    raise exception 'You can''t react to this' using errcode = 'P0001';
  end if;
  if not v_conv.is_group
     and public.blocked_between(v_me, case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end) then
    raise exception 'You can''t react in this conversation.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.message_reactions r
      where r.user_id = v_me and r.updated_at > clock_timestamp() - interval '1 minute') >= 60 then
    raise exception 'You''re reacting too quickly. Wait a moment and try again.' using errcode = 'P0001';
  end if;

  insert into public.message_reactions as r (message_id, user_id, emoji, updated_at)
  values (p_message, v_me, v_emoji, clock_timestamp())
  on conflict (message_id, user_id) do update
    set emoji = case when r.emoji is not distinct from excluded.emoji then null else excluded.emoji end,
        updated_at = excluded.updated_at
  returning r.emoji into v_now;
  return v_now;
end;
$$;

-- ============================================================ reading ===
-- Unchanged from file 14 for one-to-one chats; for groups: their name,
-- picture, who runs them and everyone in them (with what they received and read).
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
  if not found
     or not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = v_me) then
    return null;
  end if;

  if v_conv.is_group then
    return json_build_object(
      'id', v_conv.id,
      'is_group', true,
      'title', v_conv.title,
      'photo_path', v_conv.photo_path,
      'created_by', v_conv.created_by,
      'other', null,
      'other_read_at', null,
      'other_delivered_at', null,
      'blocked_by_me', false,
      'blocked_me', false,
      'members', (
        select coalesce(json_agg(json_build_object(
          'id', p.id, 'username', p.username, 'display_name', p.display_name,
          'producer_name', p.producer_name, 'avatar_path', p.avatar_path,
          'is_verified', p.is_verified, 'role', p.role,
          'read_at', m.last_read_at,
          'delivered_at', greatest(m.delivered_at, m.last_read_at),
          'joined_at', m.joined_at
        ) order by m.joined_at, p.id), '[]'::json)
        from public.conversation_members m
        join public.profiles p on p.id = m.user_id
        where m.conversation_id = v_conv.id
      )
    );
  end if;

  v_other := case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end;
  return (
    select json_build_object(
      'id', v_conv.id,
      'is_group', false,
      'other', json_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'producer_name', p.producer_name, 'avatar_path', p.avatar_path,
        'is_verified', p.is_verified, 'role', p.role
      ),
      'other_read_at', (
        select m.last_read_at from public.conversation_members m
        where m.conversation_id = v_conv.id and m.user_id = v_other
      ),
      'other_delivered_at', (
        select greatest(m.delivered_at, m.last_read_at) from public.conversation_members m
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

-- Unchanged from file 13 except: groups (name, picture, a few of the people
-- in them and how many), shared beats and group lines in the last message,
-- and who wrote it.
create or replace function public.list_conversations()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or not public.mfa_satisfied() then
    return '[]'::json;
  end if;
  return (
    select coalesce(json_agg(x order by x.pinned_at desc nulls last, x.last_message_at desc), '[]'::json)
    from (
      select
        c.id,
        c.is_group,
        c.title,
        c.photo_path,
        lm.created_at as last_message_at,
        me.pinned_at,
        me.pinned_at is not null as pinned,
        case when not c.is_group then (
          select json_build_object(
            'id', p.id, 'username', p.username, 'display_name', p.display_name,
            'producer_name', p.producer_name, 'avatar_path', p.avatar_path, 'is_verified', p.is_verified
          )
          from public.profiles p where p.id = case when c.user_a = v_me then c.user_b else c.user_a end
        ) end as other,
        case when c.is_group then (
          select json_agg(json_build_object(
            'id', p.id, 'username', p.username, 'display_name', p.display_name,
            'producer_name', p.producer_name, 'avatar_path', p.avatar_path
          ) order by gm.joined_at)
          from (
            select m.user_id, m.joined_at from public.conversation_members m
            where m.conversation_id = c.id and m.user_id <> v_me
            order by m.joined_at, m.user_id
            limit 3
          ) gm
          join public.profiles p on p.id = gm.user_id
        ) end as members,
        case when c.is_group then (select count(*)::int from public.conversation_members m where m.conversation_id = c.id) end as member_count,
        json_build_object(
          'body', public.message_preview_text(lm.msg),
          'kind', lm.kind,
          'sender_id', lm.sender_id,
          'sender_name', public.display_name_of(lm.sender_id),
          'created_at', lm.created_at
        ) as last_message,
        (
          select count(*)::int from public.messages u
          where u.conversation_id = c.id
            and u.sender_id <> me.user_id
            and u.created_at > coalesce(me.last_read_at, '-infinity')
            and u.created_at > me.cleared_at
        ) as unread_count
      from public.conversation_members me
      join public.conversations c on c.id = me.conversation_id
      cross join lateral (
        select m.*, m as msg from public.messages m
        where m.conversation_id = c.id and m.created_at > me.cleared_at
        order by m.created_at desc
        limit 1
      ) lm
      where me.user_id = v_me
      order by me.pinned_at desc nulls last, lm.created_at desc
      limit 200
    ) x
  );
end;
$$;

revoke all on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated, service_role;

-- "Typing…": unchanged from file 18 except that blocks only apply one to one.
create or replace function public.can_use_typing_channel(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation uuid;
begin
  if v_me is null or p_topic is null
     or p_topic !~* '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not public.mfa_satisfied() then
    return false;
  end if;
  v_conversation := substr(p_topic, 8)::uuid;
  return exists (
      select 1 from public.conversation_members m
      where m.conversation_id = v_conversation and m.user_id = v_me
    )
    and (
      coalesce((select c.is_group from public.conversations c where c.id = v_conversation), false)
      or not exists (
        select 1
        from public.conversation_members o
        join public.user_blocks b
          on (b.blocker_id = o.user_id and b.blocked_id = v_me)
          or (b.blocker_id = v_me and b.blocked_id = o.user_id)
        where o.conversation_id = v_conversation and o.user_id <> v_me
      )
    );
end;
$$;

-- ========================================================= notifications ===
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Who it's for.
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'like', 'sale', 'free_download', 'follow',
    'collab_invite', 'collab_accepted', 'collab_declined',
    'beat_approved', 'beat_rejected', 'pack_approved', 'pack_rejected'
  )),
  -- Who did it (none for reviews).
  actor_id uuid references public.profiles (id) on delete cascade,
  beat_id uuid references public.beats (id) on delete cascade,
  pack_id uuid references public.beat_packs (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
-- One per person and beat for likes, one per follower, one per item sold.
create unique index if not exists notifications_like_key on public.notifications (user_id, actor_id, beat_id) where type = 'like';
create unique index if not exists notifications_follow_key on public.notifications (user_id, actor_id) where type = 'follow';
create unique index if not exists notifications_sale_key on public.notifications (user_id, order_item_id) where type in ('sale', 'free_download');

alter table public.notifications enable row level security;

drop policy if exists "people read their own notifications" on public.notifications;
create policy "people read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists require_two_factor on public.notifications;
create policy require_two_factor on public.notifications as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- The producer of a beat and its co-producer (an accepted collaboration).
create or replace function public.beat_producers(p_beat uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.producer_id from public.beats b where b.id = p_beat
  union
  select c.collaborator_id from public.beat_collaborations c where c.beat_id = p_beat and c.status = 'accepted';
$$;

revoke all on function public.beat_producers(uuid) from public, anon, authenticated;

-- Likes: the producers hear about it; taking the like back removes it. Like
-- the "Liked by" list (file 17), a producer the liker has blocked isn't told.
create or replace function public.notify_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, actor_id, beat_id)
    select r, 'like', new.user_id, new.beat_id
    from public.beat_producers(new.beat_id) r
    where r is distinct from new.user_id
      and not exists (select 1 from public.user_blocks ub where ub.blocker_id = new.user_id and ub.blocked_id = r)
    on conflict (user_id, actor_id, beat_id) where type = 'like'
      do update set created_at = now(), read_at = null;
  else
    delete from public.notifications n
     where n.type = 'like' and n.actor_id = old.user_id and n.beat_id = old.beat_id;
  end if;
  return null;
end;
$$;

revoke all on function public.notify_like() from public, anon, authenticated;

drop trigger if exists favorites_notify on public.favorites;
create trigger favorites_notify
  after insert or delete on public.favorites
  for each row execute function public.notify_like();

-- Follows: "Anna started following you".
create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, actor_id)
    values (new.followee_id, 'follow', new.follower_id)
    on conflict (user_id, actor_id) where type = 'follow'
      do update set created_at = now(), read_at = null;
  else
    delete from public.notifications n
     where n.type = 'follow' and n.user_id = old.followee_id and n.actor_id = old.follower_id;
  end if;
  return null;
end;
$$;

revoke all on function public.notify_follow() from public, anon, authenticated;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert or delete on public.follows
  for each row execute function public.notify_follow();

-- Sales and free downloads: one per item bought (a pack is one item), for its
-- producer and the beat's co-producer.
create or replace function public.notify_purchase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.order_items;
begin
  select * into it from public.order_items oi where oi.id = new.order_item_id;
  if not found then
    return null;
  end if;
  insert into public.notifications (user_id, type, actor_id, beat_id, pack_id, order_item_id, data)
  select r,
         case when it.price = 0 then 'free_download' else 'sale' end,
         new.buyer_id,
         case when it.pack_id is null then it.beat_id end,
         it.pack_id,
         it.id,
         jsonb_build_object('license_name', it.license_name, 'title', it.beat_title, 'price', it.price, 'currency', it.currency)
  from (
    select it.seller_id as r
    union
    select c.collaborator_id from public.beat_collaborations c
    where it.pack_id is null and c.beat_id = it.beat_id and c.status = 'accepted'
  ) people
  where r is not null and r is distinct from new.buyer_id
  on conflict (user_id, order_item_id) where type in ('sale', 'free_download') do nothing;
  return null;
end;
$$;

revoke all on function public.notify_purchase() from public, anon, authenticated;

drop trigger if exists purchases_notify on public.purchases;
create trigger purchases_notify
  after insert on public.purchases
  for each row execute function public.notify_purchase();

-- Blocking someone takes back the notifications of your likes on their beats
-- (follows end with the block, and their notifications with them).
create or replace function public.notify_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   where n.type = 'like' and n.actor_id = new.blocker_id and n.user_id = new.blocked_id;
  return null;
end;
$$;

revoke all on function public.notify_block() from public, anon, authenticated;

drop trigger if exists user_blocks_notify on public.user_blocks;
create trigger user_blocks_notify
  after insert on public.user_blocks
  for each row execute function public.notify_block();

-- Collaborations: the invited producer hears about the invite, whoever
-- invited hears the answer.
create or replace function public.notify_collaboration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (user_id, type, actor_id, beat_id, data)
    values (new.collaborator_id, 'collab_invite', new.owner_id, new.beat_id, jsonb_build_object('share_percent', new.share_percent));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'declined') then
    insert into public.notifications (user_id, type, actor_id, beat_id, data)
    values (new.owner_id, case when new.status = 'accepted' then 'collab_accepted' else 'collab_declined' end,
            new.collaborator_id, new.beat_id, jsonb_build_object('share_percent', new.share_percent));
  end if;
  return null;
end;
$$;

revoke all on function public.notify_collaboration() from public, anon, authenticated;

drop trigger if exists beat_collaborations_notify on public.beat_collaborations;
create trigger beat_collaborations_notify
  after insert or update of status on public.beat_collaborations
  for each row execute function public.notify_collaboration();

-- Reviews: "Your beat was approved" / "…wasn't approved: <reason>".
create or replace function public.notify_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
begin
  if old.status = 'pending' and new.status in ('published', 'rejected') then
    if tg_table_name = 'beats' then
      v_type := case when new.status = 'published' then 'beat_approved' else 'beat_rejected' end;
      insert into public.notifications (user_id, type, beat_id, data)
      values (new.producer_id, v_type, new.id, jsonb_strip_nulls(jsonb_build_object('reason', new.rejection_reason)));
    else
      v_type := case when new.status = 'published' then 'pack_approved' else 'pack_rejected' end;
      insert into public.notifications (user_id, type, pack_id, data)
      values (new.producer_id, v_type, new.id, jsonb_strip_nulls(jsonb_build_object('reason', new.rejection_reason)));
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.notify_review() from public, anon, authenticated;

drop trigger if exists beats_notify_review on public.beats;
create trigger beats_notify_review
  after update of status on public.beats
  for each row execute function public.notify_review();

drop trigger if exists beat_packs_notify_review on public.beat_packs;
create trigger beat_packs_notify_review
  after update of status on public.beat_packs
  for each row execute function public.notify_review();

-- What happened before this update: likes, follows, sales and free downloads
-- so far, at the time they happened, already marked read (so the bell doesn't
-- light up with old news). Running the file again adds nothing twice.
insert into public.notifications (user_id, type, actor_id, beat_id, created_at, read_at)
select r, 'like', f.user_id, f.beat_id, f.created_at, now()
from public.favorites f
cross join lateral public.beat_producers(f.beat_id) r
where r is distinct from f.user_id
  and not exists (select 1 from public.user_blocks ub where ub.blocker_id = f.user_id and ub.blocked_id = r)
on conflict (user_id, actor_id, beat_id) where type = 'like' do nothing;

insert into public.notifications (user_id, type, actor_id, created_at, read_at)
select f.followee_id, 'follow', f.follower_id, f.created_at, now()
from public.follows f
on conflict (user_id, actor_id) where type = 'follow' do nothing;

insert into public.notifications (user_id, type, actor_id, beat_id, pack_id, order_item_id, data, created_at, read_at)
select r,
       case when it.price = 0 then 'free_download' else 'sale' end,
       p.buyer_id,
       case when it.pack_id is null then it.beat_id end,
       it.pack_id,
       it.id,
       jsonb_build_object('license_name', it.license_name, 'title', it.beat_title, 'price', it.price, 'currency', it.currency),
       p.created_at,
       now()
from public.purchases p
join public.order_items it on it.id = p.order_item_id
cross join lateral (
  select it.seller_id as r
  union
  select c.collaborator_id from public.beat_collaborations c
  where it.pack_id is null and c.beat_id = it.beat_id and c.status = 'accepted'
) people
where r is not null and r is distinct from p.buyer_id
on conflict (user_id, order_item_id) where type in ('sale', 'free_download') do nothing;

-- Your notifications, newest first, with who did it and on which beat or pack.
create or replace function public.list_notifications(p_before timestamptz default null, p_limit integer default 30)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or not public.mfa_satisfied() then
    return '[]'::json;
  end if;
  return (
    select coalesce(json_agg(x order by x.created_at desc), '[]'::json)
    from (
      select
        n.id, n.type, n.created_at, n.read_at, n.data,
        case when a.id is not null then json_build_object(
          'id', a.id, 'username', a.username,
          'name', coalesce(nullif(btrim(a.producer_name), ''), nullif(btrim(a.display_name), ''), a.username),
          'avatar_path', a.avatar_path, 'is_verified', a.is_verified
        ) end as actor,
        case when b.id is not null then json_build_object(
          'id', b.id, 'title', b.title, 'slug', b.slug, 'cover_path', b.cover_path, 'status', b.status
        ) end as beat,
        case when pk.id is not null then json_build_object(
          'id', pk.id, 'title', pk.title, 'slug', pk.slug, 'cover_path', pk.cover_path, 'status', pk.status
        ) end as pack
      from public.notifications n
      left join public.profiles a on a.id = n.actor_id
      left join public.beats b on b.id = n.beat_id
      left join public.beat_packs pk on pk.id = n.pack_id
      where n.user_id = v_me
        and (p_before is null or n.created_at < p_before)
      order by n.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100)
    ) x
  );
end;
$$;

revoke all on function public.list_notifications(timestamptz, integer) from public, anon;
grant execute on function public.list_notifications(timestamptz, integer) to authenticated, service_role;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.notifications n
  where n.user_id = (select auth.uid()) and n.read_at is null;
$$;

revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated, service_role;

-- Marks your notifications read: the ones given, or all of them.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
begin
  if v_me is null or not public.mfa_satisfied() then
    return 0;
  end if;
  update public.notifications n
     set read_at = now()
   where n.user_id = v_me and n.read_at is null and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated, service_role;

-- =============================================================== realtime ===
-- New notifications appear without reloading.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- Let the API see the new tables and functions straight away.
notify pgrst, 'reload schema';
