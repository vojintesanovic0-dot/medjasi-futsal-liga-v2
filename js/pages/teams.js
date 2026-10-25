import { getTeams, getTeam, getPlayers } from '../api.js';
import { esc, empty } from '../util.js';
import { badge } from '../components.js';

const POS = { golman: 'Golman', odbrana: 'Odbrana', vezni: 'Vezni', napad: 'Napad' };

export function registerTeams(route) {
  route('/ekipe', async (ctx) => {
    const teams = await getTeams();
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Ekipe</h1></div>${teams.length ? `<div class="team-grid">${teams.map((t) => `<a class="team-tile" href="#/ekipa/${esc(t.id)}" style="--tc:${esc(t.color || '#f5b400')}">${badge(t, 'lg')}<strong>${esc(t.name)}</strong></a>`).join('')}</div>` : empty('Nema ekipa.')}`;
  });
  route('/ekipa/:id', async (ctx, id) => {
    const team = await getTeam(id);
    if (!team) { ctx.app.innerHTML = empty('Ekipa nije pronađena.'); return; }
    const players = await getPlayers(id);
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<a class="back" href="#/ekipe">← Sve ekipe</a>
      <section class="team-hero" style="--tc:${esc(team.color || '#f5b400')}">${badge(team, 'xl')}<div><h1>${esc(team.name)}</h1><p class="muted">${players.length} igrača</p></div></section>
      <section class="block"><h2>Sastav</h2>${players.length ? `<div class="table-wrap"><table class="roster-table"><thead><tr><th>Br.</th><th class="left">Igrač</th><th>Pozicija</th></tr></thead><tbody>${players.map((p) => `<tr><td>${p.number ?? '–'}</td><td class="left">${esc(p.first_name)} ${esc(p.last_name)}${p.is_captain ? ' <span class="tag">C</span>' : ''}</td><td>${esc(POS[p.position] || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Ekipa još nema igrače.')}</section>`;
  });
}
