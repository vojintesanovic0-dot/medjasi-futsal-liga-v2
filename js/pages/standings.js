import { getStandings, getActiveSeason } from '../api.js';
import { standingsTable } from '../components.js';
import { empty, esc } from '../util.js';

export function registerStandings(route) {
  route('/tabela', async (ctx) => {
    const [season, rows] = await Promise.all([getActiveSeason(), getStandings()]);
    if (!ctx.current()) return;
    ctx.app.innerHTML = `
      <div class="page-head"><h1>Tabela</h1><p class="muted">${season ? esc(season.name) : ''}</p></div>
      <div class="card">${season ? standingsTable(rows) : empty('Nema aktivne sezone.')}</div>
      <p class="legend muted">O = odigrano · P = pobjede · N = neriješeno · I = porazi · GR = gol razlika · Bod = bodovi (3 za pobjedu, 1 za remi)</p>`;
  }, { live: true });
}
