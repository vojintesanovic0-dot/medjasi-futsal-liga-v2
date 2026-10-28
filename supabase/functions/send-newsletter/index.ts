import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const RESEND_BATCH_LIMIT = 100;
const PAGE = 1000;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Recipient = { email: string; token: string };

function buildMessage(subject: string, text: string, unsubscribeUrl: string, from: string, to: string) {
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
    <h2>${escapeHtml(subject)}</h2>${paragraphs}
    <hr><p style="font-size:12px;color:#666">Primaš ovo jer si se prijavio/la na obavještenja Međasi Futsal Lige.
    <a href="${escapeHtml(unsubscribeUrl)}">Odjavi se</a></p></div>`;
  return { from, to: [to], subject, html, text: `${text}\n\nOdjava: ${unsubscribeUrl}`,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

async function sendBatch(apiKey: string, messages: unknown[]): Promise<number> {
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return 0;
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.data) ? body.data.length : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NEWSLETTER_FROM');
  const siteUrl = (Deno.env.get('SITE_URL') || '').replace(/\/?$/, '/');
  if (!url || !anon || !service) return json({ error: 'Server configuration is incomplete.' }, 500);
  if (!apiKey || !from || !siteUrl || siteUrl === '/') {
    return json({ error: 'Resend nije podešen: postavi RESEND_API_KEY, NEWSLETTER_FROM i SITE_URL u Supabase secrets.' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Nisi prijavljen.' }, 401);
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (authError || !user) return json({ error: 'Sesija nije ispravna ili je istekla.' }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: me, error: profileError } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return json({ error: 'Ne mogu provjeriti korisničku ulogu.' }, 500);
  if (me?.role !== 'admin') return json({ error: 'Samo administrator može slati newsletter.' }, 403);

  let payload: { subject?: unknown; text?: unknown; testOnly?: unknown };
  try { payload = await req.json(); } catch { return json({ error: 'Neispravan zahtjev.' }, 400); }
  const subject = String(payload.subject ?? '').trim();
  const text = String(payload.text ?? '').trim();
  if (subject.length < 2 || subject.length > 120) return json({ error: 'Naslov mora imati 2–120 znakova.' }, 400);
  if (text.length < 2 || text.length > 4000) return json({ error: 'Tekst mora imati 2–4000 znakova.' }, 400);

  if (payload.testOnly === true) {
    if (!user.email) return json({ error: 'Administratorski nalog nema e-mail adresu.' }, 400);
    const accepted = await sendBatch(apiKey, [buildMessage(`[TEST] ${subject}`, text, `${siteUrl}#/odjava-email`, from, user.email)]);
    return json({ test: true, sent: accepted, failed: 1 - accepted, recipient: user.email, total: 1 });
  }

  const recipients: Recipient[] = [];
  for (let from0 = 0; ; from0 += PAGE) {
    const { data, error } = await admin.from('newsletter_subscribers')
      .select('email, token').is('unsubscribed_at', null).order('email').range(from0, from0 + PAGE - 1);
    if (error) return json({ error: 'Ne mogu učitati pretplatnike.' }, 500);
    recipients.push(...(data as Recipient[] || []));
    if (!data || data.length < PAGE) break;
  }

  let sent = 0;
  for (let i = 0; i < recipients.length; i += RESEND_BATCH_LIMIT) {
    const messages = recipients.slice(i, i + RESEND_BATCH_LIMIT).map((r) =>
      buildMessage(subject, text, `${siteUrl}#/odjava-email?token=${r.token}`, from, r.email));
    sent += await sendBatch(apiKey, messages);
  }
  return json({ sent, failed: recipients.length - sent, total: recipients.length });
});
