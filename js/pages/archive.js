import { sb } from '../supabase.js';
import { getSeasons, getMatches } from '../api.js';
import { esc, empty } from '../util.js';
import { standingsTable, matchCard } from '../components.js';

export function registerArchive(route) {
  route('/arhiva', async (ctx) => {
    const seasons = await getSeasons();
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Arhiva sezona</h1><p class="muted">Tabele, strijelci i rezultati svih sezona.</p></div>
      <div class="news-grid">${seasons.map(s => `<a class="news-card" href="#/arhiva/${s.id}"><div class="news-noimg"></div><div class="nc-body"><h3>${esc(s.name)}</h3><p class="muted">${s.is_active ? 'Aktivna sezona' : 'Arhiva sezone'}</p></div></a>`).join('') || empty('Nema sezona.')}</div>`;
  });
  route('/arhiva/:id', async (ctx, id) => {
    const sid = Number(id);
    if (!Number.isInteger(sid) || sid < 1) { ctx.app.innerHTML = empty('Sezona nije pronađena.'); return; }
    const [seasons, tableResult, scorerResult, matches] = await Promise.all([
      getSeasons(), sb.rpc('season_table',{sid}), sb.rpc('season_scorers',{sid}), getMatches(sid),
    ]);
    if (!ctx.current()) return;
    const season = seasons.find(s => s.id === sid);
    if (!season) { ctx.app.innerHTML = empty('Sezona nije pronađena.'); return; }
    if (tableResult.error) throw tableResult.error;
    if (scorerResult.error) throw scorerResult.error;
    const scorers = (scorerResult.data || []).slice(0,10);
    const finished = matches.filter(m => m.status === 'finished').reverse();
    ctx.app.innerHTML = `<a class="back" href="#/arhiva">← Sve sezone</a>
      <div class="page-head"><h1>${esc(season.name)}</h1><p class="muted">${season.is_active ? 'Aktivna sezona' : 'Arhiva'}</p></div>
      <section class="block"><h2>Tabela</h2>${standingsTable(tableResult.data || [])}</section>
      <section class="block"><h2>Strijelci</h2>${scorers.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th class="left">Igrač</th><th class="left">Ekipa</th><th>Golovi</th></tr></thead><tbody>${scorers.map((p,i)=>`<tr><td class="pos">${i+1}</td><td class="left"><a href="#/igrac/${esc(p.player_id)}">${esc(p.first_name)} ${esc(p.last_name)}</a></td><td class="left">${esc(p.team_name)}</td><td class="pts">${Number(p.goals)||0}</td></tr>`).join('')}</tbody></table></div>` : empty('Još nema golova u ovoj sezoni.')}</section>
      <section class="block"><h2>Rezultati</h2>${finished.length ? `<div class="match-list">${finished.map(matchCard).join('')}</div>` : empty('Nema završenih utakmica.')}</section>`;
  });
}
