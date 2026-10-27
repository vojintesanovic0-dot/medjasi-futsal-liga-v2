-- Prijave novih ekipa. Idempotentno.
create table if not exists public.team_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  team_name text not null check (char_length(team_name) between 2 and 60),
  contact_name text not null check (char_length(contact_name) between 2 and 80),
  contact_email text not null check (char_length(contact_email) between 5 and 200 and contact_email like '%_@_%'),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now()
);
create unique index if not exists team_applications_one_pending
  on public.team_applications(user_id) where status = 'pending';
alter table public.team_applications enable row level security;
drop policy if exists team_applications_insert_own on public.team_applications;
create policy team_applications_insert_own on public.team_applications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
drop policy if exists team_applications_read on public.team_applications;
create policy team_applications_read on public.team_applications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists team_applications_admin_update on public.team_applications;
create policy team_applications_admin_update on public.team_applications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists team_applications_admin_delete on public.team_applications;
create policy team_applications_admin_delete on public.team_applications for delete to authenticated
  using (public.is_admin());
revoke all on public.team_applications from public, anon, authenticated;
grant select, insert on public.team_applications to authenticated;
grant update, delete on public.team_applications to authenticated;
