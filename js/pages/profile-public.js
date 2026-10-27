import { sb } from '../supabase.js';
import { esc, safeUrl, empty } from '../util.js';

export function registerPublicProfile(route) {
  route('/fan/:username', async (ctx, username) => {
    const clean = String(username || '').trim().toLowerCase();
    const {data:profile,error} = await sb.from('profiles').select('id,username,display_name,avatar_url,bio,created_at').eq('username',clean).maybeSingle();
    if (!ctx.current()) return;
    if (error) throw error;
    if (!profile) { ctx.app.innerHTML=empty('Profil nije pronađen.'); return; }
    const avatar=safeUrl(profile.avatar_url);
    ctx.app.innerHTML=`<div class="page-head"><h1>Profil navijača</h1></div><section class="card player-hero">
      ${avatar ? `<img class="player-photo" src="${esc(avatar)}" alt="" loading="lazy">` : '<div class="player-photo player-noimg" aria-hidden="true">MF</div>'}
      <div><h2>${esc(profile.display_name || profile.username)}</h2><p class="muted">@${esc(profile.username)}</p><p>${esc(profile.bio || 'Nema opisa profila.')}</p></div>
      </section>`;
  });
}
