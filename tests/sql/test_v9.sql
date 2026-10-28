\set ON_ERROR_STOP on
create or replace function pg_temp.expect_v9(label text, ok boolean)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS: %', label;
  else raise exception 'FAIL: %', label;
  end if;
end $$;

select pg_temp.expect_v9('v9 rollover function exists',
  to_regprocedure('public.rollover_season(integer,text,boolean,boolean)') is not null);
select pg_temp.expect_v9('v9 client error table exists',
  to_regclass('public.client_errors') is not null);
select pg_temp.expect_v9('v9 live notes table exists',
  to_regclass('public.match_notes') is not null);
select pg_temp.expect_v9('v9 application rate trigger exists',
  exists (select 1 from pg_trigger where tgname = 'trg_rate_team_applications' and not tgisinternal));
select pg_temp.expect_v9('v9 automatic match note trigger exists',
  exists (select 1 from pg_trigger where tgname = 'trg_auto_note_event' and not tgisinternal));

-- The browser must not bypass Turnstile using either table INSERT or the old RPC.
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare denied_insert boolean := false; denied_rpc boolean := false;
begin
  begin
    insert into public.newsletter_subscribers(email) values ('direct-v9@example.ba');
  exception when others then denied_insert := true;
  end;
  begin
    perform public.subscribe_newsletter('rpc-v9@example.ba');
  exception when others then denied_rpc := true;
  end;
  if not denied_insert then raise exception 'FAIL: anon direct newsletter insert allowed'; end if;
  if not denied_rpc then raise exception 'FAIL: anon newsletter RPC bypass allowed'; end if;
  raise notice 'PASS: newsletter signup requires Turnstile Edge Function';
end $$;
rollback;

-- Anonymous visitors may report a client error but may not read reports.
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare read_denied boolean := false;
begin
  insert into public.client_errors(message, url, user_agent)
  values ('v9 anonymous report test', '/test', 'test-agent');
  begin
    perform count(*) from public.client_errors;
  exception when insufficient_privilege then
    read_denied := true;
  end;
  if not read_denied then raise exception 'FAIL: anon can read client errors'; end if;
  raise notice 'PASS: anon can report errors but cannot read them';
end $$;
rollback;

-- A non-admin must not create seasons.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare denied boolean := false;
begin
  begin
    perform public.rollover_season(1, 'v9-user-forbidden', false, false);
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: ordinary user created a season'; end if;
  raise notice 'PASS: ordinary user cannot create a season';
end $$;
rollback;

-- The 24-hour team-application limit still applies after an admin rejects the first request.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.team_applications(team_name, contact_name, contact_email, status)
values ('v9-rate-first', 'Test User', 'v9-rate@example.ba', 'pending');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.team_applications set status = 'rejected'
where user_id = '00000000-0000-0000-0000-00000000000c' and team_name = 'v9-rate-first';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare denied boolean := false;
begin
  begin
    insert into public.team_applications(team_name, contact_name, contact_email, status)
    values ('v9-rate-second', 'Test User', 'v9-rate@example.ba', 'pending');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'FAIL: second team application within 24 hours allowed'; end if;
  raise notice 'PASS: team application rate limit survives rejection';
end $$;
rollback;

-- A new goal creates an automatic live note in the same transaction.
begin;
insert into public.match_events(match_id, team_id, player_id, type, minute)
values ('30000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002', 'goal', 17);
select pg_temp.expect_v9('goal automatically creates a live note',
  exists (select 1 from public.match_notes
          where match_id = '30000000-0000-0000-0000-000000000002'
            and minute = 17 and auto and text like 'Gol%'));
rollback;

-- Existing fixtures are created by tests/sql/test.sql before this file runs.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare new_id integer; teams_old integer; teams_new integer; players_old integer; players_new integer; active_count integer;
begin
  select count(*) into teams_old from public.teams where season_id = 1;
  select count(*) into players_old from public.players p join public.teams t on t.id = p.team_id where t.season_id = 1;
  select public.rollover_season(1, 'v9-test-season', true, true) into new_id;
  select count(*) into teams_new from public.teams where season_id = new_id;
  select count(*) into players_new from public.players p join public.teams t on t.id = p.team_id where t.season_id = new_id;
  if teams_old <> teams_new then raise exception 'FAIL: season rollover team count mismatch'; end if;
  if players_old <> players_new then raise exception 'FAIL: season rollover player count mismatch'; end if;
  select count(*) into active_count from public.seasons where is_active;
  if active_count <> 1 or not exists (select 1 from public.seasons where id = new_id and is_active) then
    raise exception 'FAIL: season rollover must leave exactly one active season';
  end if;
  raise notice 'PASS: season rollover copies teams and players and leaves one active season';
end $$;
rollback;
