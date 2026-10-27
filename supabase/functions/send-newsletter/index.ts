import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200, origin = '') => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  },
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

const emailHtml = (subject: string, text: string, siteUrl: string, unsubscribeUrl: string) => {
  const paragraphs = escapeHtml(text).split(/\r?\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.7;color:#d7dde5;white-space:normal">${paragraph.replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html>
<html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#0b0e12;font-family:Arial,Helvetica,sans-serif;color:#f4f6f8">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;border:1px solid #29313b;border-radius:16px;background:#141920">
    <tr><td style="padding:28px 26px 10px">
      <p style="margin:0 0 8px;color:#45d483;font-size:12px;font-weight:bold;letter-spacing:2px">MEĐASI FUTSAL LIGA</p>
      <h1 style="margin:0 0 24px;font-size:25px;line-height:1.25;color:#ffffff">${escapeHtml(subject)}</h1>
      ${paragraphs}
      <p style="margin:26px 0"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#22c55e;color:#07110a;text-decoration:none;font-weight:bold">Otvori ligu</a></p>
      <hr style="border:0;border-top:1px solid #29313b;margin:24px 0 16px">
      <p style="margin:0;color:#98a3b2;font-size:12px;line-height:1.6">Primio/la si ovu poruku jer si se prijavio/la na e-mail obavještenja Međasi Futsal Lige. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7ee2a8">Odjavi se</a>.</p>
    </td></tr>
  </table>
</body></html>`;
};

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NEWSLETTER_FROM');
  const siteUrl = Deno.env.get('SITE_URL');
  let allowedOrigin = '';
  try {
    if (siteUrl) allowedOrigin = new URL(siteUrl).origin;
  } catch { /* Invalid deployment configuration is reported below. */ }

  const requestOrigin = req.headers.get('Origin') ?? '';
  const corsOrigin = requestOrigin && requestOrigin === allowedOrigin ? allowedOrigin : '';
  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    },
  });
  if (req.method !== 'POST') return json({ error: 'Metoda nije dozvoljena.' }, 405, corsOrigin);
  if (!url || !anon || !service || !resendKey || !from || !siteUrl || !allowedOrigin) {
    return json({ error: 'Nedostaju potrebne serverske postavke.' }, 500, corsOrigin);
  }
  if (requestOrigin && !corsOrigin) return json({ error: 'Porijeklo zahtjeva nije dozvoljeno.' }, 403);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Nisi prijavljen.' }, 401, corsOrigin);
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Sesija nije važeća.' }, 401, corsOrigin);
  const { data: profile, error: profileError } = await userClient.from('profiles')
    .select('role').eq('id', user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') {
    return json({ error: 'Samo administrator može slati obavještenja.' }, 403, corsOrigin);
  }

  let input: { subject?: unknown; text?: unknown };
  try { input = await req.json(); } catch { return json({ error: 'Neispravan JSON.' }, 400, corsOrigin); }
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  if (subject.length < 2 || subject.length > 120 || text.length < 2 || text.length > 4000) {
    return json({ error: 'Naslov (2–120 znakova) i tekst (2–4000 znakova) su obavezni.' }, 400, corsOrigin);
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: subs, error } = await admin.from('newsletter_subscribers')
    .select('email,token').is('unsubscribed_at', null);
  if (error) return json({ error: 'Pretplatnike trenutno nije moguće učitati.' }, 500, corsOrigin);
  const list = subs ?? [];
  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const payload = chunk.map((s) => {
      const link = `${siteUrl.replace(/\/$/, '')}/#/odjava-email?token=${encodeURIComponent(s.token)}`;
      return {
        from, to: [s.email], subject,
        text: `${text}\n\n—\nOdjava s obavještenja: ${link}`,
        html: emailHtml(subject, text, siteUrl, link),
        headers: { 'List-Unsubscribe': `<${link}>` },
      };
    });
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let result: { data?: Array<{ id?: string; error?: unknown }>; errors?: unknown[] } | null = null;
      try { result = await res.json(); } catch { /* Treat an unreadable response as a failed batch. */ }
      if (!res.ok || !result || !Array.isArray(result.data)) {
        failed += chunk.length;
        continue;
      }
      const itemFailures = result.data.filter((item) => item?.error).length;
      const accepted = Math.min(chunk.length, result.data.length);
      sent += Math.max(0, accepted - itemFailures);
      failed += chunk.length - Math.max(0, accepted - itemFailures);
    } catch {
      failed += chunk.length;
    }
  }
  return json({ sent, failed, total: list.length }, 200, corsOrigin);
});
