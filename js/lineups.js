import { getMatchPlayers, getSubstitutions, getMatchPlayerStats } from './api.js';
import { esc } from './util.js';

// Učitava sastav, zamjene i ocjene za utakmicu (javno čitanje)
export async function loadLineups(matchId) {
  const [matchPlayers, subs, stats] = await Promise.all([
    getMatchPlayers(matchId), getSubstitutions(matchId), getMatchPlayerStats(matchId),
  ]);
  return { matchPlayers, subs, stats };
}

const byNumber = (a, b) => (a.player?.number ?? 999) - (b.player?.number ?? 999);
const ratingBadge = (r) => (r == null ? '' : `<span class="rating ${r >= 7 ? 'good' : r >= 5 ? 'mid' : 'low'}">${Number(r).toFixed(1)}</span>`);

// Vraća HTML za sastave i zamjene, ili null ako sastav nije unesen
export function lineupsHtml(match, { matchPlayers, subs, stats }) {
  if (!matchPlayers.length) return null;
  const statOf = (pid) => stats.find((s) => s.player_id === pid);
  const teamBlock = (team, teamId) => {
    const rows = matchPlayers.filter((mp) => mp.team_id === teamId);
    const starters = rows.filter((r) => r.is_starter).sort(byNumber);
    const bench = rows.filter((r) => !r.is_starter).sort(byNumber);
    const line = (r) => {
      const s = statOf(r.player_id);
      const name = `<a href="#/igrac/${esc(r.player_id)}">${esc(r.player?.first_name)} ${esc(r.player?.last_name)}</a>`;
      const saves = s?.saves ? ` <span class="muted small">odbrane: ${s.saves}</span>` : '';
      return `<li><span class="no">${r.player?.number ?? '–'}</span>${name}${r.player?.is_captain ? ' <span class="tag">C</span>' : ''}${saves} ${ratingBadge(s?.rating)}</li>`;
    };
    const teamSubs = subs.filter((s) => s.team_id === teamId);
    return `<div class="card"><h3>${esc(team?.name)}</h3>
      <h4 class="small muted">Startna postava</h4>
      <ul class="roster">${starters.map(line).join('') || '<li class="muted">Nema unesenih igrača.</li>'}</ul>
      ${bench.length ? `<h4 class="small muted">Klupa</h4><ul class="roster">${bench.map(line).join('')}</ul>` : ''}
      ${teamSubs.length ? `<h4 class="small muted">Zamjene</h4><ul class="subs">${teamSubs.map((s) =>
        `<li><span class="min">${s.minute}'</span> <span class="out">↓ ${esc(s.out?.first_name)} ${esc(s.out?.last_name)}</span> <span class="in">↑ ${esc(s.in?.first_name)} ${esc(s.in?.last_name)}</span></li>`).join('')}</ul>` : ''}
    </div>`;
  };
  return `<section class="block"><h2>Sastavi</h2><div class="two-col">${teamBlock(match.home, match.home_team_id)}${teamBlock(match.away, match.away_team_id)}</div></section>`;
}
