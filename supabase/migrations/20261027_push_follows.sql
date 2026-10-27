-- Push obavještenja samo za omiljene ekipe (korak 7). Idempotentno.
create table if not exists public.team_follows (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
create index if not exists team_follows_team_idx on public.team_follows (team_id);
alter table public.team_follows enable row level security;
drop policy if exists team_follows_own on public.team_follows;
create policy team_follows_own on public.team_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.team_follows from public, anon, authenticated;
grant select, insert, delete on public.team_follows to authenticated;
alter table public.push_subscriptions add column if not exists followed_only boolean not null default false;
