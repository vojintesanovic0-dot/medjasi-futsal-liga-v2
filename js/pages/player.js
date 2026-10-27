import { getPlayer, getPlayerSeasonStats, getPlayerMatchRows, getPlayerMatchStats, getPlayerEvents } from '../api.js';
import { esc, empty } from '../util.js';

const POS = { golman: 'Golman', odbrana: 'Odbrana', vezni: 'Vezni', napad: 'Napad' };
const PLAYED = ['live', 'paused', 'finished'];

export function summarizePlayer(playerId, matchRows, statRows, eventRows) {
  const played = matchRows.filter(r => r.match && PLAYED.includes(r.match.status))
    .sort((a,b) => new Date(a.match.scheduled_at)-new Date(b.match.scheduled_at));
  const statByMatch = new Map(statRows.map(s => [s.match_id,s]));
  const eventsByMatch = new Map();
  for (const e of eventRows) {
    const b = eventsByMatch.get(e.match_id) || {goals:0,assists:0,yellow:0,red:0};
    if (e.type === 'goal' && e.player_id === playerId) b.goals++;
    if (e.assist_id === playerId) b.assists++;
    if (e.type === 'yellow' && e.player_id === playerId) b.yellow++;
    if (e.type === 'red' && e.player_id === playerId) b.red++;
    eventsByMatch.set(e.match_id,b);
  }
  const ratings=statRows.filter(s=>s.rating!=null).map(s=>Number(s.rating));
  const avgRating=ratings.length?Math.round(ratings.reduce((a,b)=>a+b,0)/ratings.length*10)/10:null;
  const saves=statRows.reduce((n,s)=>n+(Number(s.saves)||0),0);
  const rows=played.map(r=>{
    const m=r.match, ev=eventsByMatch.get(m.id)||{goals:0,assists:0,yellow:0,red:0}, st=statByMatch.get(m.id);
    return {matchId:m.id,round:m.round,scheduledAt:m.scheduled_at,status:m.status,home:m.home,away:m.away,
      homeScore:m.home_score,awayScore:m.away_score,homeTeamId:m.home_team_id,isStarter:r.is_starter,
      rating:st?.rating??null,saves:st?.saves??0,...ev};
  });
  return {matchesPlayed:rows.length,avgRating,saves,rows};
}
const ratingCls=r=>r==null?'':r>=7?'good':r>=5?'mid':'low';

export function registerPlayer(route) {
  route('/igrac/:id', async (ctx,id) => {
    try {
      const player=await getPlayer(id);
      if(!player){ctx.app.innerHTML=empty('Igrač nije pronađen.');return;}
      const [season,matchRows,statRows,eventRows]=await Promise.all([
        getPlayerSeasonStats(id),getPlayerMatchRows(id),getPlayerMatchStats(id),getPlayerEvents(id)
      ]);
      if(!ctx.current())return;
      const sum=summarizePlayer(id,matchRows,statRows,eventRows), team=player.team;
      const name=esc(player.first_name)+' '+esc(player.last_name);
      const tiles=[['Utakmice',sum.matchesPlayed],['Golovi',season?.goals??0],['Asistencije',season?.assists??0],
        ['Prosj. ocjena',sum.avgRating==null?'–':sum.avgRating.toFixed(1)],['Odbrane',sum.saves],
        ['Kartoni',String(season?.yellow??0)+' / '+String(season?.red??0)]]
        .map(([l,v])=>'<div class="stat-tile"><span class="muted small">'+esc(l)+'</span><strong>'+esc(String(v))+'</strong></div>').join('');
      const table=sum.rows.length?'<div class="table-wrap"><table class="roster-table player-matches"><thead><tr><th>Kolo</th><th class="left">Utakmica</th><th>Uloga</th><th>Ocjena</th><th>Odbrane</th><th>G</th><th>A</th></tr></thead><tbody>'+
        sum.rows.map(r=>{const home=r.homeTeamId===team?.id,mine=home?r.homeScore:r.awayScore,theirs=home?r.awayScore:r.homeScore;
          return '<tr><td>'+esc(String(r.round??'–'))+'</td><td class="left"><a href="#/utakmica/'+esc(r.matchId)+'">'+esc(r.home?.name)+' '+esc(String(r.homeScore??0))+':'+esc(String(r.awayScore??0))+' '+esc(r.away?.name)+'</a><span class="muted small">'+(mine>theirs?'pobjeda':mine===theirs?'neriješeno':'poraz')+'</span></td><td>'+(r.isStarter?'Start':'Klupa')+'</td><td>'+(r.rating!=null?'<span class="rating '+ratingCls(r.rating)+'">'+Number(r.rating).toFixed(1)+'</span>':'–')+'</td><td>'+esc(String(r.saves||'–'))+'</td><td>'+esc(String(r.goals||'–'))+'</td><td>'+esc(String(r.assists||'–'))+'</td></tr>';
        }).join('')+'</tbody></table></div>':empty('Nema odigranih utakmica sa sastavom.');
      ctx.app.innerHTML='<a class="back" href="'+(team?'#/ekipa/'+esc(team.id):'#/ekipe')+'">← '+(team?esc(team.name):'Ekipe')+'</a>'+
        '<section class="team-hero" style="--tc:'+esc(team?.color||'#22c55e')+'"><div class="player-no">'+esc(String(player.number??'–'))+'</div><div><h1>'+name+(player.is_captain?' <span class="tag">C</span>':'')+'</h1><p class="muted">'+(team?'<a href="#/ekipa/'+esc(team.id)+'">'+esc(team.name)+'</a> · ':'')+esc(POS[player.position]||'Pozicija nije unesena')+'</p></div></section>'+
        '<section class="block"><h2>Sezona</h2><div class="stat-tiles">'+tiles+'</div></section><section class="block"><h2>Utakmice</h2>'+table+'</section>';
    } catch(e) { if(ctx.current())ctx.app.innerHTML=empty('Profil igrača trenutno nije moguće učitati.'); }
  });
}
