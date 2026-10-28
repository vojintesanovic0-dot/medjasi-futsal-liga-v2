// Server-rendered Open Graph metadata for public news sharing.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = (Deno.env.get('SITE_URL') ?? 'https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2').replace(/\/$/, '');
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!));

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';
  if (!/^[a-z0-9-]{1,160}$/.test(slug) || !SITE.startsWith('https://')) {
    return new Response('Bad request', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return new Response('Server configuration error', { status: 500 });

  const sb = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await sb.from('news')
    .select('title,excerpt,cover_url,slug,published,published_at')
    .eq('slug', slug).eq('published', true).maybeSingle();
  if (error) return new Response('Server error', { status: 500 });
  if (!data || (data.published_at && new Date(data.published_at).getTime() > Date.now())) {
    return new Response('Not found', { status: 404 });
  }

  const page = `${SITE}/#/vijest/${encodeURIComponent(slug)}`;
  const image = typeof data.cover_url === 'string' && /^https:\/\//i.test(data.cover_url) ? data.cover_url : '';
  const description = String(data.excerpt ?? '').slice(0, 200);
  const html = `<!doctype html><html lang="bs"><head><meta charset="utf-8">
<title>${esc(data.title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(data.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(page)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(data.title)}">
<meta name="twitter:description" content="${esc(description)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
<meta http-equiv="refresh" content="0;url=${esc(page)}">
</head><body><a href="${esc(page)}">Otvori vijest</a></body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
});
