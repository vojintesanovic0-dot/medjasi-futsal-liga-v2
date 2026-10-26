# Deployment

The site is published with the GitHub Actions workflow at `.github/workflows/pages.yml`.

- Repository: https://github.com/vojintesanovic0-dot/medjasi-futsal-liga-v2
- Intended URL: https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/
- Supabase project: `fmrypbvjaytecjinpsnp` (EU Central)

Before using authentication in production, set Supabase Authentication → URL Configuration:
- Site URL: `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/`
- Redirect URL: `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/**`

After updating this file, the Pages workflow runs on `main`. The deployment is considered complete only when the GitHub Actions deployment job succeeds and the site returns the app page at the intended URL.

Push notifications remain optional until valid VAPID keys have been securely configured as Supabase Edge Function secrets and the public VAPID key is added to `js/config.js`.


## v5 activation notes

- Authentication → Providers → Email: enable **Confirm email** only if requiring verified email addresses.
- Authentication → URL Configuration: use the published site URL and allow the GitHub Pages app route; password recovery returns to the hash route `#/nova-lozinka`.
- `remind-predictions` is deployed with `verify_jwt=false` because it validates a dedicated `CRON_SECRET` header itself. It returns an error until `CRON_SECRET` and VAPID secrets are set. No recurring cron job has been created.
- Set `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `CRON_SECRET` in Supabase Edge Function Secrets. Put only the public VAPID key in `js/config.js`; never commit private keys or cron secrets.
- For recurring invocations use `pg_cron` and `pg_net`, storing the call secret in Supabase Vault rather than hardcoding it in a SQL file.
- The legal/privacy page contains placeholders and is not a finalized legal notice.
