import { getGallery, uploadMedia, addGalleryItem, deleteGalleryItem } from '../api.js';
import { state, isStaff } from '../state.js';
import { esc, empty, safeUrl, toast, errMsg } from '../util.js';
import { render } from '../router.js';

const MAX_BYTES = 15 * 1024 * 1024;
function item(g) {
  const url = safeUrl(g.media_url);
  if (!url) return '';
  const del = isStaff() ? `<button class="btn btn-ghost btn-sm g-del" data-del="${esc(g.id)}" aria-label="Obriši"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button>` : '';
  const media = g.media_type === 'video' ? `<video src="${esc(url)}" controls preload="metadata"></video>` : `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="${esc(g.title || 'Fotografija')}" loading="lazy"></a>`;
  return `<figure data-id="${esc(g.id)}" data-album="${esc(g.album || '')}">${media}${g.title || del ? `<figcaption><span>${esc(g.title || '')}</span>${del}</figcaption>` : ''}</figure>`;
}
export function registerGallery(route) {
  route('/galerija', async (ctx) => {
    const items = await getGallery();
    if (!ctx.current()) return;
    const albums = [...new Set(items.map((g) => g.album).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bs'));
    const upload = isStaff() ? `<form id="g-form" class="card form narrow" style="margin-bottom:16px"><label>Naslov (opcionalno)<input name="title" maxlength="120"></label><label>Album (opcionalno)<input name="album" list="g-albums-list" maxlength="60" placeholder="npr. Finale 2026"></label><label>Fotografija ili video (do 15 MB)<input type="file" name="file" accept="image/*,video/mp4,video/webm" required></label><button class="btn btn-primary" type="submit">Dodaj u galeriju</button></form>` : '';
    const chips = albums.length ? `<div class="g-albums" id="g-albums" aria-label="Filter albuma"><button class="btn btn-sm on" data-album="" type="button">Sve</button>${albums.map((a) => `<button class="btn btn-sm" data-album="${esc(a)}" type="button">${esc(a)}</button>`).join('')}</div>` : '';
    const datalist = `<datalist id="g-albums-list">${albums.map((a) => `<option value="${esc(a)}">`).join('')}</datalist>`;
    ctx.app.innerHTML = `<div class="page-head"><h1>Galerija</h1></div>${upload}${datalist}${chips}${items.length ? `<div class="gallery" id="g-grid">${items.map(item).join('')}</div>` : empty('Galerija je prazna.')}`;
    ctx.app.querySelector('#g-albums')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-album]'); if (!btn) return;
      ctx.app.querySelectorAll('#g-albums [data-album]').forEach((b) => b.classList.toggle('on', b === btn));
      ctx.app.querySelectorAll('#g-grid figure').forEach((figure) => {
        figure.hidden = btn.dataset.album !== '' && figure.dataset.album !== btn.dataset.album;
      });
    });
    ctx.app.querySelector('#g-form')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const form = e.target; const file = form.file.files[0]; if (!file) return;
      const isVideo = file.type.startsWith('video/');
      if (!isVideo && !file.type.startsWith('image/')) { toast('Dozvoljene su slike i video.', 'err'); return; }
      if (file.size > MAX_BYTES) { toast('Fajl je veći od 15 MB.', 'err'); return; }
      const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Učitavam…';
      try {
        const url = await uploadMedia(file, 'galerija');
        await addGalleryItem({ title: form.title.value.trim() || null, album: form.album.value.trim() || null, media_url: url, media_type: isVideo ? 'video' : 'image', uploaded_by: state.session.user.id });
        toast('Dodano u galeriju.'); await render({ keepScroll: true });
      } catch (err) { toast(errMsg(err), 'err'); btn.disabled = false; btn.textContent = 'Dodaj u galeriju'; }
    });
    ctx.app.querySelector('#g-grid')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del]'); if (!btn || !confirm('Obrisati stavku iz galerije?')) return;
      try { await deleteGalleryItem(btn.dataset.del); btn.closest('figure').remove(); toast('Obrisano.'); } catch (err) { toast(errMsg(err), 'err'); }
    });
  });
}
