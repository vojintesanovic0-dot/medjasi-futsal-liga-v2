import { getActiveSeason, getSeasons, getStandings, getMatches, getPublishedNews, getActiveSponsors } from '../api.js';
import { sponsorsHtml } from '../sponsors.js';
import { esc, fmtLong, fmtDateTime, empty } from '../util.js';
import { matchCard, standingsTable, badge, scoreHtml } from '../components.js';

export function registerHome(route) {
  route('/', async (ctx) => {
    const season = await getActiveSeason() || (await getSeasons())[0] || null;
    if (!season) { ctx.app.innerHTML = `<div class="home-dashboard"><section class="hero home-hero"><div class="home-hero-copy"><div class="home-kicker"><span class="home-kicker-mark" aria-hidden="true"></span><span>TAKMIČARSKI CENTAR</span></div><h1>Međasi <span>Futsal Liga</span></h1><p class="lead">Svaki rezultat. Svaka ekipa. Svaki trenutak lige — na jednom mjestu.</p><div class="hero-actions home-hero-actions"><a class="btn btn-primary home-primary-action" href="#/utakmice">Pogledaj utakmice <span aria-hidden="true">↗</span></a><a class="btn home-secondary-action" href="#/tabela">Pogledaj tabelu</a></div><div class="home-hero-foot"><span class="home-live-note">Sezona još nije kreirana ili aktivirana.</span></div></div><div class="home-visual"><div class="home-visual-grid" aria-hidden="true"></div><div class="home-pitch" aria-hidden="true"><span class="home-pitch-half"></span><span class="home-center-circle"></span><span class="home-pitch-spot"></span><span class="home-goal home-goal-left"></span><span class="home-goal home-goal-right"></span></div><div class="home-visual-orb" aria-hidden="true"><span>MF</span></div></div></section><section class="block home-block"><div class="block-head"><h2>Dobro došli</h2></div><p class="muted">Sadržaj lige će se prikazati čim administrator podesi sezonu. Ostali dijelovi sajta ostaju dostupni kroz meni.</p></section></div>`; return; }
    const [matches, table, news, sponsors] = await Promise.all([
      getMatches(season.id), getStandings(), getPublishedNews(3), getActiveSponsors().catch(() => []),
    ]);
    if (!ctx.current()) return;
    const live = matches.filter((m) => m.status === 'live' || m.status === 'paused');
    const upcoming = matches.filter((m) => m.status === 'scheduled').slice(0, 3);
    const recent = matches.filter((m) => m.status === 'finished').slice(-3).reverse();
    const spotlight = live[0] || upcoming[0] || recent[0] || null;
    const spotlightIsLive = Boolean(spotlight && (spotlight.status === 'live' || spotlight.status === 'paused'));
    const spotlightIsScheduled = spotlight?.status === 'scheduled';
    const spotlightLabel = spotlightIsLive ? (spotlight.status === 'paused' ? 'PAUZA' : 'UŽIVO')
      : spotlightIsScheduled ? 'SLJEDEĆA UTAKMICA' : 'POSLJEDNJI REZULTAT';
    const spotlightInfo = spotlightIsScheduled ? fmtDateTime(spotlight.scheduled_at)
      : spotlightIsLive ? (spotlight.status === 'paused' ? 'Utakmica je u pauzi' : 'Rezultat uživo') : 'Konačan rezultat';
    const homeName = spotlight ? String(spotlight.home?.short_name || spotlight.home?.name || 'Domaći') : '';
    const awayName = spotlight ? String(spotlight.away?.short_name || spotlight.away?.name || 'Gosti') : '';
    const spotlightClass = spotlightIsLive ? 'is-live' : spotlightIsScheduled ? 'is-upcoming' : 'is-finished';
    const featuredMatch = spotlight
      ? '<a class="home-floating-card home-float-bottom home-match-spotlight ' + spotlightClass
        + '" href="#/utakmica/' + esc(spotlight.id) + '" aria-label="Detalji utakmice: ' + esc(homeName) + ' — ' + esc(awayName) + '">'
        + '<div class="home-spotlight-top"><span class="home-spotlight-status"><i class="home-spotlight-pip" aria-hidden="true"></i>' + spotlightLabel
        + '</span><span class="home-spotlight-meta">' + esc(spotlightInfo) + '</span></div>'
        + '<div class="home-spotlight-matchup"><span class="home-spotlight-team home-spotlight-home">' + badge(spotlight.home, 'sm')
        + '<strong>' + esc(homeName) + '</strong></span><span class="home-spotlight-score">' + scoreHtml(spotlight)
        + '</span><span class="home-spotlight-team home-spotlight-away"><strong>' + esc(awayName) + '</strong>'
        + badge(spotlight.away, 'sm') + '</span></div>'
        + '<div class="home-spotlight-footer"><span>' + esc(spotlight.round) + '. kolo</span><strong>Detalji utakmice <span aria-hidden="true">↗</span></strong></div></a>'
      : '<div class="home-floating-card home-float-bottom home-match-spotlight is-empty"><div class="home-spotlight-top">'
        + '<span class="home-spotlight-status"><i class="home-spotlight-pip" aria-hidden="true"></i>SEZONA</span>'
        + '<span class="home-spotlight-meta">' + esc(season.name) + '</span></div>'
        + '<div class="home-spotlight-empty"><strong>Nema utakmica za prikaz</strong><span>Raspored i rezultati lige</span></div></div>';
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
          <div class="home-visual">
            <div class="home-visual-grid" aria-hidden="true"></div>
            <div class="home-pitch" aria-hidden="true">
              <span class="home-pitch-half"></span>
              <span class="home-center-circle"></span>
              <span class="home-pitch-spot"></span>
              <span class="home-goal home-goal-left"></span>
              <span class="home-goal home-goal-right"></span>
            </div>
            <div class="home-visual-orb" aria-hidden="true"><span>MF</span></div>
            <div class="home-floating-card home-float-top" aria-hidden="true">
              <span class="home-float-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></svg></span>
              <span><strong>Futsal u fokusu</strong><small>Strast. Tim. Igra.</small></span>
            </div>
            ${featuredMatch}
          </div>
        </section>

        <section class="home-metrics" aria-label="Brzi pregled lige">
          <a class="home-metric" href="#/utakmice">
            <span class="home-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
            <span class="home-metric-copy"><small>Utakmice</small><strong>${matches.length}</strong></span>
            <span class="home-metric-arrow" aria-hidden="true">↗</span>
          </a>
          <a class="home-metric" href="#/tabela">
            <span class="home-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4zM4 10h16M9 5v14"/></svg></span>
            <span class="home-metric-copy"><small>Ekipe na tabeli</small><strong>${table.length}</strong></span>
            <span class="home-metric-arrow" aria-hidden="true">↗</span>
          </a>
          <a class="home-metric" href="#/vijesti">
            <span class="home-metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg></span>
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
        ${sponsorsHtml(sponsors)}
        ${news.length ? `<section class="block home-block home-news-block"><div class="block-head"><h2>Iz života lige</h2><a href="#/vijesti">Sve vijesti <span aria-hidden="true">↗</span></a></div><div class="news-grid">${news.map((n, index) => `<a class="news-card home-news-card${index === 0 ? ' home-news-featured' : ''}" href="#/vijest/${esc(n.slug)}">${n.cover_url ? `<img src="${esc(n.cover_url)}" alt="" loading="lazy">` : '<div class="news-noimg"><span>MEĐASI <b>FUTSAL LIGA</b></span></div>'}<div class="nc-body"><span class="muted">${fmtLong(n.published_at || n.created_at)}</span><h3>${esc(n.title)}</h3><p>${esc(n.excerpt || '')}</p><span class="home-news-read">Pročitaj vijest <span aria-hidden="true">↗</span></span></div></a>`).join('')}</div></section>` : ''}
      </div>
    `;
  }, { live: true });
}
