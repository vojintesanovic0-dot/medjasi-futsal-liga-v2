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
