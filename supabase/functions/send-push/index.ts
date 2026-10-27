// Edge Function: šalje push obavještenja svim pretplaćenima.
// Poziv: POST { "title": "...", "body": "...", "url": "#/vijesti", "teamId": "<uuid, opciono>" } uz JWT admina ili urednika.
// Uređaji sa followed_only=true primaju samo poruke za ekipe koje korisnik prati; bez teamId ne primaju ništa.
// Secrets (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (npr. mailto:liga@primjer.ba)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) Provjera: pozivalac mora biti prijavljen i imati ulogu admin ili editor
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Nisi prijavljen.' }, 401);
  const { data: me } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!me || !['admin', 'editor'].includes(me.role)) return json({ error: 'Nemaš pravo slanja.' }, 403);

  // 2) Ulaz
  let input: { title?: string; body?: string; url?: string; teamId?: string };
  try { input = await req.json(); } catch { return json({ error: 'Neispravan JSON.' }, 400); }
  const title = String(input.title ?? '').slice(0, 80) || 'Međasi Futsal Liga';
  const body = String(input.body ?? '').slice(0, 200);
  const target = String(input.url ?? '#/').slice(0, 200);
  const teamId = input.teamId ? String(input.teamId) : null;
  if (teamId && !/^[0-9a-f-]{36}$/i.test(teamId)) return json({ error: 'Neispravan teamId.' }, 400);

  // 3) Slanje (servisni ključ čita pretplate; ključ nikad ne ide u browser)
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  const admin = createClient(url, service);
  const { data: allSubs, error } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, followed_only');
  if (error) return json({ error: error.message }, 500);
  let followers = new Set<string>();
  if (teamId) {
    const { data: fol, error: folError } = await admin.from('team_follows').select('user_id').eq('team_id', teamId);
    if (folError) return json({ error: folError.message }, 500);
    followers = new Set((fol ?? []).map((r) => r.user_id));
  }
  const subs = (allSubs ?? []).filter((s) => !s.followed_only || (teamId !== null && followers.has(s.user_id)));

  let sent = 0;
  const gone: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url: target }),
        { TTL: 60 * 60 },
      );
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.id); // pretplata više ne važi
    }
  }));
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);

  return json({ sent, removed: gone.length, total: subs.length, all: allSubs?.length ?? 0, teamId });
});
