-- =============================================================================
-- VBEATS — follow anyone, and "Delivered" for messages
--
-- * Following: anyone signed in can follow anyone, not only producers, unless
--   one of the two blocked the other. Blocking someone also removes the
--   follows between the two of you.
-- * Messages: under your latest message the site shows Sending… → Sent →
--   Delivered → Seen. A message is delivered once the other person's browser
--   has it (they were on the site), seen once they opened the conversation.
--   Those two times are kept in conversation_receipts, which both people in a
--   conversation can read (and get live). Everything else about each person's
--   side (deleted, pinned) stays private, as before.
--
-- Run after files 1–13. Safe to run more than once.
-- =============================================================================

-- The SQL editor runs this file as one transaction: run the deferred checks
-- after each statement so later table changes aren't blocked.
set constraints all immediate;

-- ========================================================= follow anyone ===
-- True when the signed-in person may follow p_followee: someone with a
-- profile, and neither of them blocked the other. (Blocks are private to the
-- person who made them, hence a function.)
create or replace function public.can_follow(p_followee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_followee)
     and not exists (
       select 1 from public.user_blocks b
       where (b.blocker_id = p_followee and b.blocked_id = (select auth.uid()))
          or (b.blocker_id = (select auth.uid()) and b.blocked_id = p_followee)
     );
$$;

revoke all on function public.can_follow(uuid) from public, anon;
grant execute on function public.can_follow(uuid) to authenticated, service_role;

-- File 13 only allowed following producers.
drop policy if exists "people follow producers" on public.follows;
drop policy if exists "people follow people" on public.follows;
create policy "people follow people"
  on public.follows for insert
  to authenticated
  with check (follower_id = (select auth.uid()) and public.can_follow(followee_id));

-- Blocking someone ends the follows between the two of you, both ways.
create or replace function public.unfollow_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows f
   where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
      or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return null;
end;
$$;

revoke all on function public.unfollow_on_block() from public, anon, authenticated;

drop trigger if exists user_blocks_unfollow on public.user_blocks;
create trigger user_blocks_unfollow
  after insert on public.user_blocks
  for each row execute function public.unfollow_on_block();

-- Follows between people who had already blocked each other.
delete from public.follows f
 using public.user_blocks b
 where (f.follower_id = b.blocker_id and f.followee_id = b.blocked_id)
    or (f.follower_id = b.blocked_id and f.followee_id = b.blocker_id);

-- ====================================================== delivery receipts ===
-- Messages up to this time have reached this person's browser.
alter table public.conversation_members add column if not exists delivered_at timestamptz;

-- What each person in a conversation has received and read, for the other
-- person's "Delivered" and "Seen". Kept in step with conversation_members by
-- a trigger; nobody writes it directly.
create table if not exists public.conversation_receipts (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (conversation_id, user_id)
);

alter table public.conversation_receipts enable row level security;

drop policy if exists "people in a conversation see its receipts" on public.conversation_receipts;
create policy "people in a conversation see its receipts"
  on public.conversation_receipts for select
  to authenticated
  using (exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversation_receipts.conversation_id and m.user_id = (select auth.uid())
  ));

drop policy if exists require_two_factor on public.conversation_receipts;
create policy require_two_factor on public.conversation_receipts as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on public.conversation_receipts from anon, authenticated;
grant select on public.conversation_receipts to authenticated;
grant all on public.conversation_receipts to service_role;

create or replace function public.sync_conversation_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reading a message means it was delivered too.
  insert into public.conversation_receipts as r (conversation_id, user_id, delivered_at, read_at)
  values (new.conversation_id, new.user_id, greatest(new.delivered_at, new.last_read_at), new.last_read_at)
  on conflict (conversation_id, user_id) do update
    set delivered_at = excluded.delivered_at, read_at = excluded.read_at
    where r.delivered_at is distinct from excluded.delivered_at or r.read_at is distinct from excluded.read_at;
  return null;
end;
$$;

revoke all on function public.sync_conversation_receipt() from public, anon, authenticated;

drop trigger if exists conversation_members_receipts on public.conversation_members;
create trigger conversation_members_receipts
  after insert or update of last_read_at, delivered_at on public.conversation_members
  for each row execute function public.sync_conversation_receipt();

-- Receipts for the conversations that already exist.
insert into public.conversation_receipts as r (conversation_id, user_id, delivered_at, read_at)
select m.conversation_id, m.user_id, greatest(m.delivered_at, m.last_read_at), m.last_read_at
from public.conversation_members m
on conflict (conversation_id, user_id) do update
  set delivered_at = excluded.delivered_at, read_at = excluded.read_at
  where r.delivered_at is distinct from excluded.delivered_at or r.read_at is distinct from excluded.read_at;

-- The caller's browser has received everything sent to them so far: marks the
-- newest message from the other person in each conversation as delivered.
-- Returns how many conversations changed.
create or replace function public.mark_messages_delivered()
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
  update public.conversation_members m
     set delivered_at = c.last_message_at
    from public.conversations c
   where m.user_id = v_me
     and c.id = m.conversation_id
     and c.last_message_at is not null
     and c.last_sender_id is distinct from v_me
     and (m.delivered_at is null or m.delivered_at < c.last_message_at);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_messages_delivered() from public, anon;
grant execute on function public.mark_messages_delivered() to authenticated, service_role;

-- Unchanged from file 8 except for other_delivered_at.
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

-- =============================================================== realtime ===
-- "Delivered" and "Seen" appear for the sender without reloading.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_receipts') then
      alter publication supabase_realtime add table public.conversation_receipts;
    end if;
  end if;
end $$;

-- Let the API see the new table and functions straight away.
notify pgrst, 'reload schema';
