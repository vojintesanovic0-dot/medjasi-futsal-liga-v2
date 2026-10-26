import { getActiveSeason, getOpenMatches, getMyPredictions, getLeaderboard, getMyPoints, savePrediction, getAllPredictionsForMatches } from '../api.js';
import { state } from '../state.js';
import { esc, fmtDateTime, empty, toast, errMsg } from '../util.js';
import { badge } from '../components.js';
import { render } from '../router.js';

const MAX_GOALS = 30;
function pickCard(m, mine, crowd) {
  const locked = new Date(m.scheduled_at) <= new Date();
  const total = crowd?.total || 0;
  const homeWin = crowd?.home_wins || 0;
  const draw = crowd?.draws || 0;
  const awayWin = crowd?.away_wins || 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const crowdBar = total ? `<div class="crowd" title="Raspodjela pogađanja navijača"><span style="width:${pct(homeWin)}%" class="c-h">${pct(homeWin)}%</span><span style="width:${pct(draw)}%" class="c-d">${pct(draw)}%</span><span style="width:${pct(awayWin)}%" class="c-a">${pct(awayWin)}%</span></div>` : '';
  const form = (!state.session) ? `<p class="muted small">Prijavi se da pogađaš.</p>` : locked ? `<p class="muted small">Pogađanje je zaključano (utakmica je počela).</p>` : `<form class="pick-form" data-match="${esc(m.id)}"><input type="number" name="h" min="0" max="${MAX_GOALS}" required value="${mine ? mine.home_pred : ''}" aria-label="Golovi ${esc(m.home?.name)}"><span class="colon">:</span><input type="number" name="a" min="0" max="${MAX_GOALS}" required value="${mine ? mine.away_pred : ''}" aria-label="Golovi ${esc(m.away?.name)}"><button class="btn btn-primary btn-sm" type="submit">${mine ? 'Izmijeni' : 'Pogađaj'}</button></form>`;
  return `<article class="pick-card card"><div class="mc-top"><span class="muted">${m.round}. kolo</span><span class="muted small">${esc(fmtDateTime(m.scheduled_at))}</span></div><div class="pick-teams"><div class="side">${badge(m.home, 'sm')}<span class="tname">${esc(m.home?.name)}</span></div><span class="vs">vs</span><div class="side right"><span class="tname">${esc(m.away?.name)}</span>${badge(m.away, 'sm')}</div></div>${form}${mine ? `<p class="small muted">Tvoje pogađanje: <strong>${mine.home_pred}:${mine.away_pred}</strong></p>` : ''}${crowdBar}</article>`;
}
function badgesFor(row, index) {
  const badges = [];
  if (index === 0 && row.points > 0) badges.push('👑 Lider');
  if (row.exact_hits >= 3) badges.push('🎯 Snajper');
  if (row.predictions >= 10 && row.points >= 20) badges.push('🔥 Vatreni');
  return badges.map((label) => `<span class="tag">${label}</span>`).join(' ');
}

export function registerFan(route) {
  route('/fan', async (ctx) => {
    const season = await getActiveSeason(); if (!season) { ctx.app.innerHTML = empty('Nema aktivne sezone.'); return; }
    const uid = state.session?.user?.id;
    const [matches, board, mine, points] = await Promise.all([getOpenMatches(season.id), getLeaderboard(), uid ? getMyPredictions(uid) : Promise.resolve([]), uid ? getMyPoints(uid) : Promise.resolve([])]);
    const crowd = await getAllPredictionsForMatches(matches.map((m) => m.id)); if (!ctx.current()) return;
    const crowdBy = Object.fromEntries(crowd.map((p) => [p.match_id, p]));
    const mineBy = Object.fromEntries(mine.map((p) => [p.match_id, p]));
    const totalPts = points.reduce((s, p) => s + (p.points || 0), 0);
    const myRank = uid ? board.findIndex((r) => r.user_id === uid) + 1 : 0;
    ctx.app.innerHTML = `<div class="page-head"><h1>Fan game</h1><p class="muted">Pogodi rezultat prije početka utakmice. Tačan ishod = 3 boda, tačan rezultat = +2 boda.</p></div>${uid ? `<div class="stat-row"><div class="stat"><span>Moji bodovi</span><strong>${totalPts}</strong></div><div class="stat"><span>Pozicija</span><strong>${myRank ? `#${myRank}` : '–'}</strong></div><div class="stat"><span>Tačnih rezultata</span><strong>${points.filter((p) => p.exact_hit).length}</strong></div></div>` : ''}<section class="block"><h2>Predstojeće utakmice</h2>${matches.length ? `<div class="pick-grid">${matches.map((m) => pickCard(m, mineBy[m.id], crowdBy[m.id])).join('')}</div>` : empty('Nema zakazanih utakmica za pogađanje.')}</section><section class="block"><h2>Rang lista</h2>${board.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th class="left">Navijač</th><th>Pogođeno</th><th>Tačnih</th><th>Bod</th></tr></thead><tbody>${board.map((r, i) => `<tr class="${r.user_id === uid ? 'is-me' : ''}"><td class="pos">${i + 1}</td><td class="left">${esc(r.display_name || r.username)} <span class="muted small">@${esc(r.username)}</span> ${badgesFor(r, i)}</td><td>${r.predictions}</td><td>${r.exact_hits}</td><td class="pts">${r.points}</td></tr>`).join('')}</tbody></table></div>` : empty('Rang lista će se popuniti kad se odigraju utakmice s pogađanjima.')}</section>`;
    ctx.app.querySelectorAll('.pick-form').forEach((form) => form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!uid) return; const h = Number(form.h.value), a = Number(form.a.value);
      if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > MAX_GOALS || a > MAX_GOALS) { toast(`Unesi cijele brojeve od 0 do ${MAX_GOALS}.`, 'err'); return; }
      const btn = form.querySelector('button'); btn.disabled = true;
      try { await savePrediction(uid, form.dataset.match, h, a); toast('Pogađanje sačuvano.'); await render({ keepScroll: true }); }
      catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; }
    }));
  });
}
