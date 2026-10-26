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
      ? `<section class="block home-block"><div class="block-head"><h2>${title}</h2>${link || ''}</div><div class="grid-matches">${items.map(matchCard).join('')}</div></section>`
      : '';
    ctx.app.innerHTML = `
      <div class="home-dashboard">
        <section class="hero home-hero">
          <div class="home-hero-copy">
            <div class="home-kicker">
              <span class="home-kicker-mark" aria-hidden="true"></span>
              <span>TAKMIČARSKI CENTAR</span>
              <span class="home-season-tag">${esc(season.name)}</span>
            </div>
            <h1>Međasi <span>Futsal Liga</span></h1>
            <p class="lead">Svaki rezultat. Svaka ekipa. Svaki trenutak lige — na jednom mjestu.</p>
            <div class="hero-actions home-hero-actions">
              <a class="btn btn-primary home-primary-action" href="#/utakmice">Prati utakmice <span aria-hidden="true">↗</span></a>
              <a class="btn home-secondary-action" href="#/tabela">Pogledaj tabelu</a>
            </div>
            <div class="home-hero-foot">
              <span class="home-live-note"><span class="home-live-beacon" aria-hidden="true"></span>${live.length ? `${live.length} utakmica uživo ili u pauzi` : 'Prati rezultate i raspored lige'}</span>
              <span class="home-foot-divider" aria-hidden="true"></span>
              <span class="home-foot-caption">Zvanični pregled sezone</span>
            </div>
          </div>
          <div class="home-visual" aria-hidden="true">
            <div class="home-visual-grid"></div>
            <div class="home-pitch">
              <span class="home-pitch-half"></span>
              <span class="home-center-circle"></span>
              <span class="home-pitch-spot"></span>
              <span class="home-goal home-goal-left"></span>
              <span class="home-goal home-goal-right"></span>
            </div>
            <div class="home-visual-orb"><span>MF</span></div>
            <div class="home-floating-card home-float-top">
              <span class="home-float-symbol" aria-hidden="true">✦</span>
              <span><strong>Futsal u fokusu</strong><small>Strast. Tim. Igra.</small></span>
            </div>
            <div class="home-floating-card home-float-bottom">
              <span class="home-float-live">${live.length ? 'LIVE' : 'LIGA'}</span>
              <span><strong>${live.length ? 'Akcija je u toku' : 'Sezona na jednom mjestu'}</strong><small>${live.length ? 'Prati utakmicu uživo' : 'Raspored, tabela i vijesti'}</small></span>
            </div>
          </div>
        </section>

        <section class="home-metrics" aria-label="Brzi pregled lige">
          <a class="home-metric" href="#/utakmice">
            <span class="home-metric-icon" aria-hidden="true">◷</span>
            <span class="home-metric-copy"><small>Utakmice</small><strong>${matches.length}</strong></span>
            <span class="home-metric-arrow" aria-hidden="true">↗</span>
          </a>
          <a class="home-metric" href="#/tabela">
            <span class="home-metric-icon" aria-hidden="true">▤</span>
            <span class="home-metric-copy"><small>Ekipe na tabeli</small><strong>${table.length}</strong></span>
            <span class="home-metric-arrow" aria-hidden="true">↗</span>
          </a>
          <a class="home-metric" href="#/vijesti">
            <span class="home-metric-icon" aria-hidden="true">✳</span>
            <span class="home-metric-copy"><small>Najnovije vijesti</small><strong>${news.length}</strong></span>
            <span class="home-metric-arrow" aria-hidden="true">↗</span>
          </a>
        </section>

        ${live.length ? section('Uživo sada', live) : ''}
        ${section('Sljedeće utakmice', upcoming, '<a href="#/utakmice">Sve utakmice <span aria-hidden="true">↗</span></a>')}
        <section class="block home-block home-standings-block">
          <div class="block-head"><h2>Tabela lige</h2><a href="#/tabela">Cijela tabela <span aria-hidden="true">↗</span></a></div>
          <div class="home-table-shell">${standingsTable(table.slice(0, 6), { compact: true })}</div>
        </section>
        ${section('Posljednji rezultati', recent)}
        ${news.length ? `<section class="block home-block home-news-block"><div class="block-head"><h2>Iz života lige</h2><a href="#/vijesti">Sve vijesti <span aria-hidden="true">↗</span></a></div><div class="news-grid">${news.map((n, index) => `<a class="news-card home-news-card${index === 0 ? ' home-news-featured' : ''}" href="#/vijest/${esc(n.slug)}">${n.cover_url ? `<img src="${esc(n.cover_url)}" alt="" loading="lazy">` : '<div class="news-noimg"><span>MEĐASI <b>FUTSAL LIGA</b></span></div>'}<div class="nc-body"><span class="muted">${fmtLong(n.published_at || n.created_at)}</span><h3>${esc(n.title)}</h3><p>${esc(n.excerpt || '')}</p><span class="home-news-read">Pročitaj vijest <span aria-hidden="true">↗</span></span></div></a>`).join('')}</div></section>` : ''}
      </div>
    `;
  }, { live: true });
}
