# v9 rollout checklist — v2 repository

This repository is the modular v2 app, not the older v8 layout. The old files `security_v7.sql`, `features_v8.sql`, `tests/sql/test_v8.sql`, and `js/pages/admin-v8.js` are not part of this repository. Do not copy commands that reference them.

## Before merge

- [ ] Wait for the latest commit's validation and SQL/Node/Deno CI checks to pass.
- [ ] Review the PR diff and confirm no production data, keys, or dashboard secrets were changed.
- [ ] Do not merge while a required CI check is pending or red.

## Supabase rollout (manual)

1. Confirm this is the intended Supabase project and that a restorable backup exists.
2. Apply `supabase/security_v9.sql` and then `supabase/features_v9.sql` after the existing v2 `supabase/schema.sql`. Do not re-run the base schema on a live project unless that is part of the established migration process.
3. Deploy the new public function: `supabase functions deploy subscribe-newsletter`. The repository's `supabase/config.toml` sets `verify_jwt = false` for this function so the handler can verify Turnstile itself; all other functions retain their own settings.
4. Deploy the updated existing functions when ready: `delete-account`, `remind-predictions`, `send-newsletter`, and `send-push`.
5. Configure Supabase Edge Function secrets in the dashboard/CLI. At minimum, the newsletter signup needs `TURNSTILE_SECRET`; sending mail also needs `RESEND_API_KEY`, `NEWSLETTER_FROM`, and `SITE_URL`. Set `CRON_SECRET` only if the configured scheduled function uses it. Never place server secrets in `js/config.js`.
6. Create the Cloudflare Turnstile widget for the deployed site and set its public site key in `js/config.js` as `TURNSTILE_SITE_KEY`. Until configured, newsletter signup stays disabled.
7. Run `python3 tests/preflight.py` from a machine that can reach the configured Supabase project. The script contacts the live project and must not be run against a production project until you intend to verify that exact project.
8. Test a signup with a valid Turnstile challenge and verify the resulting record from the admin interface. Confirm that an anonymous request cannot read newsletter addresses or client-error reports.

## Data and backups

- This PR does not migrate data from the old project to the v2 Supabase project.
- This repository currently has no `backup.yml`, `restore.yml`, or `tests/restore_check.sh`. A monthly restore workflow cannot safely be enabled until a backup workflow and a private/appropriately protected backup destination are designed.
- Do not upload raw database dumps, user records, email addresses, or auth data as publicly accessible artifacts. A dump of only the `public` schema does not restore `auth.users` or user logins.
- The privacy text added to `privatnost.html` is explicitly marked as a draft. A qualified reviewer must check it and fill in the placeholders before publication.

## Known verification limits

CI validates the adapted SQL on an isolated PostgreSQL instance and runs the local Node/Deno helper tests. It does not prove the live project's policies, Turnstile configuration, email delivery, real-user permissions, or a production backup restore. Those require the manual steps above.
