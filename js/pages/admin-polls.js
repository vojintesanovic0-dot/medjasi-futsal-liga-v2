import { sb } from '../supabase.js';
import { getAllPolls } from '../api.js';
import { esc, toast, errMsg, empty, fromLocalInput } from '../util.js';
import { state } from '../state.js';

export async function sectionPolls(ctx, body) {
  const polls = await getAllPolls();
  if (!ctx.current()) return;
  body.innerHTML = `<section class="card"><h2>Ankete u zajednici</h2>
    <form id="poll-form" class="form">
      <label>Pitanje<input name="question" required minlength="3" maxlength="200" placeholder="Npr. Koji tim ide dalje?"></label>
      <label>Opcije (jedna po liniji, 2–8)<textarea name="options" rows="4" required></textarea></label>
      <label>Zatvara se (opciono)<input name="closes_at" type="datetime-local"></label>
      <button class="btn btn-primary" type="submit">Objavi anketu</button>
    </form></section>
    ${polls.length ? polls.map((p) => `<article class="card poll-admin" data-id="${esc(p.id)}">
      <header class="ma-head"><strong>${esc(p.question)}</strong><span class="muted small">${p.active ? 'aktivna' : 'skrivena'}${p.closes_at ? ` · zatvara se ${esc(new Date(p.closes_at).toLocaleString('bs-BA'))}` : ''}</span></header>
      <p class="small muted">${[...(p.options || [])].sort((a, b) => a.position - b.position).map((o) => esc(o.label)).join(' · ')}</p>
      <div class="ma-actions"><button class="btn btn-sm" data-act="toggle" type="button">${p.active ? 'Sakrij' : 'Prikaži'}</button><button class="btn btn-sm btn-ghost" data-act="del" type="button">Obriši</button></div>
    </article>`).join('') : empty('Nema anketa.')}`;
  body.querySelector('#poll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const question = String(f.get('question') || '').trim();
    const labels = String(f.get('options') || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (question.length < 3 || question.length > 200) return toast('Pitanje mora imati 3–200 znakova.', 'err');
    if (labels.length < 2 || labels.length > 8) return toast('Unesi između 2 i 8 opcija.', 'err');
    if (labels.some((l) => l.length > 80)) return toast('Opcija može imati najviše 80 znakova.', 'err');
    if (new Set(labels.map((l) => l.toLocaleLowerCase())).size !== labels.length) return toast('Opcije moraju biti različite.', 'err');
    const submit = e.currentTarget.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const closes = String(f.get('closes_at') || '');
      const { data: poll, error } = await sb.from('polls').insert({
        question, closes_at: closes ? fromLocalInput(closes) : null, active: true, created_by: state.session?.user?.id || null,
      }).select('id').single();
      if (error) throw error;
      const { error: optError } = await sb.from('poll_options').insert(labels.map((label, i) => ({ poll_id: poll.id, label, position: i + 1 })));
      if (optError) {
        await sb.from('polls').delete().eq('id', poll.id);
        throw optError;
      }
      toast('Anketa je objavljena.');
      await sectionPolls(ctx, body);
    } catch (error) { toast(errMsg(error), 'err'); }
    finally { submit.disabled = false; }
  });
  body.querySelectorAll('.poll-admin').forEach((card) => {
    const p = polls.find((x) => x.id === card.dataset.id);
    card.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (btn.dataset.act === 'toggle') {
          const { error } = await sb.from('polls').update({ active: !p.active }).eq('id', p.id); if (error) throw error;
        } else if (btn.dataset.act === 'del') {
          if (!confirm(`Obrisati anketu „${p.question}“ i sve glasove?`)) return;
          const { error } = await sb.from('polls').delete().eq('id', p.id); if (error) throw error;
        }
        await sectionPolls(ctx, body);
      } catch (error) { toast(errMsg(error), 'err'); }
      finally { btn.disabled = false; }
    }));
  });
}
