// Public newsletter signup protected by Cloudflare Turnstile.
// Secrets: TURNSTILE_SECRET; Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { normalizeEmail } from '../_shared/crypto.ts';
import { CORS } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metoda nije dozvoljena.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = Deno.env.get('TURNSTILE_SECRET');
  if (!url || !service || !secret) return json({ error: 'Prijava trenutno nije dostupna.' }, 503);

  let input: { email?: unknown; consent?: unknown; token?: unknown };
  try { input = await req.json(); } catch { return json({ error: 'Neispravan JSON.' }, 400); }
  if (input.consent !== true) return json({ error: 'Potrebna je saglasnost.' }, 400);
  const email = normalizeEmail(input.email);
  if (!email) return json({ error: 'E-mail nije ispravan.' }, 400);
  const token = typeof input.token === 'string' ? input.token.slice(0, 2048) : '';
  if (!token) return json({ error: 'Potvrdi da nisi robot.' }, 400);

  let verification: Response;
  try {
    verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
  } catch (_error) {
    return json({ error: 'Provjera trenutno nije dostupna.' }, 503);
  }
  const result = await verification.json().catch(() => ({ success: false }));
  if (!verification.ok || result?.success !== true) {
    return json({ error: 'Provjera nije uspjela. Pokušaj ponovo.' }, 403);
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from('newsletter_subscribers').insert({ email });
  // Duplicate emails return the same success response to avoid account enumeration.
  if (error && error.code !== '23505') return json({ error: 'Ne mogu da sačuvam prijavu.' }, 500);
  return json({ ok: true });
});
