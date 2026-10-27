-- Sastavi, zamjene, ocjene i odbrane po utakmici.
create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  is_starter boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists match_players_team_idx on public.match_players(team_id);
create table if not exists public.match_substitutions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_out_id uuid not null references public.players(id) on delete cascade,
  player_in_id uuid not null references public.players(id) on delete cascade,
  minute int not null default 0 check (minute between 0 and 200),
  created_at timestamptz not null default now(),
  check (player_out_id <> player_in_id)
);
create index if not exists match_substitutions_match_idx on public.match_substitutions(match_id);
create table if not exists public.match_player_stats (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  rating numeric(3,1) check (rating is null or rating between 1 and 10),
  saves int not null default 0 check (saves between 0 and 99),
  primary key (match_id, player_id)
);
create or replace function public.validate_match_player()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.matches m where m.id = new.match_id and new.team_id in (m.home_team_id, m.away_team_id)) then
    raise exception 'Ekipa ne igra u ovoj utakmici.';
  end if;
  if not exists (select 1 from public.players p where p.id = new.player_id and p.team_id = new.team_id) then
    raise exception 'Igrač ne pripada ekipi.';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_match_player on public.match_players;
create trigger trg_validate_match_player before insert or update on public.match_players for each row execute function public.validate_match_player();
drop trigger if exists trg_validate_match_player_stats on public.match_player_stats;
create trigger trg_validate_match_player_stats before insert or update on public.match_player_stats for each row execute function public.validate_match_player();
create or replace function public.validate_match_substitution()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.player_out_id and mp.team_id = new.team_id and mp.is_starter) then
    raise exception 'Igrač koji izlazi mora biti u startnoj postavi te ekipe.';
  end if;
  if not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.player_in_id and mp.team_id = new.team_id and not mp.is_starter) then
    raise exception 'Igrač koji ulazi mora biti na klupi te ekipe.';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_match_substitution on public.match_substitutions;
create trigger trg_validate_match_substitution before insert or update on public.match_substitutions for each row execute function public.validate_match_substitution();
alter table public.match_players enable row level security;
alter table public.match_substitutions enable row level security;
alter table public.match_player_stats enable row level security;
drop policy if exists match_players_read on public.match_players;
create policy match_players_read on public.match_players for select using (true);
drop policy if exists match_players_admin on public.match_players;
create policy match_players_admin on public.match_players for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists match_substitutions_read on public.match_substitutions;
create policy match_substitutions_read on public.match_substitutions for select using (true);
drop policy if exists match_substitutions_admin on public.match_substitutions;
create policy match_substitutions_admin on public.match_substitutions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists match_player_stats_read on public.match_player_stats;
create policy match_player_stats_read on public.match_player_stats for select using (true);
drop policy if exists match_player_stats_admin on public.match_player_stats;
create policy match_player_stats_admin on public.match_player_stats for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.match_players, public.match_substitutions, public.match_player_stats from public, anon, authenticated;
grant select on public.match_players, public.match_substitutions, public.match_player_stats to anon, authenticated;
grant insert, update, delete on public.match_players, public.match_substitutions, public.match_player_stats to authenticated;
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['match_players','match_substitutions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
