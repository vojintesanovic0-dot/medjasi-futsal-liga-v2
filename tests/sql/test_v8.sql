-- v8 SQL assertions against the deterministic fixtures from tests/sql/test.sql
\set QUIET 1
create or replace function pg_temp.v8_assert(label text, ok boolean) returns void language plpgsql as $$ begin if coalesce(ok,false) then raise notice 'PASS: %',label; else raise exception 'FAIL: %',label; end if; end $$;
select pg_temp.v8_assert('sponsors table exists',to_regclass('public.sponsors') is not null);
select pg_temp.v8_assert('team applications table exists',to_regclass('public.team_applications') is not null);
select pg_temp.v8_assert('newsletter table exists',to_regclass('public.newsletter_subscribers') is not null);
select pg_temp.v8_assert('match notes table exists',to_regclass('public.match_notes') is not null);
select pg_temp.v8_assert('season archive returns each team',(select count(*) from public.season_table(1))=(select count(*) from public.teams where season_id=1));
select pg_temp.v8_assert('win awards three points',(select coalesce(sum(points),0) from public.season_table(1))=3);
select pg_temp.v8_assert('archive goal difference is correct',(select goal_diff from public.season_table(1) where team_id='10000000-0000-0000-0000-000000000001')=2);
select pg_temp.v8_assert('scorer totals equal recorded goals',(select coalesce(sum(goals),0) from public.season_scorers(1))=(select count(*) from public.match_events e join public.matches m on m.id=e.match_id where m.season_id=1 and m.status='finished' and e.type='goal' and e.player_id is not null));
select pg_temp.v8_assert('sponsor read policy exists',exists(select 1 from pg_policies where schemaname='public' and tablename='sponsors' and policyname='sponsors_read' and cmd='SELECT'));
select pg_temp.v8_assert('application owner/staff policy exists',exists(select 1 from pg_policies where schemaname='public' and tablename='team_applications' and policyname='apps_read' and cmd='SELECT'));
select pg_temp.v8_assert('newsletter insert policy exists',exists(select 1 from pg_policies where schemaname='public' and tablename='newsletter_subscribers' and policyname='news_sub_insert' and cmd='INSERT'));
select pg_temp.v8_assert('anon cannot select newsletter addresses',not exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name='newsletter_subscribers' and grantee='anon' and privilege_type='SELECT'));
select pg_temp.v8_assert('match notes staff write policy exists',exists(select 1 from pg_policies where schemaname='public' and tablename='match_notes' and policyname='notes_staff_write' and cmd='ALL'));
