import { normalizeEmail, safeEqual } from './crypto.ts';

Deno.test('safeEqual compares secrets without content shortcuts', () => {
  if (!safeEqual('abc', 'abc')) throw new Error('same strings should match');
  if (safeEqual('abc', 'abd')) throw new Error('different strings must not match');
  if (safeEqual('ab', 'abc')) throw new Error('different lengths must not match');
  if (safeEqual('', '')) throw new Error('empty secret must not be accepted as a valid match');
});
Deno.test('normalizeEmail trims, lowercases, and validates', () => {
  if (normalizeEmail(' Ana@Primjer.BA ') !== 'ana@primjer.ba') throw new Error('email normalization failed');
  if (normalizeEmail('not-an-email') !== null) throw new Error('invalid email accepted');
  if (normalizeEmail(null) !== null) throw new Error('null email accepted');
  if (normalizeEmail('a'.repeat(195) + '@x.ba') !== null) throw new Error('overlong email accepted');
});
