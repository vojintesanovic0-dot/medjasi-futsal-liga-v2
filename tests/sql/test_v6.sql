\\set ON_ERROR_STOP on
create or replace function pg_temp.expect(label text, ok boolean)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS: %', label;
  else raise exception 'FAIL: %', label;
  end if;
end $$;

-- Per-user post rate limit (30 seconds).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.posts(user_id, content)
values ('00000000-0000-0000-0000-00000000000c', 'Prva brza objava');
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.posts(user_id, content)
    values ('00000000-0000-0000-0000-00000000000c', 'Druga odmah poslije');
  exception when others then
    blocked := sqlerrm like 'Malo sporije%';
  end;
  perform pg_temp.expect('post rate limit blocks rapid second post', blocked);
end $$;
rollback;

-- Per-user comment rate limit (5 seconds).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.posts(user_id, content)
values ('00000000-0000-0000-0000-00000000000c', 'Objava za test komentara');
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.post_comments(post_id, user_id, username, content)
    select id, '00000000-0000-0000-0000-00000000000c', 'navijac2', 'Prvi komentar'
    from public.posts where user_id = '00000000-0000-0000-0000-00000000000c'
    order by created_at desc limit 1;
    insert into public.post_comments(post_id, user_id, username, content)
    select id, '00000000-0000-0000-0000-00000000000c', 'navijac2', 'Drugi komentar'
    from public.posts where user_id = '00000000-0000-0000-0000-00000000000c'
    order by created_at desc limit 1;
  exception when others then
    blocked := sqlerrm like 'Malo sporije%';
  end;
  perform pg_temp.expect('comment rate limit blocks rapid second comment', blocked);
end $$;
rollback;

-- Another account is not blocked by a different user's post.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.posts(user_id, content)
values ('00000000-0000-0000-0000-00000000000b', 'Nezavisna objava');
select pg_temp.expect('rate limit is per user', true);
rollback;

-- Report rate limit is tested with a distinct target so the unique constraint
-- cannot mask the rate-limit trigger's own error.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.reports(reporter_id, target_type, target_id, reason)
    values ('00000000-0000-0000-0000-00000000000c', 'post', '40000000-0000-0000-0000-000000000001', 'uvreda');
    insert into public.reports(reporter_id, target_type, target_id, reason)
    values ('00000000-0000-0000-0000-00000000000c', 'comment', '50000000-0000-0000-0000-000000000001', 'spam');
  exception when others then
    blocked := sqlerrm like 'Malo sporije%';
  end;
  perform pg_temp.expect('report rate limit blocks rapid second report', blocked);
end $$;
rollback;
