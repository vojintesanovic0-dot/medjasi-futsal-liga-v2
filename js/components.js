import { esc, safeColor, safeUrl, fmtDateTime, mmss, matchElapsed, STATUS_LABEL, periodName } from './util.js';

export function badge(team, size = 'md') {
  const initials = (team?.short_name || team?.name || '?').slice(0, 3).toUpperCase();
  const img = safeUrl(team?.logo_url);
  return `<span class="badge badge-${size}" style="--tc:${safeColor(team?.color)}">${
    img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span>${esc(initials)}</span>`}</span>`;
}

export function statusPill(m) {
  return `<span class="pill pill-${esc(m.status)}">${m.status === 'live' ? '<i class="dot"></i>' : ''}${esc(STATUS_LABEL[m.status] || m.status)}</span>`;
}

// Sat se ažurira u JS-u na osnovu data atributa (ne čeka server)
export function clockHtml(m) {
  const limit = (m.period_minutes || 20) * 60;
  return `<span class="clock" data-clock data-base="${m.clock_seconds || 0}" data-start="${esc(m.clock_started_at || '')}"
    data-live="${m.status === 'live' ? 1 : 0}" data-limit="${limit}">${mmss(matchElapsed(m))}</span>
    <span class="period">${esc(periodName(m))}</span>`;
}

export function scoreHtml(m) {
  if (m.status === 'scheduled') return `<span class="vs">vs</span>`;
  return `<span class="num">${m.home_score}</span><span class="colon">:</span><span class="num">${m.away_score}</span>`;
}

export function matchCard(m) {
  const live = m.status === 'live' || m.status === 'paused';
  const foot = m.status === 'scheduled'
    ? `${esc(fmtDateTime(m.scheduled_at))}${m.venue ? ' · ' + esc(m.venue) : ''}`
    : (live ? clockHtml(m) : (m.venue ? esc(m.venue) : ''));
  return `<a class="match-card${live ? ' is-live' : ''}" href="#/utakmica/${esc(m.id)}">
    <div class="mc-top"><span class="muted">${m.round}. kolo</span>${statusPill(m)}</div>
    <div class="mc-teams">
      <div class="side">${badge(m.home)}<span class="tname">${esc(m.home?.name)}</span></div>
      <div class="score">${scoreHtml(m)}</div>
      <div class="side right"><span class="tname">${esc(m.away?.name)}</span>${badge(m.away)}</div>
    </div>
    <div class="mc-foot">${foot}</div>
  </a>`;
}

export function standingsTable(rows, { compact = false } = {}) {
  if (!rows.length) return '<div class="empty">Tabela još nema ekipa.</div>';
  const body = rows.map((r, i) => `<tr>
      <td class="pos">${i + 1}</td>
      <td class="team-cell"><a href="#/ekipa/${esc(r.team_id)}">${badge(r, 'sm')}<span>${esc(r.name)}</span></a></td>
      <td>${r.played}</td>
      ${compact ? '' : `<td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>`}
      ${compact ? '' : `<td>${r.goals_for}:${r.goals_against}</td>`}
      <td>${r.goal_diff > 0 ? '+' : ''}${r.goal_diff}</td>
      <td class="pts">${r.points}</td>
    </tr>`).join('');
  return `<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th class="left">Ekipa</th><th title="Odigrano">O</th>
      ${compact ? '' : '<th title="Pobjede">P</th><th title="Neriješeno">N</th><th title="Porazi">I</th><th title="Golovi">Gol</th>'}
      <th title="Gol razlika">GR</th><th title="Bodovi">Bod</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}
