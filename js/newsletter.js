import { sb } from './supabase.js';
import { TURNSTILE_SITE_KEY } from './config.js';
import { esc } from './util.js';

export function mountNewsletter(el) {
  if (!el) return;
  el.innerHTML=`<form class="newsletter" id="nl-form"><strong>Obavještenja na e-mail</strong>
    <p class="muted small">Novosti, rezultati i vijesti. Odjava je moguća u svakom trenutku.</p>
    <div class="nl-row"><input name="email" type="email" required maxlength="200" autocomplete="email" placeholder="tvoj@e-mail.ba" aria-label="E-mail">
    <button class="btn btn-sm btn-primary" type="submit">Prijavi se</button></div>
    <label class="check small"><input name="consent" type="checkbox" required> Slažem se da primam obavještenja e-mailom. <a href="privatnost.html">Privatnost</a></label>
    ${TURNSTILE_SITE_KEY ? `<div class="cf-turnstile" data-sitekey="${esc(TURNSTILE_SITE_KEY)}"></div>` : '<p class="small muted">Prijava na obavještenja je trenutno nedostupna.</p>'}
    <p class="small" id="nl-msg" role="status" aria-live="polite"></p></form>`;
  const form = el.querySelector('#nl-form');
  const button = form.querySelector('button[type="submit"]');
  if (!TURNSTILE_SITE_KEY) button.disabled = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
    const fields = new FormData(form);
    const token = String(fields.get('cf-turnstile-response') || '');
    const msg = el.querySelector('#nl-msg');
    button.disabled = true;
    msg.textContent = 'Prijavljujem…';
    try {
      const { data, error } = await sb.functions.invoke('subscribe-newsletter', {
        body: { email, consent: fields.get('consent') === 'on', token },
      });
      if (error || data?.error || data?.ok !== true) {
        throw new Error(data?.error || error?.message || 'Prijava nije uspjela. Pokušaj ponovo.');
      }
      form.reset();
      if (window.turnstile) window.turnstile.reset();
      msg.textContent = 'Hvala! Prijava je zabilježena.';
    } catch (_error) {
      msg.textContent = 'Prijava nije uspjela. Provjeri e-mail i Turnstile potvrdu.';
    } finally {
      button.disabled = !TURNSTILE_SITE_KEY;
    }
  });
}
