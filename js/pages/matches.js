import { getActiveSeason, getMatches, getMatch, getEvents, getPlayers } from '../api.js';
import { esc, fmtDateTime, empty, periodName, STATUS_LABEL } from '../util.js';
import { matchCard, badge, scoreHtml, statusPill, clockHtml } from '../components.js';
import { onLeave } from '../router.js';
import { shareMatchImage, matchIcsUrl, seasonIcsUrl } from '../share.js';
import { toast, errMsg } from '../util.js';
import { loadMatchExtras, mountMatchExtras } from '../match-extras.js';
import { loadLineups, lineupsHtml } from '../lineups.js';

const EVENT_LABEL = { goal: 'Gol', own_goal: 'Autogol', yellow: 'Žuti karton', red: 'Crveni karton' };
export function registerMatches(route) {
  route('/utakmice', async (ctx) => {
    const season = await getActiveSeason(); if (!season) { ctx.app.innerHTML = empty('Nema aktivne sezone.'); return; }
    const matches = await getMatches(season.id); if (!ctx.current()) return;
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    ctx.app.innerHTML = `<div class="page-head"><h1>Utakmice</h1><div class="filters" role="tablist">${[['all', 'Sve'], ['live', 'Uživo'], ['scheduled', 'Predstojeće'], ['finished', 'Završene']].map(([k, l], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div></div><div class="match-actions"><a class="btn btn-sm" id="season-ics" href="#" download="sezona.ics"${matches.length ? '' : ' hidden'} ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg> Kalendar cijele sezone</a></div><div id="match-list">${rounds.length ? rounds.map((r) => `<section class="round" data-round><h2>${r}. kolo</h2><div class="grid-matches">${matches.filter((m) => m.round === r).map((m) => `<div data-status="${esc(m.status)}" class="mw">${matchCard(m)}</div>`).join('')}</div></section>`).join('') : empty('Nema utakmica.')}</div>`;
    const seasonLink = ctx.app.querySelector('#season-ics');
    if (seasonLink && matches.length) {
      const icsUrl = seasonIcsUrl(matches, season.name);
      seasonLink.href = icsUrl;
      onLeave(() => URL.revokeObjectURL(icsUrl));
    }
    ctx.app.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
      ctx.app.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b === btn)); const f = btn.dataset.filter;
      ctx.app.querySelectorAll('.mw').forEach((el) => { const st = el.dataset.status; const show = f === 'all' || (f === 'live' ? (st === 'live' || st === 'paused') : st === f); el.hidden = !show; });
      ctx.app.querySelectorAll('[data-round]').forEach((sec) => { sec.hidden = [...sec.querySelectorAll('.mw')].every((el) => el.hidden); });
    }));
  }, { live: true });
  route('/utakmica/:id', async (ctx, id) => {
    const match = await getMatch(id); if (!match) { ctx.app.innerHTML = empty('Utakmica nije pronađena.'); return; }
    const [events, homePlayers, awayPlayers] = await Promise.all([getEvents(id), getPlayers(match.home_team_id), getPlayers(match.away_team_id)]);
    if (!ctx.current()) return;
    const extras = await loadMatchExtras(match);
    if (!ctx.current()) return;
    const lineups = await loadLineups(id).catch(() => null);
    if (!ctx.current()) return;
    const timeline = events.length ? `<ol class="timeline">${events.map((e) => {
      const team = e.team_id === match.home_team_id ? match.home : match.away;
      const who = e.player ? `${esc(e.player.first_name)} ${esc(e.player.last_name)}${e.player.number != null ? ` (${e.player.number})` : ''}` : '—';
      const assist = e.assist ? ` · asistencija: ${esc(e.assist.first_name)} ${esc(e.assist.last_name)}` : '';
      return `<li class="ev ev-${esc(e.type)}"><span class="min">${e.minute}'</span><div><strong>${EVENT_LABEL[e.type] || esc(e.type)}</strong> — ${who}${assist}<span class="muted">${esc(team?.name || '')}${e.type === 'own_goal' ? ' (protivnik dobija gol)' : ''}</span></div></li>`;
    }).join('')}</ol>` : empty('Još nema događaja.');
    const lineup = (team, players) => `<div class="card"><h3>${badge(team, 'sm')} ${esc(team?.name)}</h3>${players.length ? `<ul class="roster">${players.map((p) => `<li><span class="no">${p.number ?? '–'}</span>${esc(p.first_name)} ${esc(p.last_name)}${p.is_captain ? ' <span class="tag">C</span>' : ''}</li>`).join('')}</ul>` : '<p class="muted">Nema igrača.</p>'}</div>`;
    const live = match.status === 'live' || match.status === 'paused';
    ctx.app.innerHTML = `<a class="back" href="#/utakmice">← Sve utakmice</a><section class="match-hero ${live ? 'is-live' : ''}"><div class="mh-meta">${statusPill(match)} <span class="muted">${match.round}. kolo${match.venue ? ' · ' + esc(match.venue) : ''}</span></div><div class="mh-score"><a href="#/ekipa/${esc(match.home_team_id)}" class="mh-team">${badge(match.home, 'lg')}<span>${esc(match.home?.name)}</span></a><div class="score big">${scoreHtml(match)}</div><a href="#/ekipa/${esc(match.away_team_id)}" class="mh-team">${badge(match.away, 'lg')}<span>${esc(match.away?.name)}</span></a></div><div class="mh-foot">${match.status === 'scheduled' ? esc(fmtDateTime(match.scheduled_at)) : `${live ? clockHtml(match) : `<span class="period">${esc(periodName(match))} · ${esc(STATUS_LABEL[match.status])}</span>`}`}</div></section><div class="match-actions">${match.status === 'scheduled' ? `<a class="btn btn-sm" id="ics" href="#" download="utakmica.ics" ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg> Dodaj u kalendar</a>` : ''}<button class="btn btn-sm" id="share-img" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg> Podijeli rezultat</button></div><section class="block"><h2>Tok utakmice</h2>${timeline}</section>${extras.html}${lineups && lineupsHtml(match, lineups) || `<section class="block"><h2>Sastavi</h2><div class="two-col">${lineup(match.home, homePlayers)}${lineup(match.away, awayPlayers)}</div></section>`}`;
    mountMatchExtras(ctx.app, match);
    const ics = ctx.app.querySelector('#ics'); if (ics) { const url = matchIcsUrl(match); ics.href = url; onLeave(() => URL.revokeObjectURL(url)); }
    ctx.app.querySelector('#share-img').addEventListener('click', async (e) => { const btn = e.currentTarget; btn.disabled = true; try { await shareMatchImage(match); } catch (err) { toast(errMsg(err), 'err'); } btn.disabled = false; });
  }, { live: true });
}
