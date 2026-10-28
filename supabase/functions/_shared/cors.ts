// Browser-facing Edge Functions use SITE_URL when configured.
// A wildcard is retained only as a development fallback.
const configured = Deno.env.get('SITE_URL')?.trim().replace(/\/$/, '');
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': configured || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
