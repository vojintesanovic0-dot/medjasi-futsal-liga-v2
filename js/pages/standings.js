import { getStandings, getActiveSeason, getMatches } from '../api.js';
import { badge } from '../components.js';
import { empty, esc } from '../util.js';

function formOf(teamId, matches) {
  return matches
    .filter((match) => match.status === 'finished' && (match.home_team_id === teamId || match.away_team_id === teamId))
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(-5)
    .map((match) => {
      const isHome = match.home_team_id === teamId;
      const mine = isHome ? match.home_score : match.away_score;
      const theirs = isHome ? match.away_score : match.home_score;
      return mine > theirs ? 'P' : mine === theirs ? 'N' : 'I';
    });
}

function table(rows, matches) {
  if (!rows.length) return empty('Tabela još nema ekipa.');
  const classByForm = { P: 'ok', N: 'draw', I: 'lost' };
  return `<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th class="left">Ekipa</th><th title="Odigrano">O</th><th title="Pobjede">P</th>
      <th title="Neriješeno">N</th><th title="Porazi">I</th><th title="Golovi">Gol</th>
      <th title="Gol razlika">GR</th><th title="Bodovi">Bod</th><th>Forma</th></tr></thead>
    <tbody>${rows.map((row, index) => `<tr>
      <td class="pos">${index + 1}</td>
      <td class="team-cell"><a href="#/ekipa/${esc(row.team_id)}">${badge(row, 'sm')}<span>${esc(row.name)}</span></a></td>
      <td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td>
      <td>${row.goals_for}:${row.goals_against}</td><td>${row.goal_diff > 0 ? '+' : ''}${row.goal_diff}</td>
      <td class="pts">${row.points}</td>
      <td><div class="form-row">${formOf(row.team_id, matches).map((result) =>
        `<span class="form-dot form-${classByForm[result]}" style="width:24px;height:24px;font-size:.7rem" title="${result === 'P' ? 'Pobjeda' : result === 'N' ? 'Neriješeno' : 'Poraz'}">${result}</span>`).join('')}</div></td>
    </tr>`).join('')}</tbody></table></div>`;
}

export function registerStandings(route) {
  route('/tabela', async (ctx) => {
    const season = await getActiveSeason();
    const [rows, matches] = await Promise.all([
      getStandings(),
      season ? getMatches(season.id) : Promise.resolve([]),
    ]);
    if (!ctx.current()) return;
    ctx.app.innerHTML = `
      <div class="page-head"><h1>Tabela</h1><p class="muted">${season ? esc(season.name) : ''}</p></div>
      <div class="card">${season ? table(rows, matches) : empty('Nema aktivne sezone.')}</div>
      <p class="legend muted">O = odigrano · P = pobjede · N = neriješeno · I = porazi · GR = gol razlika · Bod = bodovi (3 za pobjedu, 1 za remi) · Forma = zadnjih 5 utakmica</p>`;
  }, { live: true });
}
