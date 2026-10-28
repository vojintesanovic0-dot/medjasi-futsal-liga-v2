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

-- Existing fixtures are created by tests/sql/test.sql before this file runs.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare new_id integer; teams_old integer; teams_new integer; players_old integer; players_new integer;
begin
  select count(*) into teams_old from public.teams where season_id = 1;
  select count(*) into players_old from public.players p join public.teams t on t.id = p.team_id where t.season_id = 1;
  select public.rollover_season(1, 'v9-test-season', false, true) into new_id;
  select count(*) into teams_new from public.teams where season_id = new_id;
  select count(*) into players_new from public.players p join public.teams t on t.id = p.team_id where t.season_id = new_id;
  if teams_old <> teams_new then raise exception 'FAIL: season rollover team count mismatch'; end if;
  if players_old <> players_new then raise exception 'FAIL: season rollover player count mismatch'; end if;
  raise notice 'PASS: season rollover copies teams and players';
end $$;
rollback;
