import { getActiveSeason, getMatches, getStandings, getPlayerStats } from '../api.js';
import { esc, toast, errMsg, empty } from '../util.js';
import { renderTemplate, TEMPLATES } from '../graphics.js';
import { toBlob } from '../share.js';

export async function sectionGraphics(ctx, body) {
  const season = await getActiveSeason();
  if (!ctx.current()) return;
  if (!season) { body.innerHTML = empty('Prvo aktiviraj sezonu.'); return; }
  const [matches, standings, stats] = await Promise.all([getMatches(season.id), getStandings(), getPlayerStats()]);
  if (!ctx.current()) return;

  body.innerHTML = `<div class="card form narrow"><h3>Grafike</h3>
    <label>Šablon<select id="gr-tpl">${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
    <label>Podatak<select id="gr-item"></select></label>
    <div class="row-actions"><button class="btn btn-primary" id="gr-dl" type="button">Preuzmi PNG</button><button class="btn btn-ghost" id="gr-share" type="button">Podijeli</button></div>
    <div id="gr-out" class="gr-preview"></div></div>`;
  const tpl = body.querySelector('#gr-tpl'), item = body.querySelector('#gr-item'), out = body.querySelector('#gr-out');
  let canvas = null;
  const options = () => {
    if (tpl.value === 'match') return matches.map((m) => [m.id, `${m.round}. kolo: ${m.home?.name} – ${m.away?.name}`]);
    if (tpl.value === 'igrac') return stats.map((p) => [p.player_id, `${p.first_name} ${p.last_name} (${p.team_name})`]);
    return [['tabela', 'Tabela sezone']];
  };
  const dataFor = () => tpl.value === 'match' ? matches.find((m) => m.id === item.value)
    : tpl.value === 'igrac' ? stats.find((p) => p.player_id === item.value) : standings;
  const render = () => {
    const data = dataFor();
    if (!data && tpl.value !== 'tabela') { canvas = null; out.innerHTML = empty('Nema podataka.'); return; }
    try { canvas = renderTemplate(tpl.value, data); canvas.style.width = '100%'; out.replaceChildren(canvas); }
    catch (error) { canvas = null; out.textContent = errMsg(error); }
  };
  const fill = () => {
    item.innerHTML = options().map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    item.disabled = tpl.value === 'tabela';
    render();
  };
  tpl.addEventListener('change', fill); item.addEventListener('change', render); fill();
  body.querySelector('#gr-dl').addEventListener('click', async () => {
    if (!canvas) return;
    try {
      const blob = await toBlob(canvas), url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `medjasi-${tpl.value}.png` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (error) { toast(errMsg(error), 'err'); }
  });
  body.querySelector('#gr-share').addEventListener('click', async () => {
    if (!canvas) return;
    try {
      const file = new File([await toBlob(canvas)], `medjasi-${tpl.value}.png`, { type: 'image/png' });
      if (!navigator.canShare?.({ files: [file] })) return toast('Dijeljenje nije podržano na ovom uređaju. Koristi Preuzmi PNG.', 'err');
      await navigator.share({ files: [file], title: 'Međasi Futsal Liga' });
    } catch (error) { if (error?.name !== 'AbortError') toast(errMsg(error), 'err'); }
  });
}
