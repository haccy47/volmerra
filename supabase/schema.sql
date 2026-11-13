-- ============================================================
-- VOLMERRA — Supabase schema (v1, idempotent)
-- ------------------------------------------------------------
-- Run the whole file in the Supabase dashboard → SQL Editor.
-- Safe to re-run any time: existing tables, policies and
-- triggers are kept, missing ones are created.
--
-- What it creates:
--   profiles          one row per account (display name, avatar,
--                     bio, is_admin role)
--   site_state        document store for chapters + CMS data
--                     (admins write, reads through RPCs)
--   comments          chapter comments (replies via parent_id)
--   comment_likes     one like per user per comment
--   library           per-user reading library (JSON document)
--   RPCs: is_admin(), has_admin(), claim_admin(),
--         read_state(key), publish_due_chapters()
--
-- Security model (Row Level Security):
--   - guests: read published/scheduled chapters, CMS content and
--     all comments; zero writes
--   - signed-in users: write their own comments, likes and library
--   - comment edit/delete: author only (RLS, not client checks)
--   - chapters/CMS writes: administrators only
--   - the admin role cannot be granted from the client: the one
--     time claim RPC only succeeds while no admin exists
-- ============================================================

-- ------------------------------------------------------------
-- 1) Helper functions (created first: policies reference them)
-- ------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.has_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where is_admin);
$$;

-- One-time ownership claim: succeeds only while the site has no
-- administrator. After the first claim it returns false forever
-- (roles are then managed from the Supabase dashboard).
create or replace function public.claim_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.profiles
     set is_admin = true,
         updated_at = now()
   where id = auth.uid()
     and not exists (select 1 from public.profiles where is_admin);

  select is_admin into claimed
    from public.profiles where id = auth.uid();

  return coalesce(claimed, false);
end;
$$;

-- ------------------------------------------------------------
-- 2) Profiles
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Reader',
  email        text not null default '',
  avatar       text,
  bio          text not null default '',
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create a profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1),
      'Reader'
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "profiles: read own or admins" on public.profiles;
create policy "profiles: read own or admins"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

-- A user may update their own profile but can never change their
-- own role; administrators can manage every profile.
drop policy if exists "profiles: update own without changing role" on public.profiles;
create policy "profiles: update own without changing role"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_admin = public.is_admin()
  );

drop policy if exists "profiles: admins manage every profile" on public.profiles;
create policy "profiles: admins manage every profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Public-safe profile lookup for the "view someone's profile"
-- feature: anyone (even guests) may fetch a profile's display
-- name, avatar, bio, admin badge and join date. The email column
-- is deliberately NOT exposed — profiles still allow "read own
-- or admins" only, so the raw rows (with emails) stay private.
create or replace function public.public_profile(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'displayName', p.display_name,
    'avatar',      p.avatar,
    'bio',         p.bio,
    'isAdmin',     p.is_admin,
    'joinedAt',    p.created_at
  )
  from public.profiles p
  where p.id = p_id;
$$;

revoke all on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 3) site_state — chapters + CMS document store
-- ------------------------------------------------------------

create table if not exists public.site_state (
  key        text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_state enable row level security;

-- No SELECT policy on purpose: direct reads are impossible.
-- Public/admin reads go through read_state(), writes need admin.
drop policy if exists "site_state: admins insert" on public.site_state;
create policy "site_state: admins insert"
  on public.site_state for insert
  with check (public.is_admin());

drop policy if exists "site_state: admins update" on public.site_state;
create policy "site_state: admins update"
  on public.site_state for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "site_state: admins delete" on public.site_state;
create policy "site_state: admins delete"
  on public.site_state for delete
  using (public.is_admin());

-- Public-safe read projection:
--   chapters -> published + scheduled chapters only (scheduled ones
--              power the public countdown hero; drafts stay hidden)
--   cms      -> everything except the internal moderation
--               collections (comments/reports copies)
create or replace function public.read_state(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  if p_key not in ('chapters', 'cms') then
    return null;
  end if;

  select data into v_data
    from public.site_state
   where key = p_key;

  if v_data is null then
    return null;
  end if;

  if public.is_admin() then
    return v_data;
  end if;

  if p_key = 'chapters' then
    return jsonb_build_object(
      'chapters',
      coalesce((
        select jsonb_agg(ch)
          from jsonb_array_elements(coalesce(v_data -> 'chapters', '[]'::jsonb)) ch
         where ch ->> 'status' in ('published', 'scheduled')
      ), '[]'::jsonb),
      'counters',
      coalesce(v_data -> 'counters', '{}'::jsonb)
    );
  end if;

  return v_data - 'comments' - 'reports';
end;
$$;

-- Scheduled publication without any visitor write access: flips
-- every scheduled chapter whose time has passed to published
-- (publishedAt falls back to the scheduled time, matching the
-- client behavior) and returns the published chapters.
create or replace function public.publish_due_chapters()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state     jsonb;
  v_published jsonb;
begin
  select data into v_state
    from public.site_state
   where key = 'chapters'
   for update;

  if v_state is null
     or jsonb_typeof(v_state -> 'chapters') is distinct from 'array' then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(ch), '[]'::jsonb) into v_published
    from jsonb_array_elements(v_state -> 'chapters') ch
   where ch ->> 'status' = 'scheduled'
     and ch ->> 'scheduledAt' is not null
     and (ch ->> 'scheduledAt')::timestamptz <= now();

  if coalesce(jsonb_array_length(v_published), 0) = 0 then
    return '[]'::jsonb;
  end if;

  update public.site_state
     set data = jsonb_set(
           v_state - 'chapters',
           '{chapters}',
           coalesce((
             select jsonb_agg(
                      case
                        when ch ->> 'status' = 'scheduled'
                             and ch ->> 'scheduledAt' is not null
                             and (ch ->> 'scheduledAt')::timestamptz <= now()
                        then jsonb_set(
                               jsonb_set(ch, '{status}', '"published"'::jsonb),
                               '{publishedAt}',
                               to_jsonb(coalesce(ch ->> 'publishedAt', ch ->> 'scheduledAt'))
                             )
                        else ch
                      end
                    )
               from jsonb_array_elements(v_state -> 'chapters') ch
           ), '[]'::jsonb)
         ),
         updated_at = now()
   where key = 'chapters';

  return v_published;
end;
$$;

-- ------------------------------------------------------------
-- 4) Comments (guests read; authors edit/delete their own)
-- ------------------------------------------------------------

-- Admin content writes (chapters + CMS) go through this RPC instead
-- of direct table writes: it verifies the caller's admin role
-- server-side and reports precise, human-readable errors (expired
-- session, wrong account) instead of a raw row-level security
-- violation.
create or replace function public.upsert_state(p_key text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean;
begin
  if p_key not in ('chapters', 'cms') then
    raise exception 'Unknown state key: %', p_key;
  end if;

  select coalesce(is_admin, false) into v_admin
    from public.profiles where id = v_uid;

  if v_uid is null then
    raise exception 'Oturum bulunamadı — sayfayı yenile ve tekrar giriş yap (oturum jetonu geçersiz).';
  end if;

  if not v_admin then
    raise exception 'Bu hesap yönetici değil: % (uid: %). Admin olan hesapla giriş yap veya SQL Editorde bu hesaba yetki ver.',
      coalesce((select display_name from public.profiles where id = v_uid), 'profil yok'),
      v_uid;
  end if;

  insert into public.site_state (key, data, updated_at)
  values (p_key, p_data, now())
  on conflict (key) do update
    set data = excluded.data, updated_at = now();

  return jsonb_build_object('ok', true, 'uid', v_uid, 'admin', true);
end;
$$;

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    text not null,
  parent_id     uuid references public.comments (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  author_name   text not null default 'Reader',
  author_avatar text,
  text          text not null check (char_length(text) between 1 and 2000),
  edited        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists comments_chapter_idx
  on public.comments (chapter_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "comments: everyone reads" on public.comments;
create policy "comments: everyone reads"
  on public.comments for select
  using (true);

drop policy if exists "comments: signed-in users write their own" on public.comments;
create policy "comments: signed-in users write their own"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "comments: only the author edits" on public.comments;
create policy "comments: only the author edits"
  on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "comments: only the author deletes" on public.comments;
create policy "comments: only the author deletes"
  on public.comments for delete
  using (auth.uid() = user_id);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes: everyone reads" on public.comment_likes;
create policy "comment_likes: everyone reads"
  on public.comment_likes for select
  using (true);

drop policy if exists "comment_likes: own like insert" on public.comment_likes;
create policy "comment_likes: own like insert"
  on public.comment_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "comment_likes: own like delete" on public.comment_likes;
create policy "comment_likes: own like delete"
  on public.comment_likes for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5) Library (per-user reading progress / favorites / saved)
-- ------------------------------------------------------------

create table if not exists public.library (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.library enable row level security;

drop policy if exists "library: owner reads" on public.library;
create policy "library: owner reads"
  on public.library for select
  using (auth.uid() = user_id);

drop policy if exists "library: owner inserts" on public.library;
create policy "library: owner inserts"
  on public.library for insert
  with check (auth.uid() = user_id);

drop policy if exists "library: owner updates" on public.library;
create policy "library: owner updates"
  on public.library for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "library: owner deletes" on public.library;
create policy "library: owner deletes"
  on public.library for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 6) Grants (Supabase sets most of these by default; explicit for
--    clarity. RLS decides what each role may actually do.)
-- ------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant execute on function
  public.is_admin(),
  public.has_admin(),
  public.claim_admin(),
  public.read_state(text),
  public.publish_due_chapters(),
  public.upsert_state(text, jsonb)
to anon, authenticated;

-- ------------------------------------------------------------
-- Done. Next steps (in the Supabase dashboard):
--   1. Authentication → Providers → Email: disable
--      "Confirm email" for instant sign-in during development.
--   2. Copy Project URL + anon public key into
--      assets/js/config.js (see config.example.js).
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- 7) Push bildirimler (telefona bölüm bildirimi — iOS 16.4+,
--    siteyi Ana Ekrana eklenmiş olmalı)
-- ------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: owner reads own" on public.push_subscriptions;
create policy "push_subscriptions: owner reads own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions: owner inserts own" on public.push_subscriptions;
create policy "push_subscriptions: owner inserts own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions: owner deletes own" on public.push_subscriptions;
create policy "push_subscriptions: owner deletes own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- VAPID public anahtarı (herkes okur — abonelik için gerekli;
-- sadece admin yazar)
create table if not exists public.push_config (
  id         int primary key default 1,
  public_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_config enable row level security;

drop policy if exists "push_config: herkes okur" on public.push_config;
create policy "push_config: herkes okur"
  on public.push_config for select
  using (true);

drop policy if exists "push_config: admin yazar (insert)" on public.push_config;
create policy "push_config: admin yazar (insert)"
  on public.push_config for insert
  with check (public.is_admin());

drop policy if exists "push_config: admin yazar (update)" on public.push_config;
create policy "push_config: admin yazar (update)"
  on public.push_config for update
  using (public.is_admin())
  with check (public.is_admin());
