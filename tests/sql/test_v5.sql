\set ON_ERROR_STOP on
create or replace function pg_temp.expect(label text, ok boolean)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS: %', label;
  else raise exception 'FAIL: %', label;
  end if;
end $$;

-- Add moderation fixtures (tests run in an isolated disposable PostgreSQL database).
insert into public.posts(id, user_id, content)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Sporna objava')
on conflict (id) do nothing;
insert into public.news(title, slug, body, published, published_at, author_id) values
 ('Zakazana vijest', 'zakazana-test', 'tekst', true, now() + interval '2 days', '00000000-0000-0000-0000-00000000000a'),
 ('Objavljena vijest', 'objavljena-test', 'tekst', true, now() - interval '1 hour', '00000000-0000-0000-0000-00000000000a')
on conflict (slug) do nothing;

-- Anonymous visitor cannot create reports.
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare denied boolean := false;
begin
  begin
    insert into public.reports(reporter_id, target_type, target_id, reason)
    values ('00000000-0000-0000-0000-00000000000b', 'post', '40000000-0000-0000-0000-000000000001', 'uvreda');
  exception when others then denied := true;
  end;
  perform pg_temp.expect('anon cannot report content', denied);
end $$;
rollback;

-- User B creates a report; duplicate reports from the same user are rejected.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.reports(reporter_id, target_type, target_id, reason)
values ('00000000-0000-0000-0000-00000000000b', 'post', '40000000-0000-0000-0000-000000000001', 'uvreda');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare denied boolean := false;
begin
  begin
    insert into public.reports(reporter_id, target_type, target_id, reason)
    values ('00000000-0000-0000-0000-00000000000b', 'post', '40000000-0000-0000-0000-000000000001', 'spam');
  exception when unique_violation then denied := true;
  end;
  perform pg_temp.expect('duplicate report rejected', denied);
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare n int;
begin
  select count(*) into n from public.reports;
  perform pg_temp.expect('other user cannot read reports', n = 0);
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare n int;
begin
  select count(*) into n from public.reports;
  perform pg_temp.expect('admin can read reports', n >= 1);
end $$;
rollback;

-- Staff can add warnings; each user sees only their own.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.user_warnings(user_id, message, created_by)
values ('00000000-0000-0000-0000-00000000000b', 'Upozorenje zbog uvrede', '00000000-0000-0000-0000-00000000000a');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare n int;
begin
  select count(*) into n from public.user_warnings;
  perform pg_temp.expect('user sees own warning', n = 1);
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare n int;
begin
  select count(*) into n from public.user_warnings;
  perform pg_temp.expect('other user sees no warning', n = 0);
end $$;
rollback;

-- MVP is blocked for unfinished matches; on a finished match the vote can be changed.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
declare denied boolean := false; chosen uuid;
begin
  begin
    insert into public.mvp_votes(match_id, user_id, player_id)
    values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001');
  exception when others then denied := true;
  end;
  perform pg_temp.expect('MVP vote blocked on unfinished match', denied);
  insert into public.mvp_votes(match_id, user_id, player_id)
  values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001');
  update public.mvp_votes set player_id = '20000000-0000-0000-0000-000000000002'
    where match_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000b';
  select player_id into chosen from public.mvp_votes
    where match_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000b';
  perform pg_temp.expect('MVP vote can be changed to a player in the match', chosen = '20000000-0000-0000-0000-000000000002');
end $$;
rollback;

-- An audited match update creates an audit record; ordinary users cannot read the log.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare before_count int; after_count int;
begin
  select count(*) into before_count from public.admin_audit;
  update public.matches set venue = 'Hala 2' where id = '30000000-0000-0000-0000-000000000002';
  select count(*) into after_count from public.admin_audit;
  perform pg_temp.expect('audit written on match update', after_count > before_count);
end $$;
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare n int;
begin
  select count(*) into n from public.admin_audit;
  perform pg_temp.expect('ordinary user cannot read audit', n = 0);
end $$;
rollback;

-- Future published news remains hidden from anonymous readers until its date.
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare scheduled_count int; published_count int;
begin
  select count(*) into scheduled_count from public.news where slug = 'zakazana-test';
  select count(*) into published_count from public.news where slug = 'objavljena-test';
  perform pg_temp.expect('scheduled news hidden from public', scheduled_count = 0);
  perform pg_temp.expect('already published news visible to public', published_count = 1);
end $$;
rollback;

-- Match comment username is always stamped from the authenticated profile.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.match_comments(match_id, user_id, username, content)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'FAKE', 'Bravo ekipa');
do $$
declare uname text;
begin
  select username into uname from public.match_comments
    where match_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-00000000000b';
  perform pg_temp.expect('match chat username stamped from profile', uname = 'navijac1');
end $$;
rollback;

do $$
begin
  perform pg_temp.expect('reminder_sent column defaults to false',
    (select reminder_sent from public.matches where id = '30000000-0000-0000-0000-000000000002') = false);
end $$;
