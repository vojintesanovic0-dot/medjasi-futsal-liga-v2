-- v8 smoke tests: run after schema.sql, test.sql, test_v5.sql and features_v8.sql.
\set QUIET 1
create or replace function pg_temp.v8_assert(label text, ok boolean)
returns void language plpgsql as $$
begin
  if coalesce(ok,false) then raise notice 'PASS: %',label;
  else raise notice 'FAIL: %',label; end if;
end $$;

select pg_temp.v8_assert('sponsors table exists', to_regclass('public.sponsors') is not null);
select pg_temp.v8_assert('team applications table exists', to_regclass('public.team_applications') is not null);
select pg_temp.v8_assert('newsletter subscribers table exists', to_regclass('public.newsletter_subscribers') is not null);
select pg_temp.v8_assert('match notes table exists', to_regclass('public.match_notes') is not null);
select pg_temp.v8_assert('season_table function exists',
  to_regprocedure('public.season_table(integer)') is not null);
select pg_temp.v8_assert('season_scorers function exists',
  to_regprocedure('public.season_scorers(integer)') is not null);
select pg_temp.v8_assert('newsletter unsubscribe function exists',
  to_regprocedure('public.unsubscribe_newsletter(uuid)') is not null);

-- Verify that all new tables have row-level security enabled.
select pg_temp.v8_assert('sponsors RLS enabled',
  (select relrowsecurity from pg_class where oid='public.sponsors'::regclass));
select pg_temp.v8_assert('team applications RLS enabled',
  (select relrowsecurity from pg_class where oid='public.team_applications'::regclass));
select pg_temp.v8_assert('newsletter RLS enabled',
  (select relrowsecurity from pg_class where oid='public.newsletter_subscribers'::regclass));
select pg_temp.v8_assert('match notes RLS enabled',
  (select relrowsecurity from pg_class where oid='public.match_notes'::regclass));

-- The standard league scoring is 3 points for a win and 1 for a draw.
select pg_temp.v8_assert('archive returns no more than one row per team',
  not exists (
    select team_id from public.season_table(-999)
    group by team_id having count(*) > 1
  ));
