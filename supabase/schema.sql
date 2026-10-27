-- =====================================================================
-- MEĐASI FUTSAL LIGA v2 — kompletna šema.
-- Pokrenuti jednom u novom Supabase projektu (SQL Editor), cijelo odjednom.
-- Idempotentno je koliko je moguće (drop/create za politike i triggere).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Helper funkcije (plpgsql: tijelo se ne validira pri kreiranju) ----------
create or replace function public.current_role_name()
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon');
end $$;

create or replace function public.is_admin()
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.current_role_name() = 'admin';
end $$;

create or replace function public.is_staff()   -- admin ili urednik sadržaja
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.current_role_name() in ('admin','editor');
end $$;

-- ---------- Profili ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null
              check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url  text,
  bio         text check (bio is null or char_length(bio) <= 280),
  role        text not null default 'user' check (role in ('user','editor','admin')),
  created_at  timestamptz not null default now()
);

-- Automatski profil pri registraciji (username iz metapodataka ili rezervni)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := regexp_replace(
            lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1), 'user')),
            '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'igrac'; end if;
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 16) || n::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Korisnik ne smije sam sebi mijenjati ulogu
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Nemaš pravo da mijenjaš ulogu.';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------- Sezone ----------
create table if not exists public.seasons (
  id        serial primary key,
  name      text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists one_active_season on public.seasons (is_active) where is_active;

-- ---------- Ekipe, igrači ----------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  season_id   int references public.seasons(id) on delete cascade,
  name        text not null,
  short_name  text,
  logo_url    text,
  color       text default '#22c55e',
  created_at  timestamptz not null default now(),
  unique (season_id, name)
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  number      int check (number between 0 and 99),
  position    text check (position in ('golman','odbrana','vezni','napad')),
  photo_url   text,
  is_captain  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (team_id, number)
);

-- ---------- Utakmice ----------
create table if not exists public.matches (
  id              uuid primary key default gen_random_uuid(),
  season_id       int not null references public.seasons(id) on delete cascade,
  round           int not null default 1,
  home_team_id    uuid not null references public.teams(id) on delete cascade,
  away_team_id    uuid not null references public.teams(id) on delete cascade,
  scheduled_at    timestamptz not null,
  venue           text,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','live','paused','finished')),
  periods         int not null default 2 check (periods between 1 and 4),
  period_minutes  int not null default 20 check (period_minutes between 1 and 60),
  current_period  int not null default 1,
  -- Sat: vrijednost u trenutku zadnje promjene + vrijeme kad je krenuo
  clock_seconds   int not null default 0,
  clock_started_at timestamptz,
  home_score      int not null default 0,
  away_score      int not null default 0,
  created_at      timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
create index if not exists matches_season_idx on public.matches (season_id, scheduled_at);

-- Događaji: golovi, vlastiti golovi, kartoni
create table if not exists public.match_events (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade, -- ekipa igrača (kod own_goal: ekipa koja je primila gol u svoju mrežu)
  player_id   uuid references public.players(id) on delete set null,
  assist_id   uuid references public.players(id) on delete set null,
  type        text not null check (type in ('goal','own_goal','yellow','red')),
  minute      int not null default 0 check (minute between 0 and 200),
  created_at  timestamptz not null default now()
);
create index if not exists match_events_match_idx on public.match_events (match_id);

-- Rezultat se uvijek računa iz događaja (ne može se ručno pokvariti)
create or replace function public.recalc_match_score()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mid uuid := coalesce(new.match_id, old.match_id);
begin
  -- goal: računa se ekipi igrača; own_goal: igrač je iz ekipe team_id, a gol se računa PROTIVNIKU
  update public.matches m set
    home_score = (select count(*) from public.match_events e where e.match_id = m.id and
                    ((e.type = 'goal' and e.team_id = m.home_team_id) or
                     (e.type = 'own_goal' and e.team_id = m.away_team_id))),
    away_score = (select count(*) from public.match_events e where e.match_id = m.id and
                    ((e.type = 'goal' and e.team_id = m.away_team_id) or
                     (e.type = 'own_goal' and e.team_id = m.home_team_id)))
  where m.id = mid;
  return null;
end $$;

drop trigger if exists trg_recalc_score on public.match_events;
create trigger trg_recalc_score after insert or update or delete on public.match_events
  for each row execute function public.recalc_match_score();

-- Provjera: strijelac i asistent moraju biti iz ekipe koja je u tom događaju
create or replace function public.validate_match_event()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.player_id is not null and not exists (
       select 1 from public.players p where p.id = new.player_id and p.team_id = new.team_id) then
    raise exception 'Igrač ne pripada ekipi koja je označena u događaju.';
  end if;
  if new.assist_id is not null and not exists (
       select 1 from public.players p where p.id = new.assist_id and p.team_id = new.team_id) then
    raise exception 'Asistent ne pripada ekipi koja je označena u događaju.';
  end if;
  if new.team_id not in (select home_team_id from public.matches where id = new.match_id union
                         select away_team_id from public.matches where id = new.match_id) then
    raise exception 'Ekipa ne igra u ovoj utakmici.';
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_match_event on public.match_events;
create trigger trg_validate_match_event before insert or update on public.match_events
  for each row execute function public.validate_match_event();

-- ---------- Vijesti ----------
create table if not exists public.news (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 160),
  slug        text unique not null,
  excerpt     text,
  body        text not null default '',
  cover_url   text,
  published   boolean not null default false,
  author_id   uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Galerija ----------
create table if not exists public.gallery (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  media_url   text not null,
  media_type  text not null default 'image' check (media_type in ('image','video')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- Chat ----------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  username   text not null,
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists messages_created_idx on public.messages (created_at desc);

-- Ime u poruci uvijek dolazi iz profila (ne može se lažirati) + spam zaštita
create or replace function public.stamp_message()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uname text;
begin
  select username into uname from public.profiles where id = new.user_id;
  new.username := coalesce(uname, 'korisnik');
  if exists (select 1 from public.messages
             where user_id = new.user_id and created_at > now() - interval '2 seconds') then
    raise exception 'Malo sporije, pošalji poruku za trenutak.';
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_message on public.messages;
create trigger trg_stamp_message before insert on public.messages
  for each row execute function public.stamp_message();

-- ---------- Tabela (standings) ----------
create or replace view public.standings with (security_invoker = true) as
with active as (select id from public.seasons where is_active),
finished as (
  select m.* from public.matches m where m.status = 'finished'
    and m.season_id in (select id from active)
),
rows_ as (
  select home_team_id as team_id, home_score as gf, away_score as ga,
         case when home_score > away_score then 3 when home_score = away_score then 1 else 0 end as pts,
         case when home_score > away_score then 1 else 0 end as w,
         case when home_score = away_score then 1 else 0 end as d,
         case when home_score < away_score then 1 else 0 end as l
  from finished
  union all
  select away_team_id, away_score, home_score,
         case when away_score > home_score then 3 when away_score = home_score then 1 else 0 end,
         case when away_score > home_score then 1 else 0 end,
         case when away_score = home_score then 1 else 0 end,
         case when away_score < home_score then 1 else 0 end
  from finished
)
select t.id as team_id, t.name, t.short_name, t.logo_url, t.color,
       count(r.team_id)::int          as played,
       coalesce(sum(r.w),0)::int      as won,
       coalesce(sum(r.d),0)::int      as drawn,
       coalesce(sum(r.l),0)::int      as lost,
       coalesce(sum(r.gf),0)::int     as goals_for,
       coalesce(sum(r.ga),0)::int     as goals_against,
       (coalesce(sum(r.gf),0) - coalesce(sum(r.ga),0))::int as goal_diff,
       coalesce(sum(r.pts),0)::int    as points
from public.teams t
left join rows_ r on r.team_id = t.id
where t.season_id in (select id from active)
group by t.id, t.name, t.short_name, t.logo_url, t.color;

-- ---------- RLS ----------
alter table public.profiles      enable row level security;
alter table public.seasons       enable row level security;
alter table public.teams         enable row level security;
alter table public.players       enable row level security;
alter table public.matches       enable row level security;
alter table public.match_events  enable row level security;
alter table public.news          enable row level security;
alter table public.gallery       enable row level security;
alter table public.messages      enable row level security;

-- Profili: javno čitanje, korisnik mijenja samo svoj
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Javni sportski podaci: svi čitaju, samo admin piše
do $$
declare t text;
begin
  foreach t in array array['seasons','teams','players','matches','match_events'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_admin_write', t);
  end loop;
end $$;

-- Vijesti: javno samo objavljene; urednik i admin vide i piše sve
drop policy if exists news_read_published on public.news;
create policy news_read_published on public.news for select using ((published and coalesce(published_at, now()) <= now()) or public.is_staff());
drop policy if exists news_staff_write on public.news;
create policy news_staff_write on public.news for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Galerija: javno čitanje, urednik i admin dodaju/brišu
drop policy if exists gallery_read on public.gallery;
create policy gallery_read on public.gallery for select using (true);
drop policy if exists gallery_staff_write on public.gallery;
create policy gallery_staff_write on public.gallery for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Chat: svi čitaju, prijavljeni šalju kao sebe, brišu svoje (admin sve)
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select using (true);
drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- Realtime (uživo utakmice, chat, vijesti) ----------
do $$
declare t text;
begin
  foreach t in array array['matches','match_events','messages','news'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Privilegije ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.seasons, public.teams, public.players, public.matches,
  public.match_events, public.news, public.gallery, public.messages, public.profiles,
  public.standings to anon, authenticated;
grant insert, update, delete on public.seasons, public.teams, public.players, public.matches,
  public.match_events, public.news, public.gallery, public.profiles to authenticated;
grant insert, delete on public.messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_admin(), public.is_staff(), public.current_role_name() to anon, authenticated;

-- =====================================================================
-- FAN GAME: navijači pogađaju rezultat prije početka utakmice
-- Bodovi: tačan ishod (1/X/2) = 3, tačan rezultat = +2 (ukupno 5)
-- =====================================================================
create table if not exists public.fan_predictions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    uuid not null references public.matches(id) on delete cascade,
  home_pred   int not null check (home_pred between 0 and 30),
  away_pred   int not null check (away_pred between 0 and 30),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, match_id)
);

-- Bodovi po pogađanju (računa se tek kad je utakmica završena)
create or replace view public.fan_points with (security_invoker = true) as
select p.id, p.user_id, p.match_id, m.season_id,
  case when m.status = 'finished' then
    (case when sign(p.home_pred - p.away_pred) = sign(m.home_score - m.away_score) then 3 else 0 end
     + case when p.home_pred = m.home_score and p.away_pred = m.away_score then 2 else 0 end)
  end as points,
  case when m.status = 'finished'
        and p.home_pred = m.home_score and p.away_pred = m.away_score then 1 else 0 end as exact_hit
from public.fan_predictions p
join public.matches m on m.id = p.match_id;

-- Rang lista za aktivnu sezonu
create or replace view public.fan_leaderboard with (security_invoker = true) as
select pr.id as user_id, pr.username, pr.display_name,
       coalesce(sum(fp.points), 0)::int   as points,
       coalesce(sum(fp.exact_hit), 0)::int as exact_hits,
       count(fp.id)::int                  as predictions
from public.profiles pr
join public.fan_points fp on fp.user_id = pr.id
join public.seasons s on s.id = fp.season_id and s.is_active
group by pr.id, pr.username, pr.display_name;

-- Pogađanje je dozvoljeno samo dok utakmica nije počela
alter table public.fan_predictions enable row level security;
drop policy if exists fan_pred_read on public.fan_predictions;
create policy fan_pred_read on public.fan_predictions for select using (true);
drop policy if exists fan_pred_insert on public.fan_predictions;
create policy fan_pred_insert on public.fan_predictions for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.matches m where m.id = match_id
      and m.status = 'scheduled' and m.scheduled_at > now()));
drop policy if exists fan_pred_update on public.fan_predictions;
create policy fan_pred_update on public.fan_predictions for update to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.matches m where m.id = match_id
      and m.status = 'scheduled' and m.scheduled_at > now()))
  with check (user_id = auth.uid());
drop policy if exists fan_pred_delete on public.fan_predictions;
create policy fan_pred_delete on public.fan_predictions for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- =====================================================================
-- ZAJEDNICA: objave, komentari, lajkovi
-- =====================================================================
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 1000),
  image_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts (created_at desc);

create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  username    text not null,
  content     text not null check (char_length(content) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

create table if not exists public.post_likes (
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Ime u komentaru uvijek iz profila (kao kod chata)
create or replace function public.stamp_comment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare uname text;
begin
  select username into uname from public.profiles where id = new.user_id;
  new.username := coalesce(uname, 'korisnik');
  return new;
end $$;

drop trigger if exists trg_stamp_comment on public.post_comments;
create trigger trg_stamp_comment before insert on public.post_comments
  for each row execute function public.stamp_comment();

-- Feed s brojačima (lajkovi, komentari) i autorom
create or replace view public.post_feed with (security_invoker = true) as
select p.id, p.user_id, p.content, p.image_url, p.created_at,
       pr.username, pr.display_name, pr.avatar_url,
       (select count(*) from public.post_likes l where l.post_id = p.id)::int    as likes,
       (select count(*) from public.post_comments c where c.post_id = p.id)::int as comments
from public.posts p
join public.profiles pr on pr.id = p.user_id;

alter table public.posts         enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes    enable row level security;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (true);
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists comments_read on public.post_comments;
create policy comments_read on public.post_comments for select using (true);
drop policy if exists comments_insert_own on public.post_comments;
create policy comments_insert_own on public.post_comments for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists comments_delete on public.post_comments;
create policy comments_delete on public.post_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists likes_read on public.post_likes;
create policy likes_read on public.post_likes for select using (true);
drop policy if exists likes_insert_own on public.post_likes;
create policy likes_insert_own on public.post_likes for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists likes_delete_own on public.post_likes;
create policy likes_delete_own on public.post_likes for delete to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- MEDIJI: Storage bucket "media" (galerija, vijesti, slike u objavama)
-- Staff (admin/urednik) upload u bilo koji folder; korisnici samo u posts/<svoj-uid>/
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15728640,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');

drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (
    public.is_staff()
    or ((storage.foldername(name))[1] = 'posts' and (storage.foldername(name))[2] = auth.uid()::text)
  ));

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and (public.is_staff() or owner_id = (select auth.uid()::text)));

-- =====================================================================
-- PUSH OBAVJEŠTENJA: pretplate (čita ih samo server, Edge Function send-push)
-- =====================================================================
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime za objave i komentare
do $$
declare t text;
begin
  foreach t in array array['posts','post_comments','post_likes','fan_predictions'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Privilegije za nove objekte
grant select on public.fan_predictions, public.posts, public.post_comments, public.post_likes,
  public.fan_points, public.fan_leaderboard, public.post_feed to anon, authenticated;
grant insert, update, delete on public.fan_predictions to authenticated;
grant insert, delete on public.posts, public.post_comments, public.post_likes to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------- Prvi admin ----------
-- Nakon što se registruješ na sajtu, u SQL Editoru pokreni (zamijeni username):
--   update public.profiles set role = 'admin' where username = 'tvoj_username';


-- =====================================================================
-- SECURITY HARDENING (also stored as post-initialization migrations)
-- =====================================================================
create or replace function public.current_role_name()
returns text language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce((select p.role from public.profiles p where p.id = (select auth.uid())), 'anon')
$$;

create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role = 'admin')
$$;

create or replace function public.is_staff()
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.role in ('admin','editor'))
$$;

create or replace function public.guard_profile_role()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Nemaš pravo da mijenjaš ulogu.';
  end if;
  return new;
end $$;

revoke execute on function public.current_role_name() from public, anon, authenticated;
revoke execute on function public.guard_profile_role() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.recalc_match_score() from public, anon, authenticated;
revoke execute on function public.stamp_comment() from public, anon, authenticated;
revoke execute on function public.stamp_message() from public, anon, authenticated;

drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles for insert to authenticated with check ((select public.is_admin()));
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete to authenticated using ((select public.is_admin()));

do $$
declare t text;
begin
  foreach t in array array['seasons','teams','players','matches','match_events'] loop
    execute format('drop policy if exists %I on public.%I', t||'_admin_write', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t||'_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t||'_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t||'_admin_delete', t);
  end loop;
end $$;

drop policy if exists news_staff_write on public.news;
drop policy if exists news_staff_insert on public.news;
drop policy if exists news_staff_update on public.news;
drop policy if exists news_staff_delete on public.news;
create policy news_staff_insert on public.news for insert to authenticated with check ((select public.is_staff()));
create policy news_staff_update on public.news for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy news_staff_delete on public.news for delete to authenticated using ((select public.is_staff()));

drop policy if exists gallery_staff_write on public.gallery;
drop policy if exists gallery_staff_insert on public.gallery;
drop policy if exists gallery_staff_update on public.gallery;
drop policy if exists gallery_staff_delete on public.gallery;
create policy gallery_staff_insert on public.gallery for insert to authenticated with check ((select public.is_staff()));
create policy gallery_staff_update on public.gallery for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
create policy gallery_staff_delete on public.gallery for delete to authenticated using ((select public.is_staff()));

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists fan_pred_insert on public.fan_predictions;
create policy fan_pred_insert on public.fan_predictions for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.matches m
    where m.id = match_id and m.status = 'scheduled' and m.scheduled_at > now()));
drop policy if exists fan_pred_update on public.fan_predictions;
create policy fan_pred_update on public.fan_predictions for update to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.matches m
    where m.id = match_id and m.status = 'scheduled' and m.scheduled_at > now()))
  with check (user_id = (select auth.uid()));
drop policy if exists fan_pred_delete on public.fan_predictions;
create policy fan_pred_delete on public.fan_predictions for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists comments_insert_own on public.post_comments;
create policy comments_insert_own on public.post_comments for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists comments_delete on public.post_comments;
create policy comments_delete on public.post_comments for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists likes_insert_own on public.post_likes;
create policy likes_insert_own on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists likes_delete_own on public.post_likes;
create policy likes_delete_own on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and ((select public.is_staff()) or owner_id = (select auth.uid()::text)));

create index if not exists fan_predictions_match_idx on public.fan_predictions(match_id);
create index if not exists gallery_uploaded_by_idx on public.gallery(uploaded_by);
create index if not exists match_events_assist_idx on public.match_events(assist_id);
create index if not exists match_events_player_idx on public.match_events(player_id);
create index if not exists match_events_team_idx on public.match_events(team_id);
create index if not exists matches_home_team_idx on public.matches(home_team_id);
create index if not exists matches_away_team_idx on public.matches(away_team_id);
create index if not exists messages_user_idx on public.messages(user_id);
create index if not exists news_author_idx on public.news(author_id);
create index if not exists post_comments_user_idx on public.post_comments(user_id);
create index if not exists post_likes_user_idx on public.post_likes(user_id);
create index if not exists posts_user_idx on public.posts(user_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Fan-game individual predictions are private. Public clients may only read
-- aggregate directional percentages and an anonymized leaderboard.
drop policy if exists fan_pred_read on public.fan_predictions;
create policy fan_pred_read on public.fan_predictions for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace view public.fan_prediction_distribution with (security_invoker = false) as
select p.match_id, count(*)::int as total,
       sum(case when p.home_pred > p.away_pred then 1 else 0 end)::int as home_wins,
       sum(case when p.home_pred = p.away_pred then 1 else 0 end)::int as draws,
       sum(case when p.home_pred < p.away_pred then 1 else 0 end)::int as away_wins
from public.fan_predictions p group by p.match_id;

create or replace view public.fan_leaderboard with (security_invoker = false) as
with scored as (
  select p.user_id, m.season_id,
    case when m.status = 'finished' then
      (case when sign(p.home_pred - p.away_pred) = sign(m.home_score - m.away_score) then 3 else 0 end
       + case when p.home_pred = m.home_score and p.away_pred = m.away_score then 2 else 0 end) end as points,
    case when m.status = 'finished' and p.home_pred = m.home_score and p.away_pred = m.away_score then 1 else 0 end as exact_hit
  from public.fan_predictions p join public.matches m on m.id = p.match_id
  join public.seasons s on s.id = m.season_id and s.is_active
)
select pr.id as user_id, pr.username, pr.display_name,
       coalesce(sum(sc.points), 0)::int as points,
       coalesce(sum(sc.exact_hit), 0)::int as exact_hits,
       count(sc.user_id)::int as predictions
from public.profiles pr join scored sc on sc.user_id = pr.id
group by pr.id, pr.username, pr.display_name;

grant select on public.fan_prediction_distribution, public.fan_leaderboard to anon, authenticated;


-- Public fan stats are exposed through aggregate-only RPCs rather than SECURITY DEFINER views.
drop view if exists public.fan_prediction_distribution;
drop view if exists public.fan_leaderboard;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.get_fan_prediction_distribution(p_match_ids uuid[])
returns table(match_id uuid, total integer, home_wins integer, draws integer, away_wins integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.match_id, count(*)::int,
         sum(case when p.home_pred > p.away_pred then 1 else 0 end)::int,
         sum(case when p.home_pred = p.away_pred then 1 else 0 end)::int,
         sum(case when p.home_pred < p.away_pred then 1 else 0 end)::int
  from public.fan_predictions p
  where p.match_id = any(p_match_ids)
  group by p.match_id
$$;

create or replace function private.get_fan_leaderboard()
returns table(user_id uuid, username text, display_name text, points integer, exact_hits integer, predictions integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with scored as (
    select p.user_id,
      case when m.status = 'finished' then
        (case when sign(p.home_pred - p.away_pred) = sign(m.home_score - m.away_score) then 3 else 0 end
         + case when p.home_pred = m.home_score and p.away_pred = m.away_score then 2 else 0 end)
      end as points,
      case when m.status = 'finished' and p.home_pred = m.home_score and p.away_pred = m.away_score then 1 else 0 end as exact_hit
    from public.fan_predictions p
    join public.matches m on m.id = p.match_id
    join public.seasons s on s.id = m.season_id and s.is_active
  )
  select pr.id, pr.username, pr.display_name, coalesce(sum(sc.points), 0)::int,
         coalesce(sum(sc.exact_hit), 0)::int, count(sc.user_id)::int
  from public.profiles pr join scored sc on sc.user_id = pr.id
  group by pr.id, pr.username, pr.display_name
$$;

revoke all on function private.get_fan_prediction_distribution(uuid[]) from public, anon, authenticated;
revoke all on function private.get_fan_leaderboard() from public, anon, authenticated;
grant execute on function private.get_fan_prediction_distribution(uuid[]) to anon, authenticated;
grant execute on function private.get_fan_leaderboard() to anon, authenticated;

create or replace function public.get_fan_prediction_distribution(match_ids uuid[])
returns table(match_id uuid, total integer, home_wins integer, draws integer, away_wins integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  select * from private.get_fan_prediction_distribution(match_ids)
$$;

create or replace function public.get_fan_leaderboard()
returns table(user_id uuid, username text, display_name text, points integer, exact_hits integer, predictions integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  select * from private.get_fan_leaderboard()
$$;

grant execute on function public.get_fan_prediction_distribution(uuid[]), public.get_fan_leaderboard() to anon, authenticated;

-- ---------- Statistika igrača (aktivna sezona) ----------
create or replace view public.player_stats with (security_invoker = true) as
with active as (
  select id from public.seasons where is_active
),
ev as (
  select e.*
  from public.match_events e
  join public.matches m on m.id = e.match_id
  where m.season_id in (select id from active)
    and m.status in ('live', 'paused', 'finished')
)
select
  p.id as player_id,
  p.first_name,
  p.last_name,
  p.number,
  t.id as team_id,
  t.name as team_name,
  t.short_name,
  count(ev.id) filter (where ev.type = 'goal' and ev.player_id = p.id)::int as goals,
  count(ev.id) filter (where ev.assist_id = p.id)::int as assists,
  count(ev.id) filter (where ev.type = 'yellow' and ev.player_id = p.id)::int as yellow,
  count(ev.id) filter (where ev.type = 'red' and ev.player_id = p.id)::int as red
from public.players p
join public.teams t on t.id = p.team_id
left join ev on (ev.player_id = p.id or ev.assist_id = p.id)
where t.season_id in (select id from active)
group by p.id, p.first_name, p.last_name, p.number, t.id, t.name, t.short_name;

grant select on public.player_stats to anon, authenticated;

-- v5 extension block follows; source of incremental migration: supabase/migrations/20261026_v5_features.sql
-- Međasi Futsal Liga v5: scheduled news, audit trail, reports, warnings, MVP and match comments
-- Safe to re-run against the existing v2 database.

-- Public news must remain hidden until its publication time.
drop policy if exists news_read_published on public.news;
create policy news_read_published on public.news for select using (
  (published and coalesce(published_at, now()) <= now()) or (select public.is_staff())
);

alter table public.matches
  add column if not exists reminder_sent boolean not null default false;

-- Admin audit trail.
create table if not exists public.admin_audit (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  action text not null,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists audit_admin_read on public.admin_audit;
create policy audit_admin_read on public.admin_audit
  for select to authenticated using ((select public.is_admin()));
grant select on public.admin_audit to authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare rid text;
begin
  if tg_op = 'DELETE' then rid := old.id::text; else rid := new.id::text; end if;
  insert into public.admin_audit(actor_id, table_name, action, row_id, old_data, new_data)
  values (
    auth.uid(), tg_table_name, tg_op, rid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

drop trigger if exists trg_audit_matches on public.matches;
create trigger trg_audit_matches
after insert or delete or update of status, home_score, away_score, scheduled_at, venue
on public.matches for each row execute function public.audit_row();
drop trigger if exists trg_audit_events on public.match_events;
create trigger trg_audit_events after insert or delete
on public.match_events for each row execute function public.audit_row();
drop trigger if exists trg_audit_news on public.news;
create trigger trg_audit_news after insert or update or delete
on public.news for each row execute function public.audit_row();
drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after update of role
on public.profiles for each row execute function public.audit_row();
drop trigger if exists trg_audit_teams on public.teams;
create trigger trg_audit_teams after insert or update or delete
on public.teams for each row execute function public.audit_row();

-- User-generated content reports.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
alter table public.reports enable row level security;
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists reports_update_staff on public.reports;
create policy reports_update_staff on public.reports
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));
grant select, insert, update on public.reports to authenticated;

-- Private warnings visible to the warned user and staff.
create table if not exists public.user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 3 and 500),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.user_warnings enable row level security;
drop policy if exists warnings_read on public.user_warnings;
create policy warnings_read on public.user_warnings
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
drop policy if exists warnings_staff_insert on public.user_warnings;
create policy warnings_staff_insert on public.user_warnings
  for insert to authenticated with check ((select public.is_staff()) and (created_by is null or created_by = (select auth.uid())));
grant select, insert on public.user_warnings to authenticated;

-- MVP voting: one vote per user per finished match, only for participating players.
create table if not exists public.mvp_votes (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create or replace function public.validate_mvp_vote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.matches m
    join public.players p on p.id = new.player_id
    where m.id = new.match_id
      and m.status = 'finished'
      and p.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'MVP glasanje je moguće samo za igrača iz završene utakmice.';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_mvp on public.mvp_votes;
create trigger trg_validate_mvp before insert or update
on public.mvp_votes for each row execute function public.validate_mvp_vote();

alter table public.mvp_votes enable row level security;
drop policy if exists mvp_read on public.mvp_votes;
create policy mvp_read on public.mvp_votes for select to anon, authenticated using (true);
drop policy if exists mvp_insert_own on public.mvp_votes;
create policy mvp_insert_own on public.mvp_votes
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists mvp_update_own on public.mvp_votes;
create policy mvp_update_own on public.mvp_votes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select on public.mvp_votes to anon, authenticated;
grant insert, update on public.mvp_votes to authenticated;

create or replace view public.mvp_results with (security_invoker = true) as
select match_id, player_id, count(*)::int as votes
from public.mvp_votes
group by match_id, player_id;
grant select on public.mvp_results to anon, authenticated;

-- Match-specific chat; the existing trigger securely stamps display names from profiles.
create table if not exists public.match_comments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  content text not null check (char_length(content) between 1 and 400),
  created_at timestamptz not null default now()
);
create index if not exists match_comments_idx on public.match_comments (match_id, created_at);
drop trigger if exists trg_stamp_match_comment on public.match_comments;
create trigger trg_stamp_match_comment before insert
on public.match_comments for each row execute function public.stamp_comment();
alter table public.match_comments enable row level security;
drop policy if exists mc_read on public.match_comments;
create policy mc_read on public.match_comments for select to anon, authenticated using (true);
drop policy if exists mc_insert_own on public.match_comments;
create policy mc_insert_own on public.match_comments
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists mc_delete on public.match_comments;
create policy mc_delete on public.match_comments
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_staff()));
grant select on public.match_comments to anon, authenticated;
grant insert, delete on public.match_comments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_comments'
  ) then
    alter publication supabase_realtime add table public.match_comments;
  end if;
end $$;

-- These are trigger-only helpers; clients must not call them directly.
revoke all on function public.audit_row() from public, anon, authenticated;
revoke all on function public.validate_mvp_vote() from public, anon, authenticated;

-- Newsletter: kept in sync with migrations/20261027_newsletter.sql
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


-- Sastavi, zamjene, ocjene i odbrane po utakmici.
-- Sastavi, zamjene, ocjene i odbrane po utakmici.
create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  is_starter boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
create index if not exists match_players_team_idx on public.match_players(team_id);
create table if not exists public.match_substitutions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_out_id uuid not null references public.players(id) on delete cascade,
  player_in_id uuid not null references public.players(id) on delete cascade,
  minute int not null default 0 check (minute between 0 and 200),
  created_at timestamptz not null default now(),
  check (player_out_id <> player_in_id)
);
create index if not exists match_substitutions_match_idx on public.match_substitutions(match_id);
create table if not exists public.match_player_stats (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  rating numeric(3,1) check (rating is null or rating between 1 and 10),
  saves int not null default 0 check (saves between 0 and 99),
  primary key (match_id, player_id)
);
create or replace function public.validate_match_player()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.matches m where m.id = new.match_id and new.team_id in (m.home_team_id, m.away_team_id)) then
    raise exception 'Ekipa ne igra u ovoj utakmici.';
  end if;
  if not exists (select 1 from public.players p where p.id = new.player_id and p.team_id = new.team_id) then
    raise exception 'Igrač ne pripada ekipi.';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_match_player on public.match_players;
create trigger trg_validate_match_player before insert or update on public.match_players for each row execute function public.validate_match_player();
drop trigger if exists trg_validate_match_player_stats on public.match_player_stats;
create trigger trg_validate_match_player_stats before insert or update on public.match_player_stats for each row execute function public.validate_match_player();
create or replace function public.validate_match_substitution()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.player_out_id and mp.team_id = new.team_id and mp.is_starter) then
    raise exception 'Igrač koji izlazi mora biti u startnoj postavi te ekipe.';
  end if;
  if not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.player_in_id and mp.team_id = new.team_id and not mp.is_starter) then
    raise exception 'Igrač koji ulazi mora biti na klupi te ekipe.';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_match_substitution on public.match_substitutions;
create trigger trg_validate_match_substitution before insert or update on public.match_substitutions for each row execute function public.validate_match_substitution();
alter table public.match_players enable row level security;
alter table public.match_substitutions enable row level security;
alter table public.match_player_stats enable row level security;
drop policy if exists match_players_read on public.match_players;
create policy match_players_read on public.match_players for select using (true);
drop policy if exists match_players_admin on public.match_players;
create policy match_players_admin on public.match_players for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists match_substitutions_read on public.match_substitutions;
create policy match_substitutions_read on public.match_substitutions for select using (true);
drop policy if exists match_substitutions_admin on public.match_substitutions;
create policy match_substitutions_admin on public.match_substitutions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists match_player_stats_read on public.match_player_stats;
create policy match_player_stats_read on public.match_player_stats for select using (true);
drop policy if exists match_player_stats_admin on public.match_player_stats;
create policy match_player_stats_admin on public.match_player_stats for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.match_players, public.match_substitutions, public.match_player_stats from public, anon, authenticated;
grant select on public.match_players, public.match_substitutions, public.match_player_stats to anon, authenticated;
grant insert, update, delete on public.match_players, public.match_substitutions, public.match_player_stats to authenticated;
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['match_players','match_substitutions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
