// js/pages/stats.js
import { getPlayerStats } from '../api.js';
import { esc, empty } from '../util.js';
import { badge } from '../components.js';

const TABS = { goals: 'Strijelci', assists: 'Asistencije', fair: 'Fair play' };

function fairRows(stats) {
  const teams = {};
  stats.forEach((p) => {
    if (!teams[p.team_id]) teams[p.team_id] = { team_id: p.team_id, name: p.team_name, short_name: p.short_name, yellow: 0, red: 0 };
    teams[p.team_id].yellow += p.yellow;
    teams[p.team_id].red += p.red;
  });
  return Object.values(teams).map((t) => ({ ...t, score: t.yellow + 3 * t.red }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
}
function table(stats, tab) {
  if (tab === 'fair') {
    const rows = fairRows(stats);
    return `<table class="standings"><thead><tr><th>#</th><th class="left">Ekipa</th><th>🟨</th><th>🟥</th><th>Bodovi</th></tr></thead><tbody>
      ${rows.map((t, i) => `<tr><td class="pos">${i + 1}</td><td class="team-cell">${badge(t, 'sm')}<span>${esc(t.name)}</span></td>
        <td>${t.yellow}</td><td>${t.red}</td><td class="pts">${t.score}</td></tr>`).join('')}
      </tbody></table>`;
  }
  const key = tab === 'goals' ? 'goals' : 'assists';
  const rows = stats.filter((p) => p[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  return `<table class="standings"><thead><tr><th>#</th><th class="left">Igrač</th><th class="left">Ekipa</th><th>${key === 'goals' ? 'Golovi' : 'Asistencije'}</th></tr></thead><tbody>
    ${rows.map((p, i) => `<tr><td class="pos">${i + 1}</td><td class="left">${esc(p.first_name)} ${esc(p.last_name)}</td>
      <td class="left">${esc(p.short_name || p.team_name)}</td><td class="pts">${p[key]}</td></tr>`).join('')}
    </tbody></table>`;
}
export function registerStats(route) {
  route('/statistika', async (ctx) => {
    const stats = await getPlayerStats();
    if (!ctx.current()) return;
    let tab = 'goals';
    const hasData = stats.some((p) => p.goals || p.assists || p.yellow || p.red);
    ctx.app.innerHTML = `<div class="page-head"><h1>Statistika</h1></div>
      <div class="filters" role="tablist">${Object.entries(TABS).map(([k, label], i) =>
        `<button class="chip${i === 0 ? ' on' : ''}" data-tab="${k}" role="tab" aria-selected="${i === 0}">${label}</button>`).join('')}</div>
      <div id="stats-body"></div>`;
    const draw = () => {
      const body = ctx.app.querySelector('#stats-body');
      if (!body) return;
      body.innerHTML = hasData ? `<div class="table-wrap">${table(stats, tab)}</div>`
        : empty('Statistika će se pojaviti kad se unesu događaji utakmica.');
    };
    ctx.app.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      ctx.app.querySelectorAll('[data-tab]').forEach((b) => {
        b.classList.toggle('on', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      draw();
    }));
    draw();
  });
}
