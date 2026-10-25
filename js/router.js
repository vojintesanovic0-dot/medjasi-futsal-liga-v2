import { esc, loading } from './util.js';

const routes = [];
let token = 0;
let cleanups = [];
let liveOn = false;

export function route(pattern, handler, opts = {}) {
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$');
  routes.push({ re, handler, live: !!opts.live });
}
export function onLeave(fn) { cleanups.push(fn); }
export function currentPath() {
  return (location.hash.replace(/^#/, '') || '/').split('?')[0];
}
export async function render(opts = {}) {
  const my = ++token;
  cleanups.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  cleanups = [];
  const path = currentPath();
  const app = document.getElementById('app');
  const current = () => my === token;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const key = a.dataset.nav;
    const active = key === '/' ? path === '/' : path.startsWith('/' + key);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.getElementById('nav')?.classList.remove('open');
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    liveOn = r.live;
    if (!opts.keepScroll) { app.innerHTML = loading(); window.scrollTo(0, 0); }
    const params = m.slice(1).map((v) => (v === undefined ? undefined : decodeURIComponent(v)));
    try {
      await r.handler({ app, current, onLeave, params }, ...params);
    } catch (e) {
      if (current()) app.innerHTML = `<div class="card error">Greška pri učitavanju: ${esc(e.message || e)}</div>`;
    }
    return;
  }
  app.innerHTML = '<div class="card">Stranica nije pronađena. <a href="#/">Na početnu</a></div>';
}
let refreshTimer = null;
export function liveRefresh() {
  if (!liveOn) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => render({ keepScroll: true }), 300);
}