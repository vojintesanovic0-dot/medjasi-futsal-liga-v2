-- v9 features for the current v2 schema. Run after supabase/schema.sql and security_v9.sql.

-- ===== Season rollover =====
create or replace function public.rollover_season(
  p_from integer,
  p_name text,
  p_activate boolean default false,
  p_copy_players boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id integer;
begin
  if not public.is_admin() then
    raise exception 'Samo admin može napraviti novu sezonu.';
  end if;
  if p_name is null or char_length(trim(p_name)) < 3 or char_length(trim(p_name)) > 30 then
    raise exception 'Naziv sezone mora imati 3–30 znakova.';
  end if;
  if not exists (select 1 from public.seasons where id = p_from) then
    raise exception 'Polazna sezona ne postoji.';
  end if;
  if exists (select 1 from public.seasons where name = trim(p_name)) then
    raise exception 'Sezona sa tim nazivom već postoji.';
  end if;

  -- The partial unique index permits only one active season.
  if p_activate then
    update public.seasons set is_active = false where is_active;
  end if;
  insert into public.seasons(name, is_active)
  values (trim(p_name), p_activate)
  returning id into new_id;

  insert into public.teams(season_id, name, short_name, logo_url, color)
  select new_id, t.name, t.short_name, t.logo_url, t.color
  from public.teams t where t.season_id = p_from;

  if p_copy_players then
    insert into public.players(team_id, first_name, last_name, number, position, photo_url, is_captain)
    select nt.id, p.first_name, p.last_name, p.number, p.position, p.photo_url, p.is_captain
    from public.players p
    join public.teams ot on ot.id = p.team_id and ot.season_id = p_from
    join public.teams nt on nt.season_id = new_id and nt.name = ot.name;
  end if;
  return new_id;
end
$$;
revoke all on function public.rollover_season(integer, text, boolean, boolean) from public, anon;
grant execute on function public.rollover_season(integer, text, boolean, boolean) to authenticated;

-- ===== Browser error reports =====
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 4000),
  url text check (url is null or char_length(url) <= 300),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  user_id uuid references auth.users(id) on delete set null
);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;
grant insert on public.client_errors to anon, authenticated;
grant select, delete on public.client_errors to authenticated;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
drop policy if exists client_errors_staff_read on public.client_errors;
create policy client_errors_staff_read on public.client_errors
  for select to authenticated using (public.is_staff());
drop policy if exists client_errors_admin_delete on public.client_errors;
create policy client_errors_admin_delete on public.client_errors
  for delete to authenticated using (public.is_admin());

create or replace function public.limit_client_errors()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 100 then
    return null;
  end if;
  return new;
end
$$;
revoke all on function public.limit_client_errors() from public, anon, authenticated;
drop trigger if exists trg_limit_client_errors on public.client_errors;
create trigger trg_limit_client_errors before insert on public.client_errors
for each row execute function public.limit_client_errors();

-- ===== Live match notes generated from match events =====
create table if not exists public.match_notes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  minute integer not null default 0 check (minute between 0 and 200),
  text text not null check (char_length(text) between 1 and 200),
  auto boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.match_notes enable row level security;
revoke all on public.match_notes from public, anon, authenticated;
grant select on public.match_notes to anon, authenticated;
grant insert, update, delete on public.match_notes to authenticated;
drop policy if exists match_notes_public_read on public.match_notes;
create policy match_notes_public_read on public.match_notes for select using (true);
drop policy if exists match_notes_staff_write on public.match_notes;
create policy match_notes_staff_write on public.match_notes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.auto_note_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  label text;
  person text;
  team_name text;
begin
  label := case new.type
    when 'goal' then 'Gol'
    when 'own_goal' then 'Autogol'
    when 'yellow' then 'Žuti karton'
    when 'red' then 'Crveni karton'
    else null
  end;
  if label is null then return new; end if;
  select p.first_name || ' ' || p.last_name into person
  from public.players p where p.id = new.player_id;
  select t.name into team_name from public.teams t where t.id = new.team_id;
  insert into public.match_notes(match_id, minute, text, auto)
  values (new.match_id, new.minute,
    left(label || coalesce(' — ' || person, '') || coalesce(' (' || team_name || ')', ''), 200), true);
  return new;
end
$$;
revoke all on function public.auto_note_event() from public, anon, authenticated;
drop trigger if exists trg_auto_note_event on public.match_events;
create trigger trg_auto_note_event after insert on public.match_events
for each row execute function public.auto_note_event();
