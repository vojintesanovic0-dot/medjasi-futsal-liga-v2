// Stranica jednog kola: rezultati, strijelci, kartoni i najbolji igrač kola.
import { getActiveSeason, getMatches, getRoundStats } from '../api.js';
import { esc, empty } from '../util.js';

const isObj = (value) => value && typeof value === 'object' && !Array.isArray(value);
const scoreLabel = (match) => match.status === 'scheduled'
  ? 'vs'
  : `${match.home_score ?? 0} : ${match.away_score ?? 0}`;

export function roundTabHtml(rounds) {
  if (!rounds.length) return empty('Još nema kola sa utakmicama.');
  return `<div class="filters" aria-label="Odaberi kolo">${rounds.map((round) =>
    `<a class="chip" href="#/kolo/${round}">${round}. kolo</a>`).join('')}</div>`;
}

export function registerRound(route) {
  route('/kolo/:n', async (ctx, n) => {
    const round = Number(n);
    if (!Number.isInteger(round) || round < 1 || round > 99) {
      ctx.app.innerHTML = empty('Neispravno kolo.');
      return;
    }

    try {
      const season = await getActiveSeason();
      if (!season) { ctx.app.innerHTML = empty('Nema aktivne sezone.'); return; }
      const [matches, raw] = await Promise.all([
        getMatches(season.id),
        getRoundStats(season.id, round),
      ]);
      if (!ctx.current()) return;

      const rounds = [...new Set(matches.map((match) => Number(match.round)).filter(Number.isInteger))]
        .sort((a, b) => a - b);
      if (!rounds.includes(round)) {
        ctx.app.innerHTML = `<a class="back" href="#/statistika">← Statistika</a>${empty('Ovo kolo još nema utakmica.')}${roundTabHtml(rounds)}`;
        return;
      }

      const data = isObj(raw) ? raw : {};
      const roundMatches = Array.isArray(data.matches) ? data.matches : [];
      const players = Array.isArray(data.players) ? data.players : [];
      const best = isObj(data.best) ? data.best : null;
      const scorers = players.filter((player) => Number(player.goals) > 0)
        .sort((a, b) => Number(b.goals) - Number(a.goals) || String(a.name).localeCompare(String(b.name)));
      const cards = players.filter((player) => Number(player.yellow) > 0 || Number(player.red) > 0)
        .sort((a, b) => Number(b.red) - Number(a.red) || Number(b.yellow) - Number(a.yellow) || String(a.name).localeCompare(String(b.name)));
      const previous = rounds[rounds.indexOf(round) - 1] ?? null;
      const next = rounds[rounds.indexOf(round) + 1] ?? null;

      ctx.app.innerHTML = `
        <a class="back" href="#/statistika">← Statistika</a>
        <div class="page-head"><h1>${round}. kolo</h1><div class="row-actions">
          ${previous ? `<a class="btn btn-ghost btn-xs" href="#/kolo/${previous}">← ${previous}. kolo</a>` : ''}
          ${next ? `<a class="btn btn-ghost btn-xs" href="#/kolo/${next}">${next}. kolo →</a>` : ''}
        </div></div>
        <section class="block"><h2>Rezultati</h2>
          ${roundMatches.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th class="left">Domaćin</th><th>Rezultat</th><th class="left">Gost</th><th>Status</th></tr></thead><tbody>
            ${roundMatches.map((match) => `<tr><td class="left">${esc(match.home)}</td><td class="pts">${esc(scoreLabel(match))}</td><td class="left">${esc(match.away)}</td>
              <td>${match.status === 'finished' ? 'Završena' : match.status === 'live' ? 'Uživo' : match.status === 'paused' ? 'Pauza' : 'Zakazana'}</td></tr>`).join('')}
          </tbody></table></div>` : empty('Nema utakmica u ovom kolu.')}
        </section>
        <section class="block"><h2>Najbolji igrač kola</h2>
          ${best ? `<p><strong>${esc(best.name)}</strong> · ${esc(best.team)} <span class="muted">· golovi ${best.goals}, asistencije ${best.assists}, crveni ${best.red}, bodovi ${best.score}</span></p>`
            : empty('Još nema događaja za izbor najboljeg igrača.')}
          <p class="muted small">Bodovanje: gol 2, asistencija 1, crveni karton −2. Pri izjednačenju prednost ima igrač sa manje crvenih i žutih kartona.</p>
        </section>
        <section class="block"><h2>Strijelci</h2>
          ${scorers.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th class="left">Igrač</th><th class="left">Ekipa</th><th>Golovi</th></tr></thead><tbody>
            ${scorers.map((player, index) => `<tr><td class="pos">${index + 1}</td><td class="left">${esc(player.name)}</td><td class="left">${esc(player.team)}</td><td class="pts">${player.goals}</td></tr>`).join('')}
          </tbody></table></div>` : empty('Nema golova u ovom kolu.')}
        </section>
        <section class="block"><h2>Kartoni</h2>
          ${cards.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th class="left">Igrač</th><th class="left">Ekipa</th><th>🟨</th><th>🟥</th></tr></thead><tbody>
            ${cards.map((player) => `<tr><td class="left">${esc(player.name)}</td><td class="left">${esc(player.team)}</td><td>${player.yellow}</td><td>${player.red}</td></tr>`).join('')}
          </tbody></table></div>` : empty('Nema kartona u ovom kolu.')}
        </section>
        <section class="block"><h2>Ostala kola</h2>${roundTabHtml(rounds)}</section>`;
    } catch (error) {
      if (!ctx.current()) return;
      ctx.app.innerHTML = empty('Statistiku kola trenutno nije moguće učitati. Pokušaj ponovo kasnije.');
    }
  });
}
