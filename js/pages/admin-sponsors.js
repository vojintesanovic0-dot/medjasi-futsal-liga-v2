import { getAllSponsors, addSponsor, updateSponsor, deleteSponsor } from '../api.js';
import { esc, toast, errMsg, empty } from '../util.js';

const isHttps = (value) => !value || /^https:\/\//i.test(value);

// Admin section for managing league partners.
export async function sectionSponsors(ctx, body) {
  const list = await getAllSponsors();
  if (!ctx.current()) return;
  body.innerHTML = `<section class="card"><h2>Partneri lige</h2>
      <form id="sp-form" class="form grid-form">
        <label>Naziv<input name="name" required minlength="2" maxlength="80"></label>
        <label>Link do logotipa (https)<input name="logo_url" type="url" placeholder="https://…"></label>
        <label>Web stranica (https)<input name="website_url" type="url" placeholder="https://…"></label>
        <label>Redoslijed<input name="sort_order" type="number" value="0" min="0" max="999"></label>
        <button class="btn btn-primary" type="submit">Dodaj partnera</button>
      </form>
      <p class="muted small">Logo mora biti javno dostupan preko HTTPS linka. Partneri se prikazuju na početnoj stranici.</p>
    </section>
    ${list.length ? list.map((s) => `<article class="card sp-admin" data-id="${esc(s.id)}">
        <header class="ma-head"><strong>${esc(s.name)}</strong> <span class="muted small">redoslijed ${Number(s.sort_order) || 0} · ${s.active ? 'aktivan' : 'skriven'}</span></header>
        ${s.website_url && isHttps(s.website_url) ? `<p class="small"><a href="${esc(s.website_url)}" target="_blank" rel="noopener noreferrer">${esc(s.website_url)}</a></p>` : ''}
        <div class="ma-actions">
          <button class="btn btn-sm" data-act="toggle" type="button">${s.active ? 'Sakrij' : 'Prikaži'}</button>
          <button class="btn btn-sm btn-ghost" data-act="del" type="button">Obriši</button>
        </div></article>`).join('') : empty('Još nema partnera.')}`;

  body.querySelector('#sp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const logo = String(f.get('logo_url') || '').trim();
    const site = String(f.get('website_url') || '').trim();
    if (!isHttps(logo) || !isHttps(site)) return toast('Linkovi moraju počinjati s https://', 'err');
    try {
      await addSponsor({
        name: String(f.get('name') || '').trim(), logo_url: logo || null, website_url: site || null,
        sort_order: Math.max(0, Number(f.get('sort_order')) || 0), active: true,
      });
      toast('Partner dodan.');
      await sectionSponsors(ctx, body);
    } catch (error) { toast(errMsg(error), 'err'); }
  });

  body.querySelectorAll('.sp-admin').forEach((card) => {
    const s = list.find((x) => x.id === card.dataset.id);
    card.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        if (btn.dataset.act === 'toggle') await updateSponsor(s.id, { active: !s.active });
        if (btn.dataset.act === 'del') {
          if (!confirm(`Obrisati partnera „${s.name}“?`)) return;
          await deleteSponsor(s.id);
        }
        await sectionSponsors(ctx, body);
      } catch (error) { toast(errMsg(error), 'err'); }
    }));
  });
}
