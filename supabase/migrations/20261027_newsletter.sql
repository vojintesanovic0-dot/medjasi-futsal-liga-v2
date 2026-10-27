-- Newsletter subscribers with explicit consent, token-based unsubscribe and admin-only listing.
create table if not exists public.newsletter_subscribers (
  email text primary key
    check (email = lower(email) and char_length(email) between 5 and 200),
  token uuid not null unique default gen_random_uuid(),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from public, anon, authenticated;
grant select on public.newsletter_subscribers to authenticated;

drop policy if exists newsletter_admin_read on public.newsletter_subscribers;
create policy newsletter_admin_read on public.newsletter_subscribers
  for select to authenticated using (public.is_admin());

create or replace function public.subscribe_newsletter(p_email text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(e) < 5 or char_length(e) > 200 or e !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    return false;
  end if;
  insert into public.newsletter_subscribers (email) values (e)
  on conflict (email) do update
    set token = gen_random_uuid(), consent_at = now(), unsubscribed_at = null
    where public.newsletter_subscribers.unsubscribed_at is not null;
  return true;
end $$;

create or replace function public.unsubscribe_newsletter(p_token uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_token is null then return false; end if;
  update public.newsletter_subscribers
     set unsubscribed_at = coalesce(unsubscribed_at, now())
   where token = p_token;
  return found;
end $$;

revoke execute on function public.subscribe_newsletter(text) from public;
revoke execute on function public.unsubscribe_newsletter(uuid) from public;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;
grant execute on function public.unsubscribe_newsletter(uuid) to anon, authenticated;
