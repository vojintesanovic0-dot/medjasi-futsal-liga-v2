// Pretraga lokalno učitanih ekipa, igrača i objavljenih vijesti.
import { getTeams, getPlayers, getPublishedNews } from '../api.js';
import { esc, empty, fmtLong } from '../util.js';
import { badge } from '../components.js';

export function registerSearch(route) {
  route('/pretraga', async (ctx) => {
    const [teams, players, news] = await Promise.all([
      getTeams(), getPlayers(), getPublishedNews(200),
    ]);
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Pretraga</h1></div>
      <form class="search-box" id="s-form" role="search">
        <input type="search" name="q" maxlength="60" placeholder="Ekipa, igrač ili vijest…" aria-label="Pretraga" autocomplete="off" autofocus>
      </form>
      <div id="s-out"><p class="muted">Upiši bar dva slova.</p></div>`;
    const out = ctx.app.querySelector('#s-out');
    const section = (title, html) => html ? `<section class="block"><h2>${title}</h2>${html}</section>` : '';

    const draw = (raw) => {
      const query = String(raw || '').trim().toLocaleLowerCase('bs');
      if (query.length < 2) { out.innerHTML = '<p class="muted">Upiši bar dva slova.</p>'; return; }
      const has = (value) => String(value || '').toLocaleLowerCase('bs').includes(query);
      const foundTeams = teams.filter((team) => has(team.name) || has(team.short_name));
      const foundPlayers = players.filter((player) => has(`${player.first_name} ${player.last_name}`)
        || (player.number != null && String(player.number) === query));
      const foundNews = news.filter((item) => has(item.title) || has(item.excerpt));
      const html = [
        section('Ekipe', foundTeams.length ? `<div class="team-grid">${foundTeams.map((team) =>
          `<a class="team-tile" href="#/ekipa/${esc(team.id)}" style="--tc:${esc(team.color || '#22c55e')}">${badge(team, 'lg')}<strong>${esc(team.name)}</strong></a>`).join('')}</div>` : ''),
        section('Igrači', foundPlayers.length ? `<ul class="plain">${foundPlayers.map((player) =>
          `<li><a href="#/igrac/${esc(player.id)}">${esc(player.first_name)} ${esc(player.last_name)}</a>
            <span class="muted small">${player.number ?? ''} · ${esc(player.team?.name || '')}</span></li>`).join('')}</ul>` : ''),
        section('Vijesti', foundNews.length ? `<ul class="plain">${foundNews.map((item) =>
          `<li><a href="#/vijest/${esc(item.slug)}">${esc(item.title)}</a>
            <span class="muted small">${esc(fmtLong(item.published_at || item.created_at))}</span></li>`).join('')}</ul>` : ''),
      ].join('');
      out.innerHTML = html || empty('Ništa nije pronađeno.');
    };

    ctx.app.querySelector('#s-form').addEventListener('submit', (event) => event.preventDefault());
    ctx.app.querySelector('input[name="q"]').addEventListener('input', (event) => draw(event.target.value));
  });
}
