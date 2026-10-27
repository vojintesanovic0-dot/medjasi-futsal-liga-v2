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

select pg_temp.v8_assert('newsletter subscribe function exists',to_regprocedure('public.subscribe_newsletter(text)') is not null);
select pg_temp.v8_assert('anon cannot insert newsletter rows directly',not exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name='newsletter_subscribers' and grantee='anon' and privilege_type='INSERT'));
select pg_temp.v8_assert('newsletter subscribe execute granted to anon',exists(select 1 from information_schema.routine_privileges where specific_schema='public' and routine_name='subscribe_newsletter' and grantee='anon' and privilege_type='EXECUTE'));

select pg_temp.v8_assert('newsletter rejects invalid address',public.subscribe_newsletter('not-an-email') is false);
select pg_temp.v8_assert('newsletter accepts valid address',public.subscribe_newsletter('v8-test@example.com') is true);
select pg_temp.v8_assert('newsletter stores normalized address',exists(select 1 from public.newsletter_subscribers where email='v8-test@example.com' and unsubscribed_at is null));
select pg_temp.v8_assert('newsletter unsubscribe token works',public.unsubscribe_newsletter((select token from public.newsletter_subscribers where email='v8-test@example.com')) is true);
select pg_temp.v8_assert('newsletter re-subscription reactivates address',public.subscribe_newsletter(' V8-Test@Example.com ') is true and exists(select 1 from public.newsletter_subscribers where email='v8-test@example.com' and unsubscribed_at is null));
