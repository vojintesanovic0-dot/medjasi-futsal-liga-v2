import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Metoda nije dozvoljena.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NEWSLETTER_FROM');
  const siteUrl = Deno.env.get('SITE_URL');
  if (!url || !anon || !service || !resendKey || !from || !siteUrl) return json({ error: 'Nedostaju potrebne serverske postavke.' }, 500);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Nisi prijavljen.' }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Sesija nije važeća.' }, 401);
  const { data: profile, error: profileError } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return json({ error: 'Samo administrator može slati obavještenja.' }, 403);
  let input: { subject?: unknown; text?: unknown };
  try { input = await req.json(); } catch { return json({ error: 'Neispravan JSON.' }, 400); }
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  if (subject.length < 2 || subject.length > 120 || text.length < 2 || text.length > 4000) return json({ error: 'Naslov (2–120 znakova) i tekst (2–4000 znakova) su obavezni.' }, 400);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: subs, error } = await admin.from('newsletter_subscribers').select('email,token').is('unsubscribed_at', null);
  if (error) return json({ error: 'Pretplatnike trenutno nije moguće učitati.' }, 500);
  const list = subs ?? [];
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const payload = chunk.map(s => {
      const link = `${siteUrl.replace(/\/$/, '')}/#/odjava-email?token=${encodeURIComponent(s.token)}`;
      return { from, to: [s.email], subject, text: `${text}\n\n—\nOdjava s obavještenja: ${link}`, headers: { 'List-Unsubscribe': `<${link}>` } };
    });
    try {
      const res = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) sent += chunk.length; else failed += chunk.length;
    } catch { failed += chunk.length; }
  }
  return json({ sent, failed, total: list.length });
});
