import { sb } from '../supabase.js';
import { getTeams } from '../api.js';
import { esc, toast, errMsg } from '../util.js';

// Admin i urednici: slanje push obavještenja svima ili pratiocima jedne ekipe.
export async function sectionPush(ctx, body) {
  const teams = await getTeams();
  if (!ctx.current()) return;
  body.innerHTML = `<section class="card"><h2>Push obavještenja</h2>
      <form id="push-form" class="form">
        <label>Naslov<input name="title" required maxlength="80" placeholder="Npr. Počinje utakmica"></label>
        <label>Tekst<textarea name="body" rows="3" maxlength="200" required></textarea></label>
        <label>Link unutar aplikacije<input name="url" value="#/" maxlength="200"></label>
        <label>Ciljna grupa<select name="teamId"><option value="">Svi koji primaju obavještenja</option>${teams.map((t) => `<option value="${esc(t.id)}">Pratioci: ${esc(t.name)}</option>`).join('')}</select></label>
        <p class="muted small">Uređaji podešeni na „samo omiljene ekipe“ dobijaju poruku samo kad je izabrana ekipa koju prate. Bez izbora ekipe ne primaju ništa.</p>
        <button class="btn btn-primary" type="submit">Pošalji</button><p id="push-status" class="small" role="status" aria-live="polite"></p>
      </form></section>`;
  body.querySelector('#push-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
    const payload = { title: String(f.get('title')).trim(), body: String(f.get('body')).trim(), url: String(f.get('url') || '#/').trim() };
    const teamId = String(f.get('teamId') || ''); if (teamId) payload.teamId = teamId;
    if (!confirm(`Poslati obavještenje ${teamId ? 'pratiocima izabrane ekipe' : 'svim primateljima'}?`)) return;
    const status = body.querySelector('#push-status'); const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; status.textContent = 'Slanje…';
    try {
      const { data, error } = await sb.functions.invoke('send-push', { body: payload }); if (error) throw error;
      status.textContent = `Poslano: ${data.sent} od ${data.total} uređaja${data.removed ? `, uklonjeno neaktivnih: ${data.removed}` : ''}.`; toast('Obavještenje je poslato.');
    } catch (error) { status.textContent = errMsg(error); toast('Slanje nije uspjelo.', 'err'); }
    finally { btn.disabled = false; }
  });
}
