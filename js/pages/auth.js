import { sb } from '../supabase.js';
import { state, isStaff } from '../state.js';
import { esc, toast, errMsg } from '../util.js';
import { pushSupported, enablePush, disablePush, currentSubscription } from '../push.js';
import { VAPID_PUBLIC_KEY } from '../config.js';
import { setPushFollowedOnly } from '../api.js';

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
    ctx.app.innerHTML = `<div class="auth-card card"><div class="tabs" role="tablist"><button class="tab on" data-mode="login">Prijava</button><button class="tab" data-mode="register">Registracija</button></div><form id="auth-form" class="form"><label>E-mail<input name="email" type="email" required autocomplete="email"></label><label>Lozinka<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><label class="reg-only" hidden>Korisničko ime<input name="username" pattern="[a-zA-Z0-9_]{3,20}" title="3–20 slova, brojeva ili _" autocomplete="username"><small class="muted">Samo slova bez dijakritika, brojevi i _ (3–20 znakova).</small></label><button class="btn btn-primary btn-block" type="submit">Prijavi se</button><p class="msg-line" id="auth-msg" role="status"></p><p class="center small"><a href="#/zaboravljena">Zaboravljena lozinka?</a></p></form></div>`;
    let mode = 'login'; const form = ctx.app.querySelector('#auth-form'); const msg = ctx.app.querySelector('#auth-msg');
    ctx.app.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      mode = t.dataset.mode; ctx.app.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
      ctx.app.querySelectorAll('.reg-only').forEach((el) => { el.hidden = mode !== 'register'; });
      ctx.app.querySelector('button[type=submit]').textContent = mode === 'login' ? 'Prijavi se' : 'Napravi nalog'; msg.textContent = '';
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(form); const email = String(fd.get('email')).trim(); const password = String(fd.get('password')); msg.textContent = '';
      try {
        if (mode === 'login') {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) {
            if (/confirm/i.test(error.message || '')) {
              msg.innerHTML = 'Nalog još nije potvrđen. Provjeri e-mail. <button type="button" class="link-btn" id="resend">Pošalji ponovo</button>';
              msg.querySelector('#resend').addEventListener('click', async () => {
                const { error: resendError } = await sb.auth.resend({ type: 'signup', email });
                toast(resendError ? errMsg(resendError) : 'Poslali smo novi link za potvrdu.', resendError ? 'err' : undefined);
              });
              return;
            }
            throw error;
          }
          location.hash = '#/profil';
        }
        else {
          const username = String(fd.get('username') || '').toLowerCase();
          if (!USERNAME_RE.test(username)) throw new Error('Korisničko ime: 3–20 znakova, samo a–z, 0–9 i _.');
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } }); if (error) throw error;
          if (data.session) { location.hash = '#/profil'; toast('Dobrodošao/la!'); } else msg.textContent = 'Provjeri e-mail i potvrdi nalog, pa se prijavi.';
        }
      } catch (err) { msg.textContent = errMsg(err); msg.classList.add('err'); }
    });
  });
  route('/zaboravljena', async (ctx) => {
    ctx.app.innerHTML = `<div class="auth-card card"><h1>Zaboravljena lozinka</h1>
      <form id="reset-form" class="form">
        <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
        <button class="btn btn-primary btn-block" type="submit">Pošalji link</button>
        <p class="msg-line" id="reset-msg" role="status"></p>
        <p class="center small"><a href="#/prijava">Nazad na prijavu</a></p>
      </form></div>`;
    ctx.app.querySelector('#reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = String(new FormData(e.target).get('email') || '').trim();
      const msg = ctx.app.querySelector('#reset-msg');
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}${location.pathname}#/nova-lozinka`,
        });
        msg.textContent = error ? errMsg(error) : 'Ako nalog postoji, poslali smo link na e-mail. Provjeri i spam.';
        msg.classList.toggle('err', !!error);
      } catch (error) {
        msg.textContent = errMsg(error);
        msg.classList.add('err');
      } finally { btn.disabled = false; }
    });
  });
  route('/nova-lozinka', async (ctx) => {
    if (!state.session) {
      ctx.app.innerHTML = `<div class="card">Link je istekao ili nije ispravan. <a href="#/zaboravljena">Pošalji novi</a>.</div>`;
      return;
    }
    ctx.app.innerHTML = `<div class="auth-card card"><h1>Nova lozinka</h1>
      <form id="pw-form" class="form">
        <label>Nova lozinka<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn btn-primary btn-block" type="submit">Sačuvaj lozinku</button>
        <p class="msg-line" id="pw-msg" role="status"></p>
      </form></div>`;
    ctx.app.querySelector('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const password = String(new FormData(form).get('password') || '');
      const msg = ctx.app.querySelector('#pw-msg');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        toast('Lozinka promijenjena.');
        await sb.auth.signOut();
        location.hash = '#/prijava';
      } catch (error) {
        msg.textContent = errMsg(error);
        msg.classList.add('err');
      } finally { btn.disabled = false; }
    });
  });
  route('/profil', async (ctx) => {
    if (!state.session) { location.hash = '#/prijava'; return; }
    const p = state.profile || {};
    const { data: warnings, error: warningsError } = await sb.from('user_warnings').select('*')
      .eq('user_id', state.session.user.id).order('created_at', { ascending: false });
    if (warningsError) throw warningsError;
    ctx.app.innerHTML = `<div class="page-head"><h1>Moj profil</h1><p class="muted">@${esc(p.username || '')} · ${esc(p.role || 'user')}</p></div><form id="profile-form" class="card form narrow"><label>Ime za prikaz<input name="display_name" maxlength="40" value="${esc(p.display_name || '')}"></label><label>Kratka biografija<textarea name="bio" maxlength="280" rows="3">${esc(p.bio || '')}</textarea></label><label>Link do avatara (slika)<input name="avatar_url" type="url" value="${esc(p.avatar_url || '')}"></label><button class="btn btn-primary" type="submit">Sačuvaj</button><button class="btn btn-ghost" type="button" id="logout">Odjavi se</button></form>${(warnings || []).length ? `<section class="card narrow warn-box"><h2>Upozorenja</h2>
      ${warnings.map((w) => `<p class="account-warning"><svg class="account-warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v4m0 3h.01"/></svg><span>${esc(w.message)}</span> <span class="muted small">${esc(new Date(w.created_at).toLocaleDateString('bs-BA'))}</span></p>`).join('')}
    </section>` : ''}<section class="card narrow danger-box"><h2>Brisanje naloga</h2><p class="muted small">Brišu se profil, objave, komentari, pogađanja i pretplate na obavještenja. Radnja se ne može poništiti.</p><button class="btn btn-danger" type="button" id="delete-account">Obriši moj nalog</button></section><section class="card narrow push-box"><h2>Obavještenja</h2><p class="muted small" id="push-msg">Dobij obavještenje o počecima utakmica i novim vijestima.</p><button class="btn" type="button" id="push-toggle">Učitavam…</button><label class="check small"><input type="checkbox" id="push-followed" disabled> Šalji mi samo obavještenja za ekipe koje pratim</label></section>`;
    const pushBtn = ctx.app.querySelector('#push-toggle'); const pushMsg = ctx.app.querySelector('#push-msg');
    const refreshPush = async () => {
      if (!pushSupported() || !VAPID_PUBLIC_KEY) { pushBtn.disabled = true; pushBtn.textContent = 'Nedostupno'; pushMsg.textContent = !pushSupported() ? 'Ovaj preglednik ne podržava obavještenja.' : 'Obavještenja još nisu podešena.'; return; }
      const on = !!(await currentSubscription()); pushBtn.textContent = on ? 'Isključi obavještenja' : 'Uključi obavještenja'; pushBtn.dataset.on = on ? '1' : '';
      const fo = ctx.app.querySelector('#push-followed');
      if (on) {
        const sub = await currentSubscription();
        const { data, error } = await sb.from('push_subscriptions').select('followed_only').eq('endpoint', sub.endpoint).maybeSingle();
        if (error) throw error;
        fo.checked = !!data?.followed_only; fo.disabled = false;
      } else { fo.checked = false; fo.disabled = true; }
    };
    pushBtn.addEventListener('click', async () => {
      pushBtn.disabled = true;
      try { if (pushBtn.dataset.on) { await disablePush(); toast('Obavještenja isključena.'); } else { await enablePush(state.session.user.id); toast('Obavještenja uključena.'); } }
      catch (err) { toast(errMsg(err), 'err'); } pushBtn.disabled = false; refreshPush();
    });
    ctx.app.querySelector('#push-followed').addEventListener('change', async (e) => {
      const sub = await currentSubscription(); if (!sub) return;
      const checkbox = e.currentTarget; checkbox.disabled = true;
      try { await setPushFollowedOnly(sub.endpoint, checkbox.checked); toast(checkbox.checked ? 'Obavještenja samo za omiljene ekipe.' : 'Primaš sva obavještenja.'); }
      catch (err) { checkbox.checked = !checkbox.checked; toast(errMsg(err), 'err'); }
      finally { checkbox.disabled = false; }
    });
    refreshPush().catch((err) => toast(errMsg(err), 'err'));
    ctx.app.querySelector('#delete-account').addEventListener('click', async () => {
      const word = prompt('Za potvrdu upiši OBRIŠI (velikim slovima):');
      if (word !== 'OBRIŠI') return;
      const btn = ctx.app.querySelector('#delete-account');
      btn.disabled = true;
      try {
        const { error } = await sb.functions.invoke('delete-account');
        if (error) throw error;
        await sb.auth.signOut();
        toast('Nalog obrisan.');
        location.hash = '#/';
      } catch (error) {
        toast(errMsg(error), 'err');
      } finally {
        if (btn.isConnected) btn.disabled = false;
      }
    });
    ctx.app.querySelector('#logout').addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
    ctx.app.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target);
      const { error } = await sb.from('profiles').update({ display_name: String(fd.get('display_name')).trim() || null, bio: String(fd.get('bio')).trim() || null, avatar_url: String(fd.get('avatar_url')).trim() || null }).eq('id', state.session.user.id);
      if (error) toast(errMsg(error), 'err'); else toast('Profil sačuvan.');
    });
  });
}
