// Browser-facing Edge Functions use the origin derived from SITE_URL.
// The wildcard is retained only as a development fallback when SITE_URL is unset.
export function originFromSiteUrl(value?: string): string {
  const siteUrl = value?.trim();
  if (!siteUrl) return '*';
  try {
    return new URL(siteUrl).origin;
  } catch {
    // Invalid production configuration must not silently broaden CORS.
    return 'null';
  }
}

const configured = originFromSiteUrl(Deno.env.get('SITE_URL'));
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': configured,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
