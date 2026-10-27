-- Ankete u zajednici i blokiranje korisnika. Idempotentno.
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 3 and 200),
  active boolean not null default true,
  closes_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  position int not null default 0
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id);
create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select using (true);
drop policy if exists polls_staff on public.polls;
create policy polls_staff on public.polls for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options for select using (true);
drop policy if exists poll_options_staff on public.poll_options;
create policy poll_options_staff on public.poll_options for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists poll_votes_own_read on public.poll_votes;
create policy poll_votes_own_read on public.poll_votes for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.polls, public.poll_options, public.poll_votes from public, anon, authenticated;
grant select on public.polls, public.poll_options to anon, authenticated;
grant insert, update, delete on public.polls, public.poll_options to authenticated;
grant select on public.poll_votes to authenticated;
create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Prijavi se da bi glasao.'; end if;
  if not exists (select 1 from public.polls p where p.id = p_poll_id and p.active and (p.closes_at is null or p.closes_at > now())) then
    raise exception 'Anketa nije otvorena.';
  end if;
  if not exists (select 1 from public.poll_options o where o.id = p_option_id and o.poll_id = p_poll_id) then
    raise exception 'Odabrana opcija ne pripada anketi.';
  end if;
  insert into public.poll_votes (poll_id, user_id, option_id) values (p_poll_id, uid, p_option_id)
  on conflict (poll_id, user_id) do update set option_id = excluded.option_id, created_at = now();
  return true;
end $$;
create or replace function public.get_poll_results(p_poll_ids uuid[])
returns table (poll_id uuid, option_id uuid, votes bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.poll_id, o.id, count(v.user_id)
  from public.poll_options o left join public.poll_votes v on v.option_id = o.id
  where o.poll_id = any (p_poll_ids)
  group by o.poll_id, o.id
$$;
revoke execute on function public.cast_poll_vote(uuid, uuid) from public;
revoke execute on function public.get_poll_results(uuid[]) from public;
grant execute on function public.cast_poll_vote(uuid, uuid) to authenticated;
grant execute on function public.get_poll_results(uuid[]) to anon, authenticated;
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists user_blocks_own on public.user_blocks;
create policy user_blocks_own on public.user_blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
revoke all on public.user_blocks from public, anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
