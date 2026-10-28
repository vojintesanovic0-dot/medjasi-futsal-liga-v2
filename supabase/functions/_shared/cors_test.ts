import { originFromSiteUrl } from './cors.ts';

function equal(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

Deno.test('CORS uses only the origin when SITE_URL includes a path', () => {
  equal(originFromSiteUrl('https://example.org/league/app/'), 'https://example.org', 'path stripped');
});

Deno.test('CORS preserves localhost origin and port for development', () => {
  equal(originFromSiteUrl('http://localhost:5173/'), 'http://localhost:5173', 'localhost origin');
});

Deno.test('CORS does not broaden an invalid configured URL', () => {
  equal(originFromSiteUrl('not-a-url'), 'null', 'invalid URL');
});

Deno.test('unset SITE_URL uses the documented development fallback', () => {
  equal(originFromSiteUrl(undefined), '*', 'fallback');
});
