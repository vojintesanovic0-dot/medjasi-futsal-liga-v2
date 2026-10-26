import { sb } from '../supabase.js';
import { state } from '../state.js';
import { getAllNews, uploadMedia } from '../api.js';
import { esc, toast, errMsg, slugify, toLocalInput, fromLocalInput } from '../util.js';

const toastErr = (e) => toast(errMsg(e), 'err');
const MAX_COVER_BYTES = 10 * 1024 * 1024;

// Vijesti: naslovna slika s uređaja i zakazivanje objave.
export async function sectionNews2(ctx, body) {
  const news = await getAllNews();
  if (!ctx.current()) return;

  const draw = (n = {}) => {
    const publishValue = n.published_at && new Date(n.published_at) > new Date()
      ? toLocalInput(n.published_at) : '';
    return `<form id="news-form" class="card form" data-id="${esc(n.id || '')}">
      <h3>${n.id ? 'Izmijeni vijest' : 'Nova vijest'}</h3>
      <label>Naslov<input name="title" required maxlength="160" value="${esc(n.title || '')}"></label>
      <label>Kratki opis<input name="excerpt" maxlength="240" value="${esc(n.excerpt || '')}"></label>
      <label>Tekst<textarea name="body" rows="8" required>${esc(n.body || '')}</textarea></label>
      <label>Naslovna slika (URL)<input name="cover_url" type="url" value="${esc(n.cover_url || '')}"></label>
      <label>ili upload slike s uređaja<input name="cover_file" type="file" accept="image/*"></label>
      <p class="muted small">${n.cover_url ? 'Trenutna naslovna slika je sačuvana ako ne izabereš novu.' : 'Slika nije obavezna. Najveća veličina: 10 MB.'}</p>
      <label>Zakaži objavu (prazno = odmah / postojeći datum ostaje)<input name="publish_at" type="datetime-local" value="${esc(publishValue)}"></label>
      <label class="check"><input name="published" type="checkbox" ${n.published ? 'checked' : ''}> Objavljeno (ili zakazano)</label>
      <div class="row-gap"><button class="btn btn-primary" type="submit">Sačuvaj</button>
        ${n.id ? '<button class="btn btn-ghost" type="button" id="news-new">Nova vijest</button>' : ''}</div>
    </form>`;
  };

  const drawList = () => `<div class="two-col-admin"><div>${draw()}</div>
    <div class="card"><h3>Sve vijesti</h3><ul class="plain">${news.map((n) => {
      const scheduled = n.published && n.published_at && new Date(n.published_at) > new Date();
      const label = !n.published ? 'skica' : scheduled ? 'zakazana' : 'objavljena';
      return `<li><button class="link" data-edit="${esc(n.id)}">${esc(n.title)}</button>
        <span class="pill ${label === 'objavljena' ? 'pill-finished' : ''}">${label}</span></li>`;
    }).join('') || '<li class="muted">Nema vijesti.</li>'}</ul></div></div>`;
  body.innerHTML = drawList();

  const bind = () => {
    const form = body.querySelector('#news-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentForm = e.currentTarget;
      const f = new FormData(currentForm);
      const id = currentForm.dataset.id;
      const original = news.find((x) => x.id === id);
      const btn = currentForm.querySelector('button[type="submit"]');
      const file = f.get('cover_file');
      btn.disabled = true;

      try {
        let cover = String(f.get('cover_url') || '').trim() || null;
        if (file instanceof File && file.size > 0) {
          if (!file.type.startsWith('image/')) throw new Error('Odabrani fajl nije slika.');
          if (file.size > MAX_COVER_BYTES) throw new Error('Naslovna slika može imati najviše 10 MB.');
          cover = await uploadMedia(file, 'vijesti');
        } else if (!cover && original?.cover_url) {
          cover = original.cover_url;
        }

        const publishAt = String(f.get('publish_at') || '');
        const published = f.get('published') === 'on';
        const row = {
          title: String(f.get('title') || '').trim(),
          excerpt: String(f.get('excerpt') || '').trim() || null,
          body: String(f.get('body') || '').trim(),
          cover_url: cover,
          published,
          updated_at: new Date().toISOString(),
        };

        if (publishAt) {
          const at = new Date(publishAt);
          if (Number.isNaN(at.getTime())) throw new Error('Datum objave nije ispravan.');
          row.published_at = fromLocalInput(publishAt);
        } else if (published && (!original?.published_at || new Date(original.published_at) > new Date())) {
          row.published_at = new Date().toISOString();
        }

        if (id) {
          const { error } = await sb.from('news').update(row).eq('id', id);
          if (error) throw error;
        } else {
          row.slug = `${slugify(row.title)}-${Date.now().toString(36)}`;
          row.author_id = state.session.user.id;
          if (published && !row.published_at) row.published_at = new Date().toISOString();
          const { error } = await sb.from('news').insert(row);
          if (error) throw error;
        }

        toast('Vijest sačuvana.');
        await sectionNews2(ctx, body);
      } catch (err) {
        toastErr(err);
        if (btn.isConnected) btn.disabled = false;
      }
    });

    body.querySelector('#news-new')?.addEventListener('click', () => sectionNews2(ctx, body));
  };

  bind();
  body.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
    const item = news.find((x) => x.id === btn.dataset.edit);
    const currentForm = body.querySelector('#news-form');
    if (!item || !currentForm) return;
    currentForm.outerHTML = draw(item);
    bind();
  }));
}
