\set ON_ERROR_STOP on
create or replace function pg_temp.expect(label text, ok boolean)
returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS: %', label;
  else raise exception 'FAIL: %', label;
  end if;
end $$;

-- Deterministic fixture rows; tests run against a fresh disposable database.
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.ba', '{"username":"admin_liga"}'),
 ('00000000-0000-0000-0000-00000000000b', 'u1@x.ba', '{"username":"navijac1"}'),
 ('00000000-0000-0000-0000-00000000000c', 'u2@x.ba', '{"username":"navijac2"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

insert into public.seasons(name, is_active) values ('2026/27', true);
insert into public.teams(id, season_id, name, short_name) values
 ('10000000-0000-0000-0000-000000000001', 1, 'Alfa', 'ALF'),
 ('10000000-0000-0000-0000-000000000002', 1, 'Beta', 'BET');
insert into public.players(id, team_id, first_name, last_name, number) values
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Ana', 'A', 7),
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Bojan', 'B', 9);
insert into public.matches(id, season_id, round, home_team_id, away_team_id, scheduled_at, status) values
 ('30000000-0000-0000-0000-000000000001', 1, 1, '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', now() + interval '1 day', 'scheduled'),
 ('30000000-0000-0000-0000-000000000002', 1, 2, '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', now() + interval '2 days', 'scheduled');

-- Anonymous users may read public fixtures but may not write predictions.
begin;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare n int; denied boolean := false;
begin
  select count(*) into n from public.matches;
  perform pg_temp.expect('anon can read matches', n = 2);
  begin
    insert into public.fan_predictions(user_id, match_id, home_pred, away_pred)
    values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 1, 0);
  exception when others then denied := true;
  end;
  perform pg_temp.expect('anon cannot predict', denied);
end $$;
rollback;

-- A user can predict an upcoming game but cannot impersonate another user or promote themselves.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into public.fan_predictions(user_id, match_id, home_pred, away_pred)
values ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 2, 1);
update public.fan_predictions set home_pred = 3 where match_id = '30000000-0000-0000-0000-000000000001';
do $$
declare denied boolean := false; role_now text; score_now int;
begin
  select home_pred into score_now from public.fan_predictions where match_id = '30000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('user can update own prediction', score_now = 3);
  begin
    insert into public.fan_predictions(user_id, match_id, home_pred, away_pred)
    values ('00000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-000000000001', 0, 0);
  exception when others then denied := true;
  end;
  perform pg_temp.expect('user cannot impersonate another predictor', denied);
  denied := false;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
  exception when others then denied := true;
  end;
  select role into role_now from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
  perform pg_temp.expect('user cannot self-promote', denied and role_now = 'user');
  denied := false;
  begin
    insert into public.matches(season_id, round, home_team_id, away_team_id, scheduled_at)
    values (1, 9, '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', now() + interval '4 days');
  exception when others then denied := true;
  end;
  perform pg_temp.expect('ordinary user cannot create matches', denied);
end $$;

-- Name-stamping, like uniqueness, and storage folder rules.
insert into public.posts(id, user_id, content)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Prva objava');
insert into public.post_comments(post_id, user_id, username, content)
values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'FAKE', 'Komentar');
do $$
declare uname text; denied boolean := false;
begin
  select username into uname from public.post_comments where post_id = '40000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('comment username stamped from profile', uname = 'navijac1');
  insert into public.post_likes(post_id, user_id)
  values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
  begin
    insert into public.post_likes(post_id, user_id)
    values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
  exception when unique_violation then denied := true;
  end;
  perform pg_temp.expect('duplicate likes are blocked', denied);
  insert into storage.objects(bucket_id, name, owner)
  values ('media', 'posts/00000000-0000-0000-0000-00000000000b/a.jpg', '00000000-0000-0000-0000-00000000000b');
  denied := false;
  begin
    insert into storage.objects(bucket_id, name, owner)
    values ('media', 'galerija/x.jpg', '00000000-0000-0000-0000-00000000000b');
  exception when others then denied := true;
  end;
  perform pg_temp.expect('user blocked from gallery upload folder', denied);
end $$;
rollback;

-- Event trigger recalculates score; the points view awards 3 for outcome and +2 for exact score.
insert into public.match_events(match_id, team_id, player_id, type, minute) values
 ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'goal', 5),
 ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'goal', 9);
insert into public.fan_predictions(user_id, match_id, home_pred, away_pred) values
 ('00000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-000000000001', 2, 0),
 ('00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 1, 0);
update public.matches set status = 'finished' where id = '30000000-0000-0000-0000-000000000001';
do $$
declare exact_points int; outcome_points int;
begin
  select points into exact_points from public.fan_points where user_id = '00000000-0000-0000-0000-00000000000c' and match_id = '30000000-0000-0000-0000-000000000001';
  select points into outcome_points from public.fan_points where user_id = '00000000-0000-0000-0000-00000000000b' and match_id = '30000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('exact score awards 5 points', exact_points = 5);
  perform pg_temp.expect('correct outcome awards 3 points', outcome_points = 3);
end $$;
