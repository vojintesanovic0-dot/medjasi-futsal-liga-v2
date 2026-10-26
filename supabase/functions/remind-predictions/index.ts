// Optional scheduled push reminder. Configure CRON_SECRET and VAPID_* secrets before use.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'forbidden' }, 403);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!url || !serviceKey || !subject || !publicKey || !privateKey) {
    return json({ error: 'Server secrets are not configured.' }, 503);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const now = new Date();
  const inThreeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const { data: matches, error: matchError } = await admin.from('matches')
    .select('id,home:teams!matches_home_team_id_fkey(name),away:teams!matches_away_team_id_fkey(name)')
    .eq('status', 'scheduled')
    .eq('reminder_sent', false)
    .gt('scheduled_at', now.toISOString())
    .lte('scheduled_at', inThreeHours.toISOString());
  if (matchError) return json({ error: 'Could not load scheduled matches.' }, 500);
  if (!matches?.length) return json({ matches: 0, sent: 0, skipped: 0 });

  const { data: subscriptions, error: subError } = await admin.from('push_subscriptions')
    .select('user_id,endpoint,p256dh,auth');
  if (subError) return json({ error: 'Could not load push subscriptions.' }, 500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const match of matches) {
    const { data: predictions, error: predictionError } = await admin.from('fan_predictions')
      .select('user_id').eq('match_id', match.id);
    if (predictionError) return json({ error: 'Could not load predictions.' }, 500);
    const havePredicted = new Set((predictions || []).map((prediction) => prediction.user_id));
    const payload = JSON.stringify({
      title: 'Pogodi rezultat',
      body: `${match.home?.name || 'Domaćin'} – ${match.away?.name || 'Gost'} počinje za manje od tri sata.`,
      url: '#/fan',
    });

    for (const subscription of subscriptions || []) {
      if (havePredicted.has(subscription.user_id)) { skipped++; continue; }
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 3600 });
        sent++;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        }
      }
    }

    // Record one reminder attempt per match to avoid sending the same reminder every 15 minutes.
    const { error: updateError } = await admin.from('matches').update({ reminder_sent: true }).eq('id', match.id);
    if (updateError) return json({ error: 'Could not mark reminders as processed.' }, 500);
  }

  return json({ matches: matches.length, sent, skipped, failed });
});
