-- Međasi Futsal Liga V11: statistika po kolu.
-- SECURITY INVOKER zadržava postojeće RLS politike; ne zaobilazi javna pravila čitanja.
-- Bodovanje najboljeg igrača kola: gol = 2, asistencija = 1, crveni karton = -2.
create or replace function public.round_stats(p_season int, p_round int)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with ms as (
    select m.id, m.scheduled_at, m.status, m.home_score, m.away_score,
           ht.name as home, at.name as away
    from public.matches m
    join public.teams ht on ht.id = m.home_team_id
    join public.teams at on at.id = m.away_team_id
    where m.season_id = p_season and m.round = p_round
  ),
  ev as (
    select e.type, e.player_id, e.assist_id
    from public.match_events e
    where e.match_id in (select id from ms)
  ),
  involved as (
    select player_id from ev where player_id is not null
    union
    select assist_id from ev where assist_id is not null
  ),
  per_player as (
    select p.id as player_id,
           concat_ws(' ', p.first_name, p.last_name) as name,
           t.name as team,
           (select count(*) from ev where ev.type = 'goal' and ev.player_id = p.id)::int as goals,
           (select count(*) from ev where ev.type = 'goal' and ev.assist_id = p.id)::int as assists,
           (select count(*) from ev where ev.type = 'yellow' and ev.player_id = p.id)::int as yellow,
           (select count(*) from ev where ev.type = 'red' and ev.player_id = p.id)::int as red
    from public.players p
    join public.teams t on t.id = p.team_id
    where p.id in (select player_id from involved)
  ),
  scored as (
    select per_player.*, (goals * 2 + assists - red * 2)::int as score
    from per_player
  )
  select jsonb_build_object(
    'matches', coalesce((select jsonb_agg(to_jsonb(ms) order by ms.scheduled_at, ms.id) from ms), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(to_jsonb(s) order by s.score desc, s.name) from scored s), '[]'::jsonb),
    'best', (select to_jsonb(s) from scored s
             where s.goals + s.assists > 0 or s.red > 0
             order by s.score desc, s.red asc, s.yellow asc, s.name
             limit 1)
  );
$$;

revoke all on function public.round_stats(int, int) from public;
grant execute on function public.round_stats(int, int) to anon, authenticated;
