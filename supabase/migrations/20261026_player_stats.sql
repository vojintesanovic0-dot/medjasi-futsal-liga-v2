-- ---------- Statistika igrača (aktivna sezona) ----------
create or replace view public.player_stats with (security_invoker = true) as
with active as (
  select id from public.seasons where is_active
),
ev as (
  select e.*
  from public.match_events e
  join public.matches m on m.id = e.match_id
  where m.season_id in (select id from active)
    and m.status in ('live', 'paused', 'finished')
)
select
  p.id as player_id,
  p.first_name,
  p.last_name,
  p.number,
  t.id as team_id,
  t.name as team_name,
  t.short_name,
  count(ev.id) filter (where ev.type = 'goal' and ev.player_id = p.id)::int as goals,
  count(ev.id) filter (where ev.assist_id = p.id)::int as assists,
  count(ev.id) filter (where ev.type = 'yellow' and ev.player_id = p.id)::int as yellow,
  count(ev.id) filter (where ev.type = 'red' and ev.player_id = p.id)::int as red
from public.players p
join public.teams t on t.id = p.team_id
left join ev on (ev.player_id = p.id or ev.assist_id = p.id)
where t.season_id in (select id from active)
group by p.id, p.first_name, p.last_name, p.number, t.id, t.name, t.short_name;

grant select on public.player_stats to anon, authenticated;
