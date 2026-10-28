-- Međasi Futsal Liga V10: trener ekipe i zamjenik kapitena.
-- Idempotentna migracija; pokrenuti nakon potvrde da je ciljna Supabase šema ova verzija.
alter table public.teams
  add column if not exists coach_name text
  check (coach_name is null or char_length(coach_name) between 2 and 60);

alter table public.players
  add column if not exists is_vice_captain boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'captain_not_vice'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint captain_not_vice
      check (not (is_captain and is_vice_captain));
  end if;
end $$;

create unique index if not exists one_vice_per_team
  on public.players (team_id) where is_vice_captain;
