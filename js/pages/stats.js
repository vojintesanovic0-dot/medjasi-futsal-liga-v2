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

function playerRows(stats, key) {
  return stats.filter((p) => Number(p[key]) > 0)
    .sort((a, b) => Number(b[key]) - Number(a[key])
      || String(a.last_name || '').localeCompare(String(b.last_name || ''))
      || String(a.first_name || '').localeCompare(String(b.first_name || '')));
}

function table(stats, tab) {
  if (tab === 'fair') {
    const rows = fairRows(stats);
    return `<table class="standings"><thead><tr><th>#</th><th class="left">Ekipa</th><th title="Žuti kartoni">Žuti</th><th title="Crveni kartoni">Crveni</th><th>Bodovi</th></tr></thead><tbody>
      ${rows.map((t, i) => `<tr><td class="pos">${i + 1}</td><td class="team-cell">${badge(t, 'sm')}<span>${esc(t.name)}</span></td>
        <td>${t.yellow}</td><td>${t.red}</td><td class="pts">${t.score}</td></tr>`).join('')}
      </tbody></table>`;
  }
  const key = tab === 'goals' ? 'goals' : 'assists';
  const rows = playerRows(stats, key);
  return `<table class="standings"><thead><tr><th>#</th><th class="left">Igrač</th><th class="left">Ekipa</th><th>${key === 'goals' ? 'Golovi' : 'Asistencije'}</th></tr></thead><tbody>
    ${rows.map((p, i) => `<tr><td class="pos">${i + 1}</td><td class="left">${esc(p.first_name)} ${esc(p.last_name)}</td>
      <td class="left">${esc(p.short_name || p.team_name)}</td><td class="pts">${p[key]}</td></tr>`).join('')}
    </tbody></table>`;
}

function visuals(stats, tab) {
  if (tab === 'fair') {
    const rows = fairRows(stats);
    const maxScore = Math.max(1, ...rows.map((team) => Number(team.score) || 0));
    return `<section class="stats-visual-grid" aria-label="Vizuelni pregled fair playa">
      <article class="stats-chart-card stats-fair-card">
        <div class="stats-chart-heading"><div><span class="stats-overline">DISCIPLINA</span><h2>Fair play pregled</h2></div><span class="stats-chart-note">Manje bodova = bolje</span></div>
        ${rows.length ? `<ol class="stats-fair-list">${rows.slice(0, 6).map((team, index) => {
          const width = Number(team.score) > 0 ? Math.max(4, Math.round((Number(team.score) / maxScore) * 100)) : 0;
          return `<li class="stats-fair-item"><div class="stats-fair-row"><span class="stats-chart-rank">${String(index + 1).padStart(2, '0')}</span>${badge(team, 'sm')}<strong>${esc(team.name)}</strong><span class="stats-fair-cards"><span class="stats-yellow-count">■ ${team.yellow}</span><span class="stats-red-count">■ ${team.red}</span></span><b>${team.score}</b></div><div class="stats-bar-track stats-discipline-track"><span style="width:${width}%"></span></div></li>`;
        }).join('')}</ol>` : empty('Nema disciplinskih podataka.')}
      </article>
      <aside class="stats-explainer"><span class="stats-explainer-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></svg></span><span class="stats-overline">BODOVANJE</span><h3>Fer igra je dio rezultata.</h3><p>Žuti karton vrijedi 1 disciplinski bod, a crveni 3. Lista je poredana od najmanjeg broja bodova.</p><div class="stats-card-key"><span><i class="stats-key-yellow"></i>Žuti karton · 1</span><span><i class="stats-key-red"></i>Crveni karton · 3</span></div></aside>
    </section>`;
  }

  const key = tab === 'goals' ? 'goals' : 'assists';
  const noun = key === 'goals' ? 'golova' : 'asistencija';
  const rows = playerRows(stats, key);
  if (!rows.length) {
    return `<section class="stats-visual-grid"><article class="stats-chart-card"><div class="stats-chart-heading"><div><span class="stats-overline">RANG LISTA</span><h2>${TABS[tab]}</h2></div></div>${empty(`Još nema evidentiranih ${noun}.`)}</article></section>`;
  }
  const leader = rows[0];
  const max = Math.max(1, Number(leader[key]) || 0);
  const total = rows.reduce((sum, player) => sum + (Number(player[key]) || 0), 0);
  const initials = `${String(leader.first_name || '').trim().slice(0, 1)}${String(leader.last_name || '').trim().slice(0, 1)}`.toUpperCase() || 'MF';
  return `<section class="stats-visual-grid" aria-label="Grafički pregled ${TABS[tab].toLowerCase()}">
    <article class="stats-leader-card">
      <div class="stats-leader-top"><span class="stats-overline">LIDER LIGE</span><span class="stats-rank-pill">#01</span></div>
      <div class="stats-leader-avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="stats-leader-info"><span class="stats-leader-label">Trenutno prvi na listi</span><h2>${esc(leader.first_name)} ${esc(leader.last_name)}</h2><p>${esc(leader.short_name || leader.team_name || 'Ekipa')}</p></div>
      <div class="stats-leader-score"><strong>${Number(leader[key]) || 0}</strong><span>${noun}</span></div>
      <div class="stats-leader-foot"><span>Ukupno u ovoj listi</span><strong>${total}</strong></div>
    </article>
    <article class="stats-chart-card">
      <div class="stats-chart-heading"><div><span class="stats-overline">TOP ${Math.min(rows.length, 5)}</span><h2>${TABS[tab]}</h2></div><span class="stats-chart-note">Poredano po učinku</span></div>
      <ol class="stats-bar-list">${rows.slice(0, 5).map((player, index) => {
        const value = Number(player[key]) || 0;
        const width = Math.max(4, Math.round((value / max) * 100));
        return `<li class="stats-bar-item"><span class="stats-chart-rank">${String(index + 1).padStart(2, '0')}</span><div class="stats-bar-profile"><div class="stats-bar-name"><strong>${esc(player.first_name)} ${esc(player.last_name)}</strong><span>${esc(player.short_name || player.team_name || '')}</span></div><div class="stats-bar-track"><span style="width:${width}%"></span></div></div><b class="stats-bar-value">${value}</b></li>`;
      }).join('')}</ol>
    </article>
  </section>`;
}

export function registerStats(route) {
  route('/statistika', async (ctx) => {
    const stats = await getPlayerStats();
    if (!ctx.current()) return;
    let tab = 'goals';
    const hasData = stats.some((p) => p.goals || p.assists || p.yellow || p.red);
    const totalGoals = stats.reduce((sum, player) => sum + (Number(player.goals) || 0), 0);
    const totalAssists = stats.reduce((sum, player) => sum + (Number(player.assists) || 0), 0);
    const totalYellow = stats.reduce((sum, player) => sum + (Number(player.yellow) || 0), 0);
    const totalRed = stats.reduce((sum, player) => sum + (Number(player.red) || 0), 0);
    const teamCount = new Set(stats.map((player) => player.team_id).filter(Boolean)).size;
    ctx.app.innerHTML = `<div class="stats-page">
      <section class="stats-hero"><div><span class="stats-overline">BROJEVI SEZONE</span><h1>Statistika</h1><p>Učinak igrača i disciplina ekipa, pregledno na jednom mjestu.</p></div><div class="stats-hero-mark" aria-hidden="true"><span>MF</span><i></i><i></i><i></i></div></section>
      <section class="stats-summary" aria-label="Sažetak statistike">
        <div class="stats-summary-item"><span class="stats-summary-icon stats-icon-goals" aria-hidden="true">↗</span><span><small>Golovi</small><strong>${totalGoals}</strong></span></div>
        <div class="stats-summary-item"><span class="stats-summary-icon stats-icon-assists" aria-hidden="true">◎</span><span><small>Asistencije</small><strong>${totalAssists}</strong></span></div>
        <div class="stats-summary-item"><span class="stats-summary-icon stats-icon-yellow" aria-hidden="true">▰</span><span><small>Žuti kartoni</small><strong>${totalYellow}</strong></span></div>
        <div class="stats-summary-item"><span class="stats-summary-icon stats-icon-red" aria-hidden="true">▰</span><span><small>Crveni kartoni</small><strong>${totalRed}</strong></span></div>
        <div class="stats-summary-item"><span class="stats-summary-icon stats-icon-teams" aria-hidden="true">◇</span><span><small>Ekipa</small><strong>${teamCount}</strong></span></div>
      </section>
      <div class="stats-tabs-wrap"><div class="filters stats-tabs" role="tablist" aria-label="Vrsta statistike">${Object.entries(TABS).map(([k, label], i) =>
        `<button class="chip${i === 0 ? ' on' : ''}" data-tab="${k}" role="tab" aria-selected="${i === 0}">${label}</button>`).join('')}</div></div>
      <div id="stats-body" class="stats-body"></div>
    </div>`;
    const draw = () => {
      const body = ctx.app.querySelector('#stats-body');
      if (!body) return;
      if (!hasData) {
        body.innerHTML = empty('Statistika će se pojaviti kad se unesu događaji utakmica.');
        return;
      }
      const rowCount = tab === 'fair' ? fairRows(stats).length : playerRows(stats, tab === 'goals' ? 'goals' : 'assists').length;
      body.innerHTML = `${visuals(stats, tab)}
        <section class="stats-table-panel">
          <div class="stats-table-heading"><div><span class="stats-overline">DETALJNI PREGLED</span><h2>${TABS[tab]}</h2></div><span class="stats-table-count">${rowCount} ${tab === 'fair' ? 'ekipa' : 'igrača'}</span></div>
          ${rowCount ? `<div class="table-wrap">${table(stats, tab)}</div>` : empty(`Još nema evidentiranih podataka za: ${TABS[tab].toLowerCase()}.`)}
        </section>`;
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
