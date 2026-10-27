-- Partneri lige i albumi galerije. Idempotentna migracija.
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  logo_url text check (logo_url is null or logo_url ~* '^https://'),
  website_url text check (website_url is null or website_url ~* '^https://'),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sponsors enable row level security;
drop policy if exists sponsors_read on public.sponsors;
create policy sponsors_read on public.sponsors for select using (true);
drop policy if exists sponsors_admin on public.sponsors;
create policy sponsors_admin on public.sponsors for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.sponsors from public, anon, authenticated;
grant select on public.sponsors to anon, authenticated;
grant insert, update, delete on public.sponsors to authenticated;

alter table public.gallery add column if not exists album text
  check (album is null or char_length(album) between 1 and 60);
create index if not exists gallery_album_idx on public.gallery (album);
