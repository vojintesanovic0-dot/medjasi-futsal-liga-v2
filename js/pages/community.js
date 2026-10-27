import { sb } from '../supabase.js';
import { state, isStaff } from '../state.js';
import { esc, toast, errMsg, empty, fmtLong, safeUrl } from '../util.js';
import { onLeave } from '../router.js';
import { getFeed, getMyLikes, getComments, createPost, addComment, likePost, unlikePost, deletePost, uploadMedia } from '../api.js';

const PAGE = 20;
const MAX_IMG = 10 * 1024 * 1024;
const fmtTime = (iso) => new Date(iso).toLocaleString('bs-BA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function postHtml(p, likedSet) {
  const uid = state.session?.user?.id;
  const img = safeUrl(p.image_url);
  const liked = likedSet.has(p.id);
  const canDelete = uid && (uid === p.user_id || isStaff());
  return `<article class="post card" data-post="${esc(p.id)}"><header class="post-head"><span class="avatar-link sm">${esc((p.username || '?').slice(0, 2).toUpperCase())}</span><div><strong>${esc(p.display_name || p.username)}</strong> <span class="muted small">@${esc(p.username)} · ${esc(fmtTime(p.created_at))}</span></div>${canDelete ? `<button class="btn btn-ghost btn-sm post-del" data-del="${esc(p.id)}" aria-label="Obriši objavu"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button>` : ''}</header><p class="post-body">${esc(p.content).replace(/\n/g, '<br>')}</p>${img ? `<img class="post-img" src="${esc(img)}" alt="" loading="lazy">` : ''}<footer class="post-actions"><button class="btn btn-ghost btn-sm like-btn ${liked ? 'on' : ''}" data-like="${esc(p.id)}" aria-pressed="${liked}" ${uid ? '' : 'disabled title="Prijavi se da lajkuješ"'}>♥ <span>${p.likes}</span></button><button class="btn btn-ghost btn-sm" data-toggle-comments="${esc(p.id)}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/></svg><span data-comment-count>${p.comments}</span></button>${uid ? `<button class="btn btn-ghost btn-sm" data-report="post:${esc(p.id)}" title="Prijavi objavu" aria-label="Prijavi objavu">⚑</button>` : ''}</footer><div class="comments" data-comments="${esc(p.id)}" hidden></div></article>`;
}
async function reportItem(key, uid) {
  if (!uid) { toast('Prijavi se da prijaviš sadržaj.', 'err'); return; }
  const [type, id] = key.split(':');
  if (!['post', 'comment'].includes(type) || !id) return;
  const reason = prompt('Razlog prijave (npr. uvreda, spam, neprimjereno):');
  if (!reason || reason.trim().length < 3) return;
  const { error } = await sb.from('reports').insert({
    reporter_id: uid, target_type: type, target_id: id, reason: reason.trim().slice(0, 300),
  });
  if (error) {
    toast(error.code === '23505' ? 'Već si prijavio/la ovaj sadržaj.' : errMsg(error), 'err');
    return;
  }
  toast('Hvala, prijava je poslana moderatorima.');
}

export function registerCommunity(route) {
  route('/zajednica', async (ctx) => {
    const uid = state.session?.user?.id;
    let likedSet = new Set(); let feed = await getFeed(PAGE);
    if (uid) likedSet = new Set((await getMyLikes(uid)).map((r) => r.post_id));
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Zajednica</h1><p class="muted">Objave, komentari i lajkovi navijača.</p></div>${uid ? `<form id="composer" class="card composer"><textarea name="content" maxlength="1000" rows="3" required placeholder="Šta se dešava u ligi?"></textarea><div class="composer-row"><label class="btn btn-ghost btn-sm file-btn"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 15-5-5L5 19"/></svg> Slika<input type="file" name="image" accept="image/*" hidden></label><span class="muted small" id="file-name"></span><button class="btn btn-primary" type="submit">Objavi</button></div></form>` : `<div class="card"><a href="#/prijava">Prijavi se</a> da objavljuješ i komentarišeš.</div>`}<div id="feed">${feed.length ? feed.map((p) => postHtml(p, likedSet)).join('') : empty('Još nema objava. Budi prvi!')}</div><div class="more-row"><button class="btn" id="more" ${feed.length < PAGE ? 'hidden' : ''}>Učitaj još</button></div>`;
    const feedEl = ctx.app.querySelector('#feed');
    feedEl.addEventListener('click', async (e) => {
      const like = e.target.closest('[data-like]'); const tog = e.target.closest('[data-toggle-comments]'); const del = e.target.closest('[data-del]'); const rep = e.target.closest('[data-report]');
      if (like && uid) {
        const id = like.dataset.like; const on = likedSet.has(id); like.disabled = true;
        try { if (on) { await unlikePost(uid, id); likedSet.delete(id); } else { await likePost(uid, id); likedSet.add(id); }
          const span = like.querySelector('span'); span.textContent = Math.max(0, Number(span.textContent) + (on ? -1 : 1));
          like.classList.toggle('on', !on); like.setAttribute('aria-pressed', String(!on));
        } catch (err) { toast(errMsg(err), 'err'); } like.disabled = false;
      } else if (rep) { await reportItem(rep.dataset.report, uid); }
      else if (tog) { await toggleComments(tog.dataset.toggleComments, uid); }
      else if (del) { if (!confirm('Obrisati objavu?')) return; try { await deletePost(del.dataset.del); document.querySelector(`[data-post="${del.dataset.del}"]`)?.remove(); toast('Objava obrisana.'); } catch (err) { toast(errMsg(err), 'err'); } }
    });
    async function toggleComments(postId, userId) {
      const box = feedEl.querySelector(`[data-comments="${postId}"]`); if (!box) return;
      box.hidden = !box.hidden; if (box.hidden || box.dataset.loaded) return;
      const list = await getComments(postId); box.dataset.loaded = '1';
      box.innerHTML = `${list.map((c) => `<div class="comment"><strong>${esc(c.username)}</strong><span class="muted small">${esc(fmtTime(c.created_at))}</span><p>${esc(c.content)}</p>${userId ? `<button class="link-btn small" data-report="comment:${esc(c.id)}">Prijavi</button>` : ''}</div>`).join('') || '<p class="muted small">Još nema komentara.</p>'}${userId ? `<form class="comment-form" data-post="${esc(postId)}"><input name="c" maxlength="500" required placeholder="Napiši komentar…" autocomplete="off"><button class="btn btn-sm btn-primary" type="submit">Pošalji</button></form>` : ''}`;
    }
    feedEl.addEventListener('submit', async (e) => {
      const form = e.target.closest('.comment-form'); if (!form || !uid) return; e.preventDefault();
      const content = form.c.value.trim(); if (!content) return; form.c.disabled = true;
      try { const c = await addComment(uid, form.dataset.post, content); const row = document.createElement('div'); row.className = 'comment';
        row.innerHTML = `<strong>${esc(c.username)}</strong> <span class="muted small">${esc(fmtTime(c.created_at))}</span><p>${esc(c.content)}</p>`; form.before(row); form.c.value = '';
        const countBtn = feedEl.querySelector(`[data-toggle-comments="${form.dataset.post}"]`); if (countBtn) { const count = countBtn.querySelector('[data-comment-count]'); if (count) count.textContent = String(Number(count.textContent) + 1); }
      } catch (err) { toast(errMsg(err), 'err'); } form.c.disabled = false;
    });
    const composer = ctx.app.querySelector('#composer');
    composer?.image.addEventListener('change', () => { const f = composer.image.files[0]; ctx.app.querySelector('#file-name').textContent = f ? f.name : ''; });
    composer?.addEventListener('submit', async (e) => {
      e.preventDefault(); const content = composer.content.value.trim(); const file = composer.image.files[0]; if (!content) return;
      if (file && (!file.type.startsWith('image/') || file.size > MAX_IMG)) { toast('Slika mora biti do 10 MB.', 'err'); return; }
      const btn = composer.querySelector('button[type=submit]'); btn.disabled = true;
      try { const imageUrl = file ? await uploadMedia(file, `posts/${uid}`) : null; const p = await createPost(uid, content, imageUrl);
        feedEl.querySelector('.empty')?.remove(); feedEl.insertAdjacentHTML('afterbegin', postHtml({ ...p, username: state.profile?.username, display_name: state.profile?.display_name, likes: 0, comments: 0 }, likedSet));
        composer.reset(); ctx.app.querySelector('#file-name').textContent = ''; toast('Objava dodana.');
      } catch (err) { toast(errMsg(err), 'err'); } btn.disabled = false;
    });
    ctx.app.querySelector('#more')?.addEventListener('click', async (e) => {
      const last = feedEl.querySelector('.post') ? feed[feed.length - 1] : null; if (!last) return;
      const btn = e.currentTarget; btn.disabled = true; const more = await getFeed(PAGE, last.created_at); feed = feed.concat(more);
      feedEl.insertAdjacentHTML('beforeend', more.map((p) => postHtml(p, likedSet)).join('')); btn.hidden = more.length < PAGE; btn.disabled = false;
    });
    let timer = null;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(async () => {
      if (!ctx.current() || !feedEl.isConnected) return; const fresh = await getFeed(PAGE); if (!ctx.current()) return;
      fresh.forEach((p) => { const card = feedEl.querySelector(`[data-post="${p.id}"]`); if (!card) return;
        card.querySelector('.like-btn span').textContent = p.likes; const cb = card.querySelector(`[data-toggle-comments="${p.id}"]`); if (cb) { const count = cb.querySelector('[data-comment-count]'); if (count) count.textContent = String(p.comments); } });
      const newOnes = fresh.filter((p) => !feedEl.querySelector(`[data-post="${p.id}"]`));
      if (newOnes.length) { feedEl.querySelector('.empty')?.remove(); feedEl.insertAdjacentHTML('afterbegin', newOnes.map((p) => postHtml(p, likedSet)).join('')); }
    }, 400); };
    const channel = sb.channel('community').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, refresh).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes' }, refresh).subscribe();
    onLeave(() => { clearTimeout(timer); sb.removeChannel(channel); });
  });
}
