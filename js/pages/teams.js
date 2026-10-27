import { getTeams, getTeam, getPlayers, getActiveSeason, getMatches, getMyFollowedTeamIds, followTeam, unfollowTeam } from '../api.js';
import { state } from '../state.js';
import { toast, errMsg } from '../util.js';
import { esc, empty } from '../util.js';
import { badge } from '../components.js';

const POS = { golman: 'Golman', odbrana: 'Odbrana', vezni: 'Vezni', napad: 'Napad' };

export function registerTeams(route) {
  route('/ekipe', async (ctx) => {
    const teams = await getTeams();
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Ekipe</h1></div>${teams.length ? `<div class="team-grid">${teams.map((t) => `<a class="team-tile" href="#/ekipa/${esc(t.id)}" style="--tc:${esc(t.color || '#22c55e')}">${badge(t, 'lg')}<strong>${esc(t.name)}</strong></a>`).join('')}</div>` : empty('Nema ekipa.')}`;
  });
  route('/ekipa/:id', async (ctx, id) => {
    const team = await getTeam(id);
    if (!team) { ctx.app.innerHTML = empty('Ekipa nije pronađena.'); return; }
    const players = await getPlayers(id);
    const uid = state.session?.user?.id;
    const follows = uid ? await getMyFollowedTeamIds(uid) : new Set();
    const season = await getActiveSeason();
    const seasonMatches = season ? await getMatches(season.id) : [];
    const lastFive = seasonMatches
      .filter((m) => m.status === 'finished' && (m.home_team_id === id || m.away_team_id === id))
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
      .slice(-5);
    const formHtml = lastFive.length ? `<div class="form-row">${lastFive.map((m) => {
      const home = m.home_team_id === id;
      const mine = home ? m.home_score : m.away_score;
      const theirs = home ? m.away_score : m.home_score;
      const [label, cls] = mine > theirs ? ['P', 'ok'] : mine === theirs ? ['N', 'draw'] : ['I', 'lost'];
      return `<a class="form-dot form-${cls}" href="#/utakmica/${esc(m.id)}" title="${esc(m.home?.name)} ${m.home_score}:${m.away_score} ${esc(m.away?.name)}" aria-label="${esc(m.home?.name)} ${m.home_score}:${m.away_score} ${esc(m.away?.name)}">${label}</a>`;
    }).join('')}</div>` : empty('Još nema odigranih utakmica.');
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<a class="back" href="#/ekipe">← Sve ekipe</a>
      <section class="team-hero" style="--tc:${esc(team.color || '#22c55e')}">${badge(team, 'xl')}<div><h1>${esc(team.name)}</h1><p class="muted">${players.length} igrača</p>${uid ? `<button class="btn btn-sm ${follows.has(team.id) ? 'on' : ''}" id="follow-team" type="button" aria-pressed="${follows.has(team.id)}">${follows.has(team.id) ? 'Pratiš ekipu ✓' : 'Prati ekipu'}</button>` : '<a class="muted small" href="#/prijava">Prijavi se da pratiš ekipu</a>'}</div></section>
      <section class="block"><h2>Forma</h2>${formHtml}</section>
      <section class="block"><h2>Sastav</h2>${players.length ? `<div class="table-wrap"><table class="roster-table"><thead><tr><th>Br.</th><th class="left">Igrač</th><th>Pozicija</th></tr></thead><tbody>${players.map((p) => `<tr><td>${p.number ?? '–'}</td><td class="left"><a href="#/igrac/${esc(p.id)}">${esc(p.first_name)} ${esc(p.last_name)}</a>${p.is_captain ? ' <span class="tag">C</span>' : ''}</td><td>${esc(POS[p.position] || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('Ekipa još nema igrače.')}</section>`;
    ctx.app.querySelector('#follow-team')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const on = btn.getAttribute('aria-pressed') === 'true';
      try {
        if (on) await unfollowTeam(uid, team.id); else await followTeam(uid, team.id);
        btn.setAttribute('aria-pressed', String(!on)); btn.classList.toggle('on', !on);
        btn.textContent = on ? 'Prati ekipu' : 'Pratiš ekipu ✓';
        toast(on ? 'Više ne pratiš ekipu.' : 'Ekipu pratiš. Obavještenja za nju stižu ako ih uključiš.');
      } catch (err) { toast(errMsg(err), 'err'); }
      btn.disabled = false;
    });
  });
}
