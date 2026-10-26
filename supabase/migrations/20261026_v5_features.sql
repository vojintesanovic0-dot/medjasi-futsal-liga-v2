-- Međasi Futsal Liga v5: scheduled news, audit trail, reports, warnings, MVP and match comments
-- Safe to re-run against the existing v2 database.

-- Public news must remain hidden until its publication time.
drop policy if exists news_read_published on public.news;
create policy news_read_published on public.news for select using (
  (published and coalesce(published_at, now()) <= now()) or (select public.is_staff())
);

alter table public.matches
  add column if not exists reminder_sent boolean not null default false;

-- Admin audit trail.
create table if not exists public.admin_audit (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  action text not null,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists audit_admin_read on public.admin_audit;
create policy audit_admin_read on public.admin_audit
  for select to authenticated using ((select public.is_admin()));
grant select on public.admin_audit to authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare rid text;
begin
  if tg_op = 'DELETE' then rid := old.id::text; else rid := new.id::text; end if;
  insert into public.admin_audit(actor_id, table_name, action, row_id, old_data, new_data)
  values (
    auth.uid(), tg_table_name, tg_op, rid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

drop trigger if exists trg_audit_matches on public.matches;
create trigger trg_audit_matches
after insert or delete or update of status, home_score, away_score, scheduled_at, venue
on public.matches for each row execute function public.audit_row();
drop trigger if exists trg_audit_events on public.match_events;
create trigger trg_audit_events after insert or delete
on public.match_events for each row execute function public.audit_row();
drop trigger if exists trg_audit_news on public.news;
create trigger trg_audit_news after insert or update or delete
on public.news for each row execute function public.audit_row();
drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after update of role
on public.profiles for each row execute function public.audit_row();
drop trigger if exists trg_audit_teams on public.teams;
create trigger trg_audit_teams after insert or update or delete
on public.teams for each row execute function public.audit_row();

-- User-generated content reports.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
alter table public.reports enable row level security;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff on public.reports
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
grant select, insert, update on public.reports to authenticated;

-- Private warnings visible to the warned user and staff.
create table if not exists public.user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 3 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.user_warnings enable row level security;
drop policy if exists warnings_read on public.user_warnings;
create policy warnings_read on public.user_warnings
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists warnings_staff_insert on public.user_warnings;
create policy warnings_staff_insert on public.user_warnings
  for insert to authenticated with check ((select public.is_staff()) and (created_by is null or created_by = (select auth.uid())));
grant select, insert on public.user_warnings to authenticated;

-- MVP voting: one vote per user per finished match, only for participating players.
create table if not exists public.mvp_votes (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create or replace function public.validate_mvp_vote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.matches m
    join public.players p on p.id = new.player_id
    where m.id = new.match_id
      and m.status = 'finished'
      and p.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'MVP glasanje je moguće samo za igrača iz završene utakmice.';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_mvp on public.mvp_votes;
create trigger trg_validate_mvp before insert or update
on public.mvp_votes for each row execute function public.validate_mvp_vote();

alter table public.mvp_votes enable row level security;
drop policy if exists mvp_read on public.mvp_votes;
create policy mvp_read on public.mvp_votes for select to anon, authenticated using (true);
drop policy if exists mvp_insert_own on public.mvp_votes;
create policy mvp_insert_own on public.mvp_votes
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists mvp_update_own on public.mvp_votes;
create policy mvp_update_own on public.mvp_votes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select on public.mvp_votes to anon, authenticated;
grant insert, update on public.mvp_votes to authenticated;

create or replace view public.mvp_results with (security_invoker = true) as
select match_id, player_id, count(*)::int as votes
from public.mvp_votes
group by match_id, player_id;
grant select on public.mvp_results to anon, authenticated;

-- Match-specific chat; the existing trigger securely stamps display names from profiles.
create table if not exists public.match_comments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  content text not null check (char_length(content) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists match_comments_idx on public.match_comments (match_id, created_at);
drop trigger if exists trg_stamp_match_comment on public.match_comments;
create trigger trg_stamp_match_comment before insert
on public.match_comments for each row execute function public.stamp_comment();
alter table public.match_comments enable row level security;
drop policy if exists mc_read on public.match_comments;
create policy mc_read on public.match_comments for select to anon, authenticated using (true);
drop policy if exists mc_insert_own on public.match_comments;
create policy mc_insert_own on public.match_comments
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists mc_delete on public.match_comments;
create policy mc_delete on public.match_comments
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
grant select on public.match_comments to anon, authenticated;
grant insert, delete on public.match_comments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_comments'
  ) then
    alter publication supabase_realtime add table public.match_comments;
  end if;
end $$;

-- These are trigger-only helpers; clients must not call them directly.
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.validate_mvp_vote() from public, anon, authenticated;
