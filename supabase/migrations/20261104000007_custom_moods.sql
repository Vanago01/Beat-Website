-- =============================================================================
-- VBEATS — custom moods
--
-- Producers can describe a beat's mood in their own words next to the six
-- presets. A beat can have up to 8 moods; each is 2–24 characters, stored in
-- lower case without extra spaces. Custom moods are included in search.
--
-- Run after files 1–6. Safe to run more than once.
-- =============================================================================

create or replace function public.valid_moods(moods text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(moods), 0) <= 8
     and coalesce((
       select bool_and(
         char_length(m) between 2 and 24
         and m = lower(m)
         and m = btrim(m)
         and m !~ '[[:cntrl:]]'
         and m !~ '\s{2,}'
       )
       from unnest(moods) as m
     ), true);
$$;

grant execute on function public.valid_moods(text[]) to anon, authenticated, service_role;

-- Replace the old rule that only allowed the six presets.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.beats'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%moods%'
  loop
    execute format('alter table public.beats drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.beats add constraint beats_moods_check check (public.valid_moods(moods));
