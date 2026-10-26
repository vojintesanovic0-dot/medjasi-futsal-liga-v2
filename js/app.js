import { sb } from './supabase.js';
import { state, initAuth, onAuthChange } from './state.js';
import { route, render, liveRefresh } from './router.js';
import { toast, mmss } from './util.js';
import { renderNavUser } from './pages/auth.js';
import { registerHome } from './pages/home.js';
import { registerStandings } from './pages/standings.js';
import { registerMatches } from './pages/matches.js';
import { registerTeams } from './pages/teams.js';
import { registerNews } from './pages/news.js';
import { registerGallery } from './pages/gallery.js';
import { registerChat } from './pages/chat.js';
import { registerAuth } from './pages/auth.js';
import { registerAdmin } from './pages/admin.js';
import { registerFan } from './pages/fan.js';
import { registerCommunity } from './pages/community.js';
import { registerStats } from './pages/stats.js';
import { registerSW } from './push.js';

registerHome(route);
registerStandings(route);
registerMatches(route);
registerTeams(route);
registerNews(route);
registerGallery(route);
registerChat(route);
registerAuth(route);
registerAdmin(route);
registerFan(route);
registerCommunity(route);
registerStats(route);
registerSW();

// Sat uživo: jedan interval za sve elemente na stranici
setInterval(() => {
  document.querySelectorAll('[data-clock]').forEach((el) => {
    const base = Number(el.dataset.base) || 0;
    const started = el.dataset.start ? Date.parse(el.dataset.start) : null;
    const running = el.dataset.live === '1' && started;
    const s = base + (running ? (Date.now() - started) / 1000 : 0);
    el.textContent = mmss(Math.min(s, Number(el.dataset.limit) || 1200));
  });
}, 1000);

// Realtime: promjene utakmica, događaja i vijesti osvježavaju live stranice
sb.channel('liga-public')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, liveRefresh)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events' }, liveRefresh)
  .subscribe();

async function boot() {
  await initAuth();
  renderNavUser();
  onAuthChange((_st, event) => {
    renderNavUser();
    if (event === 'PASSWORD_RECOVERY' && location.hash !== '#/nova-lozinka') {
      location.hash = '#/nova-lozinka';
      return;
    }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') render();
  });
  window.addEventListener('hashchange', render);
  document.getElementById('nav-toggle')?.addEventListener('click', () =>
    document.getElementById('nav').classList.toggle('open'));
  await render();
}

boot().catch((e) => {
  document.getElementById('app').innerHTML = `<div class="card error">Ne mogu da se povežem na bazu: ${e.message}</div>`;
  toast('Provjeri podešavanje u js/config.js', 'err');
});