-- V11: statistika po kolu. Pokreće se nakon schema.sql i features_v10.sql.
begin;

do $$
declare
  sid int;
  ta uuid;
  tb uuid;
  ana uuid;
  ivo uuid;
  bojan uuid;
  m1 uuid;
  m2 uuid;
  result jsonb;
begin
  insert into public.seasons (name, is_active) values ('V11 test season', false) returning id into sid;
  insert into public.teams (season_id, name) values (sid, 'Alfa V11') returning id into ta;
  insert into public.teams (season_id, name) values (sid, 'Beta V11') returning id into tb;
  insert into public.players (team_id, first_name, last_name, number) values (ta, 'Ana', 'Alfić', 7) returning id into ana;
  insert into public.players (team_id, first_name, last_name, number) values (ta, 'Ivo', 'Ivić', 8) returning id into ivo;
  insert into public.players (team_id, first_name, last_name, number) values (tb, 'Bojan', 'Bojić', 9) returning id into bojan;
  insert into public.matches (season_id, round, home_team_id, away_team_id, scheduled_at, status)
    values (sid, 1, ta, tb, now() - interval '2 days', 'scheduled') returning id into m1;
  insert into public.matches (season_id, round, home_team_id, away_team_id, scheduled_at, status)
    values (sid, 2, tb, ta, now() + interval '5 days', 'scheduled') returning id into m2;

  insert into public.match_events (match_id, team_id, player_id, type, minute) values (m1, ta, ana, 'goal', 5);
  insert into public.match_events (match_id, team_id, player_id, assist_id, type, minute) values (m1, ta, ana, ivo, 'goal', 9);
  insert into public.match_events (match_id, team_id, player_id, type, minute) values (m1, tb, bojan, 'yellow', 12);
  insert into public.match_events (match_id, team_id, player_id, type, minute) values (m1, tb, bojan, 'red', 30);
  insert into public.match_events (match_id, team_id, player_id, type, minute) values (m2, tb, bojan, 'goal', 3);

  result := public.round_stats(sid, 1);
  if jsonb_array_length(result->'matches') <> 1 then raise exception 'FAIL: kolo 1 mora imati tačno jednu utakmicu'; end if;
  if (select (p->>'goals')::int from jsonb_array_elements(result->'players') p where p->>'name' = 'Ana Alfić') <> 2
    then raise exception 'FAIL: Ana mora imati dva gola u kolu 1'; end if;
  if (select (p->>'assists')::int from jsonb_array_elements(result->'players') p where p->>'name' = 'Ivo Ivić') <> 1
    then raise exception 'FAIL: Ivo mora imati jednu asistenciju'; end if;
  if result->'best'->>'name' <> 'Ana Alfić' or (result->'best'->>'score')::int <> 4
    then raise exception 'FAIL: Ana mora biti najbolja sa četiri boda'; end if;
  result := public.round_stats(sid, 99);
  if jsonb_array_length(result->'matches') <> 0 or jsonb_array_length(result->'players') <> 0 or result->'best' <> 'null'::jsonb
    then raise exception 'FAIL: prazno kolo mora vratiti prazne nizove i best=null'; end if;
  raise notice 'PASS: kolo, golovi, asistencije, najbolji igrač i prazno kolo';
end $$;

-- Provjera poziva anonimnog korisnika uz postojeće javne SELECT politike.
set local role anon;
do $$
declare sid int; result jsonb;
begin
  select id into sid from public.seasons where name = 'V11 test season';
  result := public.round_stats(sid, 1);
  if jsonb_array_length(result->'players') < 1 then raise exception 'FAIL: anon ne vidi javnu statistiku kola'; end if;
  raise notice 'PASS: anon može čitati statistiku kola';
end $$;
reset role;

rollback;
