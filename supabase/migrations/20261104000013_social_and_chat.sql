-- =============================================================================
-- VBEATS — following, collaboration shares, and richer messages
--
-- * Following: anyone signed in can follow producers. Who follows whom is
--   public (like on other social sites); following_beats() lists the newest
--   beats of the producers you follow.
-- * Collaborations: the producer who invites chooses the collaborator's share
--   of every sale (1–99 %, 50 % by default).
-- * Messages: reactions with any emoji (one per person per message, like
--   Messenger), photos and videos (in a private bucket that only the two people
--   in the conversation can read), and pinned conversations at the top of the
--   inbox.
--
-- Run after files 1–12. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later table changes aren't blocked.
set constraints all immediate;

-- =============================================================== following ===
create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id, created_at desc);
create index if not exists follows_follower_idx on public.follows (follower_id, created_at desc);

alter table public.follows enable row level security;

drop policy if exists "follows are public" on public.follows;
create policy "follows are public"
  on public.follows for select
  to anon, authenticated
  using (true);

-- You follow producers yourself (nobody can follow on your behalf).
drop policy if exists "people follow producers" on public.follows;
create policy "people follow producers"
  on public.follows for insert
  to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = followee_id and p.role in ('seller', 'admin'))
  );

drop policy if exists "people unfollow" on public.follows;
create policy "people unfollow"
  on public.follows for delete
  to authenticated
  using (follower_id = (select auth.uid()));

drop policy if exists require_two_factor on public.follows;
create policy require_two_factor on public.follows as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on public.follows from anon, authenticated;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;

-- The newest beats from producers you follow (or that they co-produced),
-- except beats only sold inside a pack.
create or replace function public.following_beats(p_limit integer default 12)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'search_vector' order by x.published_at desc nulls last), '[]'::jsonb)
  from (
    select c.*
    from public.beat_cards c
    where c.status = 'published'
      and (
        c.producer_id in (select f.followee_id from public.follows f where f.follower_id = (select auth.uid()))
        or c.collaborator_id in (select f.followee_id from public.follows f where f.follower_id = (select auth.uid()))
      )
      and not exists (select 1 from public.live_pack_beats lp where lp.beat_id = c.id)
    order by c.published_at desc nulls last
    limit least(greatest(coalesce(p_limit, 12), 1), 48)
  ) x;
$$;

revoke all on function public.following_beats(integer) from public, anon;
grant execute on function public.following_beats(integer) to authenticated, service_role;

-- Unchanged from file 12 except for the followers and following counts.
create or replace function public.get_producer_stats(p_producer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'beats', count(*),
    'plays', coalesce(sum(plays_count), 0),
    'sales', coalesce(sum(sales_count), 0),
    'favorites', coalesce(sum(favorites_count), 0),
    'followers', (select count(*) from public.follows f where f.followee_id = p_producer_id),
    'following', (select count(*) from public.follows f where f.follower_id = p_producer_id)
  )
  from public.beats
  where status = 'published'
    and (producer_id = p_producer_id
      or id in (select c.beat_id from public.beat_collaborations c where c.collaborator_id = p_producer_id and c.status = 'accepted'));
$$;

-- ========================================================= collaborations ===
-- Unchanged from file 12 except that the inviting producer chooses the
-- collaborator's share (1–99 %).
drop function if exists public.invite_collaborator(uuid, text);
create or replace function public.invite_collaborator(p_beat_id uuid, p_username text, p_share_percent integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_beat public.beats;
  v_target public.profiles;
  v_row public.beat_collaborations;
begin
  if v_uid is null or not public.is_seller() then
    raise exception 'Only producers can invite collaborators' using errcode = '42501';
  end if;
  if p_share_percent is null or p_share_percent < 1 or p_share_percent > 99 then
    raise exception 'The collaborator''s share must be between 1%% and 99%%' using errcode = 'P0001';
  end if;
  select * into v_beat from public.beats where id = p_beat_id;
  if not found or v_beat.producer_id <> v_uid then
    raise exception 'Beat not found or you don''t have permission to change it' using errcode = '42501';
  end if;
  if v_beat.admin_locked then
    raise exception 'This beat has been locked by an administrator' using errcode = 'P0001';
  end if;
  if v_beat.exclusive_sold_at is not null then
    raise exception 'This beat was sold under an exclusive license' using errcode = 'P0001';
  end if;

  select * into v_target from public.profiles
  where username = lower(btrim(ltrim(btrim(coalesce(p_username, '')), '@')));
  if not found or v_target.role not in ('seller', 'admin') then
    raise exception 'There''s no producer with that username' using errcode = 'P0001';
  end if;
  if v_target.id = v_uid then
    raise exception 'You can''t invite yourself' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = v_target.id and ub.blocked_id = v_uid) or (ub.blocker_id = v_uid and ub.blocked_id = v_target.id)
  ) then
    raise exception 'You can''t invite this producer' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.beat_collaborations c where c.beat_id = p_beat_id and c.status in ('pending', 'accepted')) then
    raise exception 'This beat already has a collaborator or an open invite' using errcode = 'P0001';
  end if;
  if (select count(*) from public.beat_collaborations c where c.owner_id = v_uid and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'You''ve sent a lot of invites today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  begin
    insert into public.beat_collaborations (beat_id, owner_id, collaborator_id, share_percent)
    values (p_beat_id, v_uid, v_target.id, p_share_percent)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This beat already has a collaborator or an open invite' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'share_percent', v_row.share_percent,
    'collaborator_id', v_target.id,
    'collaborator_username', v_target.username
  );
end;
$$;

revoke all on function public.invite_collaborator(uuid, text, integer) from public, anon;
grant execute on function public.invite_collaborator(uuid, text, integer) to authenticated, service_role;

-- Unchanged from file 12 except for my_share_percent: this producer's share of
-- a shared single-beat sale.
create or replace function public.seller_sales(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_uid is null or not public.is_seller() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- The producer's own sales and the sales of beats they co-produced.
  -- seller_amount is what this producer earns (their half of a shared sale);
  -- split_with is the other producer of a shared sale.
  with s as (
    select
      oi.id, oi.created_at, oi.beat_id, oi.beat_title, oi.license_name, oi.license_type,
      oi.price, oi.platform_fee,
      coalesce(se.net, case when oi.seller_id = v_uid then oi.seller_amount else 0 end) as seller_amount,
      oi.currency,
      o.status as order_status, o.order_number,
      p.username as buyer_username,
      se.status as earning_status, se.paid_at,
      b.slug as beat_slug, b.cover_path,
      (
        select pr.username from public.seller_earnings x
        join public.profiles pr on pr.id = x.seller_id
        where x.order_item_id = oi.id and x.seller_id <> v_uid
        order by x.created_at limit 1
      ) as split_with,
      case when oi.pack_id is null and oi.seller_amount > 0 and se.net is not null
        then round(100.0 * se.net / oi.seller_amount)::int end as my_share_percent
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.profiles p on p.id = oi.buyer_id
    left join public.seller_earnings se on se.order_item_id = oi.id and se.seller_id = v_uid
    left join public.beats b on b.id = oi.beat_id
    where (oi.seller_id = v_uid or se.id is not null)
      and o.status in ('paid', 'partially_refunded', 'refunded')
  ),
  ranked as (
    select s.*, row_number() over (order by s.created_at desc, s.id) as rn from s
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'items', coalesce((
      select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn)
      from ranked r where r.rn > v_offset and r.rn <= v_offset + v_limit
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ============================================================== reactions ===
-- One reaction per person per message. Removing a reaction keeps the row with
-- no emoji, so the change reaches the other person through Realtime with the
-- same privacy rules as everything else.
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text,
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint message_reactions_emoji check (
    emoji is null or (char_length(emoji) between 1 and 16 and emoji !~ '[[:space:]A-Za-z<>&"''\\]')
  )
);

alter table public.message_reactions enable row level security;

-- Visible exactly when the message itself is (to the two people in the conversation).
drop policy if exists "reactions are visible with their message" on public.message_reactions;
create policy "reactions are visible with their message"
  on public.message_reactions for select
  to authenticated
  using (exists (select 1 from public.messages m where m.id = message_reactions.message_id));

drop policy if exists require_two_factor on public.message_reactions;
create policy require_two_factor on public.message_reactions as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
grant all on public.message_reactions to service_role;

-- React to a message with an emoji. The same emoji again (or none) removes it;
-- another emoji replaces it. Returns the reaction now shown (null: none).
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
  v_other uuid;
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
  if v_me not in (v_conv.user_a, v_conv.user_b)
     or not exists (
       select 1 from public.conversation_members cm
       where cm.conversation_id = v_conv.id and cm.user_id = v_me and v_msg.created_at > cm.cleared_at
     ) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  v_other := case when v_conv.user_a = v_me then v_conv.user_b else v_conv.user_a end;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_me and b.blocked_id = v_other) or (b.blocker_id = v_other and b.blocked_id = v_me)
  ) then
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

revoke all on function public.react_to_message(uuid, text) from public, anon;
grant execute on function public.react_to_message(uuid, text) to authenticated, service_role;

-- ================================================== photos and videos ===
-- Private bucket: <conversation>/<sender>/<file>. Only the two people in the
-- conversation can upload there (into their own folder) and read it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('message-media', 'message-media', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "message media: members upload to their own folder" on storage.objects;
create policy "message media: members upload to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id::text = (storage.foldername(name))[1] and cm.user_id = (select auth.uid())
    )
  );

drop policy if exists "message media: members read" on storage.objects;
create policy "message media: members read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-media'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id::text = (storage.foldername(name))[1] and cm.user_id = (select auth.uid())
    )
  );

drop policy if exists "message media: senders delete their uploads" on storage.objects;
create policy "message media: senders delete their uploads"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'message-media' and (storage.foldername(name))[2] = (select auth.uid())::text);

alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages drop constraint if exists messages_body_length;
alter table public.messages add constraint messages_body_length
  check (char_length(body) <= 2000 and (char_length(body) >= 1 or jsonb_array_length(attachments) > 0));
alter table public.messages drop constraint if exists messages_attachments_shape;
alter table public.messages add constraint messages_attachments_shape
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

-- Unchanged from file 8 except for attachments: up to 10 photos or videos the
-- sender uploaded to this conversation's folder (the text may then be empty).
drop function if exists public.send_message(uuid, text);
create or replace function public.send_message(p_conversation uuid, p_body text, p_attachments jsonb default '[]'::jsonb)
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
  if v_body = '' and jsonb_array_length(v_list) = 0 then
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

  insert into public.messages (conversation_id, sender_id, body, attachments, created_at)
  values (v_conv.id, v_me, v_body, v_files, clock_timestamp())
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
    'created_at', v_msg.created_at
  );
end;
$$;

revoke all on function public.send_message(uuid, text, jsonb) from public, anon;
grant execute on function public.send_message(uuid, text, jsonb) to authenticated, service_role;

-- ======================================================= pinned chats ===
alter table public.conversation_members add column if not exists pinned_at timestamptz;

create or replace function public.pin_conversation(p_conversation uuid, p_pinned boolean)
returns boolean
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
  update public.conversation_members
     set pinned_at = case when coalesce(p_pinned, false) then now() end
   where conversation_id = p_conversation and user_id = v_me;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  return coalesce(p_pinned, false);
end;
$$;

revoke all on function public.pin_conversation(uuid, boolean) from public, anon;
grant execute on function public.pin_conversation(uuid, boolean) to authenticated, service_role;

-- Unchanged from file 8 except that deleting a conversation also unpins it.
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
         last_read_at = coalesce(c.last_message_at, m.last_read_at),
         pinned_at = null
    from public.conversations c
   where m.conversation_id = p_conversation
     and m.user_id = v_me
     and c.id = m.conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Unchanged from file 8 except: pinned conversations first, and a photo or
-- video without text shows as "📷 Photo" / "🎬 Video".
create or replace function public.list_conversations()
returns json
language sql
stable
set search_path = ''
as $$
  select coalesce(json_agg(x order by x.pinned_at desc nulls last, x.last_message_at desc), '[]'::json)
  from (
    select
      c.id,
      lm.created_at as last_message_at,
      me.pinned_at,
      me.pinned_at is not null as pinned,
      json_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'producer_name', p.producer_name, 'avatar_path', p.avatar_path, 'is_verified', p.is_verified
      ) as other,
      json_build_object(
        'body', case
          when lm.body <> '' then left(lm.body, 200)
          when lm.attachments -> 0 ->> 'kind' = 'video' then '🎬 Video'
          else '📷 Photo'
        end,
        'sender_id', lm.sender_id,
        'created_at', lm.created_at
      ) as last_message,
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
      select m.body, m.attachments, m.sender_id, m.created_at
      from public.messages m
      where m.conversation_id = c.id
      order by m.created_at desc
      limit 1
    ) lm
    where me.user_id = (select auth.uid())
    order by me.pinned_at desc nulls last, lm.created_at desc
    limit 200
  ) x;
$$;

-- =============================================================== realtime ===
-- Reactions appear for the other person without reloading.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
      alter publication supabase_realtime add table public.message_reactions;
    end if;
  end if;
end $$;

-- Let the API see the new tables and functions straight away.
notify pgrst, 'reload schema';
