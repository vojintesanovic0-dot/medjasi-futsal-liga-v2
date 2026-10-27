import { sb } from '../supabase.js';
import { esc, safeUrl, empty } from '../util.js';
import { badge } from '../components.js';

const POS = { golman: 'Golman', odbrana: 'Odbrana', vezni: 'Vezni', napad: 'Napad' };
const tile = (label, value) => `<div class="stat-tile"><strong>${Number(value)||0}</strong><span class="muted small">${esc(label)}</span></div>`;

export function registerPlayer(route) {
  route('/igrac/:id', async (ctx, id) => {
    const [playerResult, statsResult] = await Promise.all([
      sb.from('players').select('*, team:teams(id,name,short_name,logo_url,color)').eq('id', id).maybeSingle(),
      sb.from('player_stats').select('*').eq('player_id', id).maybeSingle(),
    ]);
    if (!ctx.current()) return;
    if (playerResult.error) throw playerResult.error;
    if (statsResult.error && statsResult.error.code !== 'PGRST116') throw statsResult.error;
    const p = playerResult.data;
    if (!p) { ctx.app.innerHTML = empty('Igrač nije pronađen.'); return; }
    const s = statsResult.data || { goals: 0, assists: 0, yellow: 0, red: 0 };
    const photo = safeUrl(p.photo_url);
    const name = `${p.first_name} ${p.last_name}`;
    ctx.app.innerHTML = `
      <a class="back" href="#/ekipa/${esc(p.team_id)}">← Ekipa</a>
      <section class="player-hero card">
        ${photo ? `<img class="player-photo" src="${esc(photo)}" alt="${esc(name)}" loading="lazy">`
          : `<div class="player-photo player-noimg" aria-hidden="true">${esc(p.number ?? '–')}</div>`}
        <div><p class="muted">${esc(POS[p.position] || 'Pozicija nije upisana')}${p.is_captain ? ' · kapiten' : ''}</p>
          <h1>${p.number != null ? `#${esc(p.number)} ` : ''}${esc(name)}</h1>
          ${p.team ? `<a href="#/ekipa/${esc(p.team.id)}" class="mh-team">${badge(p.team, 'sm')}<span>${esc(p.team.name)}</span></a>` : ''}
        </div>
      </section>
      <section class="block"><h2>Statistika ove sezone</h2><div class="stat-grid">
        ${tile('Golovi',s.goals)}${tile('Asistencije',s.assists)}${tile('Žuti kartoni',s.yellow)}${tile('Crveni kartoni',s.red)}
      </div></section>`;
  });
}
