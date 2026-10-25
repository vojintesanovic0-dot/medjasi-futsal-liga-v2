import { getActiveSeason, getStandings, getMatches, getPublishedNews } from '../api.js';
import { esc, fmtLong, empty } from '../util.js';
import { matchCard, standingsTable } from '../components.js';

export function registerHome(route) {
  route('/', async (ctx) => {
    const season = await getActiveSeason();
    if (!season) { ctx.app.innerHTML = empty('Još nema aktivne sezone.'); return; }
    const [matches, table, news] = await Promise.all([
      getMatches(season.id), getStandings(), getPublishedNews(3),
    ]);
    if (!ctx.current()) return;
    const live = matches.filter((m) => m.status === 'live' || m.status === 'paused');
    const upcoming = matches.filter((m) => m.status === 'scheduled').slice(0, 3);
    const recent = matches.filter((m) => m.status === 'finished').slice(-3).reverse();
    const section = (title, items, link) => items.length
      ? `<section class="block"><div class="block-head"><h2>${title}</h2>${link || ''}</div><div class="grid-matches">${items.map(matchCard).join('')}</div></section>`
      : '';
    ctx.app.innerHTML = `
      <section class="hero"><p class="eyebrow">${esc(season.name)} · sezona</p>
        <h1>Međasi <span>Futsal Liga</span></h1>
        <p class="lead">Utakmice uživo, tabela, ekipe i sve vijesti na jednom mjestu.</p>
        <div class="hero-actions"><a class="btn btn-primary" href="#/utakmice">Sve utakmice</a><a class="btn" href="#/tabela">Tabela</a></div>
      </section>
      ${live.length ? section('Uživo sada', live) : ''}
      ${section('Sljedeće utakmice', upcoming, '<a href="#/utakmice">Sve →</a>')}
      <section class="block"><div class="block-head"><h2>Tabela</h2><a href="#/tabela">Cijela tabela →</a></div>${standingsTable(table.slice(0, 6), { compact: true })}</section>
      ${section('Posljednji rezultati', recent)}
      ${news.length ? `<section class="block"><div class="block-head"><h2>Vijesti</h2><a href="#/vijesti">Sve →</a></div><div class="news-grid">${news.map((n) => `<a class="news-card" href="#/vijest/${esc(n.slug)}">${n.cover_url ? `<img src="${esc(n.cover_url)}" alt="" loading="lazy">` : '<div class="news-noimg"></div>'}<div class="nc-body"><span class="muted">${fmtLong(n.published_at || n.created_at)}</span><h3>${esc(n.title)}</h3><p>${esc(n.excerpt || '')}</p></div></a>`).join('')}</div></section>` : ''}
    `;
  }, { live: true });
}
