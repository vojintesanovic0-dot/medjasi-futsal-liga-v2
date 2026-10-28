-- v9 security hardening for the v2 schema. Safe to run repeatedly after schema.sql.
-- Direct browser inserts to newsletter_subscribers are intentionally disabled.
drop policy if exists newsletter_subscribe on public.newsletter_subscribers;
drop policy if exists newsletter_insert on public.newsletter_subscribers;
revoke insert on public.newsletter_subscribers from public, anon, authenticated;
-- The v2 schema also exposes a SECURITY DEFINER RPC; revoke it to prevent Turnstile bypass.
revoke execute on function public.subscribe_newsletter(text) from public, anon, authenticated;

-- A user can submit at most one team application in any rolling 24-hour window.
-- This uses the actual v2 schema column (user_id), not the v8-only applicant_id.
create or replace function public.limit_team_application_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is null then
    raise exception 'Prijava ekipe zahtijeva prijavljen nalog.';
  end if;
  if exists (
    select 1 from public.team_applications a
    where a.user_id = new.user_id
      and a.created_at > now() - interval '24 hours'
  ) then
    raise exception 'Možeš poslati najviše jednu prijavu ekipe u 24 sata.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_rate_team_applications on public.team_applications;
create trigger trg_rate_team_applications
before insert on public.team_applications
for each row execute function public.limit_team_application_rate();

revoke all on function public.limit_team_application_rate() from public, anon, authenticated;
