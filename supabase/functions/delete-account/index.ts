import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function removeFolder(admin: ReturnType<typeof createClient>, folder: string): Promise<void> {
  const { data, error } = await admin.storage.from('media').list(folder, { limit: 1000 });
  if (error) throw error;
  const files = (data || []).filter((item) => item.id).map((item) => `${folder}/${item.name}`);
  const directories = (data || []).filter((item) => !item.id && item.name);
  for (const directory of directories) await removeFolder(admin, `${folder}/${directory.name}`);
  if (files.length) {
    const { error: removeError } = await admin.storage.from('media').remove(files);
    if (removeError) throw removeError;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Server configuration is incomplete.' }, 500);
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
  if (!me) return json({ error: 'Profil nije pronađen.' }, 404);

  if (me.role === 'admin') {
    const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if (countError) return json({ error: 'Ne mogu provjeriti broj administratora.' }, 500);
    if ((count ?? 0) <= 1) return json({ error: 'Ti si jedini admin. Prvo dodijeli ulogu drugom adminu.' }, 409);
  }

  try {
    // Slike objava čuvaju se u media/posts/<uid>/...; ukloni ih prije profila.
    await removeFolder(admin, `posts/${user.id}`);
  } catch (_error) {
    return json({ error: 'Slike korisnika nisu mogle biti obrisane; nalog nije obrisan.' }, 500);
  }

  // Newsletter subscriptions are keyed by normalized email rather than profile id.
  if (user.email) {
    const { error: newsletterError } = await admin.from('newsletter_subscribers')
      .delete().eq('email', user.email.trim().toLowerCase());
    if (newsletterError) return json({ error: 'Brisanje newsletter pretplate nije uspjelo; nalog nije obrisan.' }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return json({ error: 'Brisanje naloga nije uspjelo.' }, 500);
  return json({ ok: true });
});
