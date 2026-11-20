-- =============================================================================
-- VBEATS — "typing…" in messages
--
-- * While you write a message, the other person sees an animated "typing"
--   bubble. The signal travels over a private Realtime broadcast channel per
--   conversation, "typing:<conversation id>"; nothing is stored.
-- * Only the conversation's two members can listen to it or send on it, and
--   not across a block (just like messages). Someone with two-factor set up
--   needs their code first, as for the rest of messages.
--
-- Run after files 1–17. Safe to run more than once.
-- =============================================================================

-- Whether you may use the Realtime topic: "typing:<id>" of a conversation you're
-- in, with nobody in it having blocked you or been blocked by you.
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
    and not exists (
      select 1
      from public.conversation_members o
      join public.user_blocks b
        on (b.blocker_id = o.user_id and b.blocked_id = v_me)
        or (b.blocker_id = v_me and b.blocked_id = o.user_id)
      where o.conversation_id = v_conversation and o.user_id <> v_me
    );
end;
$$;

revoke all on function public.can_use_typing_channel(text) from public, anon;
grant execute on function public.can_use_typing_channel(text) to authenticated, service_role;

-- Realtime asks these policies when someone joins a private channel (to listen)
-- and when they broadcast on it (to send).
drop policy if exists "conversation members receive typing" on realtime.messages;
create policy "conversation members receive typing"
  on realtime.messages for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select public.can_use_typing_channel((select realtime.topic())))
  );

drop policy if exists "conversation members send typing" on realtime.messages;
create policy "conversation members send typing"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select public.can_use_typing_channel((select realtime.topic())))
  );
