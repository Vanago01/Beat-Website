-- =============================================================================
-- VBEATS — see who liked your beats
--
-- * beat_likes() lists who liked a beat (the heart / favorites button): their
--   name, username and profile picture, and when, newest first. Without a beat
--   it lists the likes on all of your beats.
-- * Only the beat's producer and its co-producer (an accepted collaboration)
--   can see this list. Everyone else still only sees how many likes a beat has.
-- * Someone who has blocked you isn't in your list.
--
-- Run after files 1–16. Safe to run more than once.
-- =============================================================================

create or replace function public.beat_likes(
  p_beat uuid default null,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_path text,
  is_verified boolean,
  liked_at timestamptz,
  beat_id uuid,
  beat_title text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sign in to see who liked your beats' using errcode = '42501';
  end if;
  -- Like the rest of the studio: someone with two-factor set up enters the code first.
  if not public.mfa_satisfied() then
    raise exception 'Enter your two-factor code first' using errcode = '42501';
  end if;
  if p_beat is not null and not exists (
    select 1 from public.beats b
    where b.id = p_beat
      and (
        b.producer_id = v_uid
        or exists (
          select 1 from public.beat_collaborations c
          where c.beat_id = b.id and c.collaborator_id = v_uid and c.status = 'accepted'
        )
      )
  ) then
    raise exception 'Only the beat''s producer can see who liked it' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.username,
    coalesce(nullif(btrim(p.producer_name), ''), nullif(btrim(p.display_name), ''), p.username),
    p.avatar_path,
    p.is_verified,
    f.created_at,
    b.id,
    b.title
  from public.beats b
  join public.favorites f on f.beat_id = b.id
  join public.profiles p on p.id = f.user_id
  where (p_beat is null or b.id = p_beat)
    and (
      b.producer_id = v_uid
      or exists (
        select 1 from public.beat_collaborations c
        where c.beat_id = b.id and c.collaborator_id = v_uid and c.status = 'accepted'
      )
    )
    and (p_before is null or f.created_at < p_before)
    and not exists (
      select 1 from public.user_blocks ub
      where ub.blocker_id = f.user_id and ub.blocked_id = v_uid
    )
  order by f.created_at desc, f.user_id
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function public.beat_likes(uuid, timestamptz, integer) from public, anon;
grant execute on function public.beat_likes(uuid, timestamptz, integer) to authenticated, service_role;

-- Let the API see the new function straight away.
notify pgrst, 'reload schema';
