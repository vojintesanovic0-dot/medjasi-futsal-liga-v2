-- v8 features for the current v2 schema.
-- Apply only after supabase/schema.sql. Idempotent; does not require security_v7.sql.
-- Production deployment is intentionally separate from this source change.

-- ===== Season archive =====
create or replace function public.season_table(sid int)
returns table(team_id uuid, name text, short_name text, logo_url text, color text,
              played int, won int, drawn int, lost int, goals_for int, goals_against int,
              goal_diff int, points int)
language sql stable security invoker set search_path = public, pg_temp as $$
  with fin as (
    select m.* from public.matches m
    where m.season_id = sid and m.status = 'finished'
  ), rows_ as (
    select home_team_id tid, home_score gf, away_score ga from fin
    union all
    select away_team_id, away_score, home_score from fin
  ), agg as (
    select tid, count(*)::int p,
      count(*) filter (where gf > ga)::int w,
      count(*) filter (where gf = ga)::int d,
      count(*) filter (where gf < ga)::int l,
      coalesce(sum(gf),0)::int gf, coalesce(sum(ga),0)::int ga,
      sum(case when gf > ga then 3 when gf = ga then 1 else 0 end)::int pts
    from rows_ group by tid
  )
  select t.id, t.name, t.short_name, t.logo_url, t.color,
    coalesce(a.p,0), coalesce(a.w,0), coalesce(a.d,0), coalesce(a.l,0),
    coalesce(a.gf,0), coalesce(a.ga,0), coalesce(a.gf,0)-coalesce(a.ga,0), coalesce(a.pts,0)
  from public.teams t left join agg a on a.tid=t.id
  where t.season_id=sid
  order by coalesce(a.pts,0) desc, coalesce(a.gf,0)-coalesce(a.ga,0) desc,
           coalesce(a.gf,0) desc, t.name
$$;

create or replace function public.season_scorers(sid int)
returns table(player_id uuid, first_name text, last_name text, team_name text, goals int)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id, p.first_name, p.last_name, t.name, count(e.id)::int
  from public.match_events e
  join public.matches m on m.id=e.match_id and m.season_id=sid and m.status='finished'
  join public.players p on p.id=e.player_id
  join public.teams t on t.id=p.team_id
  where e.type='goal'
  group by p.id,p.first_name,p.last_name,t.name
  order by count(e.id) desc,p.last_name,p.first_name
$$;
grant execute on function public.season_table(int), public.season_scorers(int) to anon, authenticated;

-- ===== Sponsors =====
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  logo_url text,
  url text check (url is null or url ~ '^https://'),
  tier int not null default 3 check (tier between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;
drop policy if exists sponsors_read on public.sponsors;
create policy sponsors_read on public.sponsors for select to anon, authenticated using (active or public.is_staff());
drop policy if exists sponsors_admin_write on public.sponsors;
create policy sponsors_admin_write on public.sponsors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.sponsors to anon, authenticated;
grant insert, update, delete on public.sponsors to authenticated;

-- ===== Team applications =====
create table if not exists public.team_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  team_name text not null check (char_length(team_name) between 2 and 60),
  contact text not null check (char_length(contact) between 3 and 120),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create unique index if not exists one_pending_application on public.team_applications(applicant_id) where status='pending';
alter table public.team_applications enable row level security;
drop policy if exists apps_insert_own on public.team_applications;
create policy apps_insert_own on public.team_applications for insert to authenticated
  with check (applicant_id=auth.uid() and status='pending');
drop policy if exists apps_read on public.team_applications;
create policy apps_read on public.team_applications for select to authenticated
  using (applicant_id=auth.uid() or public.is_staff());
drop policy if exists apps_admin_update on public.team_applications;
create policy apps_admin_update on public.team_applications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.team_applications to authenticated;

-- ===== Newsletter =====
create table if not exists public.newsletter_subscribers (
  email text primary key check (
    char_length(email) <= 200 and email=lower(trim(email)) and
    email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  ),
  token uuid not null unique default gen_random_uuid(),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
alter table public.newsletter_subscribers enable row level security;
drop policy if exists news_sub_insert on public.newsletter_subscribers;
create policy news_sub_insert on public.newsletter_subscribers for insert to anon, authenticated with check (true);
drop policy if exists news_sub_admin_read on public.newsletter_subscribers;
create policy news_sub_admin_read on public.newsletter_subscribers for select to authenticated using (public.is_admin());
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select on public.newsletter_subscribers to authenticated;

create or replace function public.unsubscribe_newsletter(p_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_token is null then return false; end if;
  update public.newsletter_subscribers
    set unsubscribed_at=coalesce(unsubscribed_at,now())
    where token=p_token;
  return found;
end $$;
revoke all on function public.unsubscribe_newsletter(uuid) from public;
grant execute on function public.unsubscribe_newsletter(uuid) to anon, authenticated;

-- ===== Match notes / live text =====
create table if not exists public.match_notes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  minute int not null default 0 check (minute between 0 and 200),
  text text not null check (char_length(text) between 2 and 200),
  created_at timestamptz not null default now()
);
create index if not exists match_notes_idx on public.match_notes(match_id,created_at);
alter table public.match_notes enable row level security;
drop policy if exists notes_read on public.match_notes;
create policy notes_read on public.match_notes for select to anon, authenticated using (true);
drop policy if exists notes_staff_write on public.match_notes;
create policy notes_staff_write on public.match_notes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select on public.match_notes to anon, authenticated;
grant insert, update, delete on public.match_notes to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='match_notes') then
    alter publication supabase_realtime add table public.match_notes;
  end if;
end $$;
