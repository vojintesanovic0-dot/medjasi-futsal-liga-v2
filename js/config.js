// ===== PODEŠAVANJE: unesi podatke iz Supabase → Project Settings → API =====
// Anon (public) ključ je siguran za browser. NIKAD ne stavljaj service_role ključ ovdje.
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
export const LEAGUE_NAME = 'Međasi Futsal Liga';
// Web push (opciono): generiši VAPID par (npx web-push generate-vapid-keys) i upiši PUBLIC ključ ovdje.
export const VAPID_PUBLIC_KEY = '';