import { getPublishedNews, getNewsBySlug } from '../api.js';
import { esc, fmtLong, empty } from '../util.js';

export function registerNews(route) {
  route('/vijesti', async (ctx) => {
    const news = await getPublishedNews(100);
    if (!ctx.current()) return;
    ctx.app.innerHTML = `<div class="page-head"><h1>Vijesti</h1></div>${news.length ? `<div class="news-grid">${news.map((n) => `<a class="news-card" href="#/vijest/${esc(n.slug)}">${n.cover_url ? `<img src="${esc(n.cover_url)}" alt="" loading="lazy">` : '<div class="news-noimg"></div>'}<div class="nc-body"><span class="muted">${fmtLong(n.published_at || n.created_at)}</span><h3>${esc(n.title)}</h3><p>${esc(n.excerpt || '')}</p></div></a>`).join('')}</div>` : empty('Još nema vijesti.')}`;
  });
  route('/vijest/:slug', async (ctx, slug) => {
    const n = await getNewsBySlug(slug);
    if (!ctx.current()) return;
    if (!n) { ctx.app.innerHTML = empty('Vijest nije pronađena.'); return; }
    const paras = String(n.body || '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    ctx.app.innerHTML = `<a class="back" href="#/vijesti">← Sve vijesti</a><article class="article">${n.cover_url ? `<img class="cover" src="${esc(n.cover_url)}" alt="">` : ''}<p class="muted">${fmtLong(n.published_at || n.created_at)}</p><h1>${esc(n.title)}</h1>${n.excerpt ? `<p class="lead">${esc(n.excerpt)}</p>` : ''}<div class="body">${paras}</div></article>`;
  });
}
