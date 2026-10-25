import { sb } from '../supabase.js';
import { state, isStaff } from '../state.js';
import { esc, toast, errMsg } from '../util.js';
import { pushSupported, enablePush, disablePush, currentSubscription } from '../push.js';
import { VAPID_PUBLIC_KEY } from '../config.js';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function renderNavUser() {
  const box = document.getElementById('nav-user');
  if (!box) return;
  if (!state.session) box.innerHTML = '<a class="btn btn-sm" href="#/prijava">Prijava</a>';
  else box.innerHTML = `${isStaff() ? '<a class="btn btn-sm" href="#/admin">Admin</a>' : ''}<a class="avatar-link" href="#/profil" title="Moj profil">${esc((state.profile?.username || '?').slice(0, 2).toUpperCase())}</a>`;
  document.querySelectorAll('.staff-only').forEach((el) => { el.hidden = !isStaff(); });
}

export function registerAuth(route) {
  route('/prijava', async (ctx) => {
    if (state.session) { location.hash = '#/profil'; return; }
    ctx.app.innerHTML = `<div class="auth-card card"><div class="tabs" role="tablist"><button class="tab on" data-mode="login">Prijava</button><button class="tab" data-mode="register">Registracija</button></div><form id="auth-form" class="form"><label>E-mail<input name="email" type="email" required autocomplete="email"></label><label>Lozinka<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><label class="reg-only" hidden>Korisničko ime<input name="username" pattern="[a-zA-Z0-9_]{3,20}" title="3–20 slova, brojeva ili _" autocomplete="username"><small class="muted">Samo slova bez dijakritika, brojevi i _ (3–20 znakova).</small></label><button class="btn btn-primary btn-block" type="submit">Prijavi se</button><p class="msg-line" id="auth-msg" role="status"></p></form></div>`;
    let mode = 'login'; const form = ctx.app.querySelector('#auth-form'); const msg = ctx.app.querySelector('#auth-msg');
    ctx.app.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      mode = t.dataset.mode; ctx.app.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
      ctx.app.querySelectorAll('.reg-only').forEach((el) => { el.hidden = mode !== 'register'; });
      ctx.app.querySelector('button[type=submit]').textContent = mode === 'login' ? 'Prijavi se' : 'Napravi nalog'; msg.textContent = '';
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(form); const email = String(fd.get('email')).trim(); const password = String(fd.get('password')); msg.textContent = '';
      try {
        if (mode === 'login') { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; location.hash = '#/profil'; }
        else {
          const username = String(fd.get('username') || '').toLowerCase();
          if (!USERNAME_RE.test(username)) throw new Error('Korisničko ime: 3–20 znakova, samo a–z, 0–9 i _.');
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } }); if (error) throw error;
          if (data.session) { location.hash = '#/profil'; toast('Dobrodošao/la!'); } else msg.textContent = 'Provjeri e-mail i potvrdi nalog, pa se prijavi.';
        }
      } catch (err) { msg.textContent = errMsg(err); msg.classList.add('err'); }
    });
  });
  route('/profil', async (ctx) => {
    if (!state.session) { location.hash = '#/prijava'; return; }
    const p = state.profile || {};
    ctx.app.innerHTML = `<div class="page-head"><h1>Moj profil</h1><p class="muted">@${esc(p.username || '')} · ${esc(p.role || 'user')}</p></div><form id="profile-form" class="card form narrow"><label>Ime za prikaz<input name="display_name" maxlength="40" value="${esc(p.display_name || '')}"></label><label>Kratka biografija<textarea name="bio" maxlength="280" rows="3">${esc(p.bio || '')}</textarea></label><label>Link do avatara (slika)<input name="avatar_url" type="url" value="${esc(p.avatar_url || '')}"></label><button class="btn btn-primary" type="submit">Sačuvaj</button><button class="btn btn-ghost" type="button" id="logout">Odjavi se</button></form><section class="card narrow push-box"><h2>Obavještenja</h2><p class="muted small" id="push-msg">Dobij obavještenje o počecima utakmica i novim vijestima.</p><button class="btn" type="button" id="push-toggle">Učitavam…</button></section>`;
    const pushBtn = ctx.app.querySelector('#push-toggle'); const pushMsg = ctx.app.querySelector('#push-msg');
    const refreshPush = async () => {
      if (!pushSupported() || !VAPID_PUBLIC_KEY) { pushBtn.disabled = true; pushBtn.textContent = 'Nedostupno'; pushMsg.textContent = !pushSupported() ? 'Ovaj preglednik ne podržava obavještenja.' : 'Obavještenja još nisu podešena.'; return; }
      const on = !!(await currentSubscription()); pushBtn.textContent = on ? 'Isključi obavještenja' : 'Uključi obavještenja'; pushBtn.dataset.on = on ? '1' : '';
    };
    pushBtn.addEventListener('click', async () => {
      pushBtn.disabled = true;
      try { if (pushBtn.dataset.on) { await disablePush(); toast('Obavještenja isključena.'); } else { await enablePush(state.session.user.id); toast('Obavještenja uključena.'); } }
      catch (err) { toast(errMsg(err), 'err'); } pushBtn.disabled = false; refreshPush();
    });
    refreshPush();
    ctx.app.querySelector('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
    ctx.app.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      const { error } = await sb.from('profiles').update({ display_name: String(fd.get('display_name')).trim() || null, bio: String(fd.get('bio')).trim() || null, avatar_url: String(fd.get('avatar_url')).trim() || null }).eq('id', state.session.user.id);
      if (error) toast(errMsg(error), 'err'); else toast('Profil sačuvan.');
    });
  });
}
