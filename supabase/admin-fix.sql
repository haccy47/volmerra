-- ============================================================
-- VOLMERRA — Admin yetkisi + publish düzeltmesi (tek dosya)
-- ------------------------------------------------------------
-- Ne zaman çalıştırılır:
--   "new row violates row-level security policy for table
--    site_state" hatası alındığında, veya admin (bölüm/CMS)
--    yazmaları reddedildiğinde.
--
-- Ne yapar:
--   A) Bölüm/CMS yazmalarını sunucu fonksiyonuna taşır
--      (upsert_state — RLS bypass, admin kontrolü fonksiyon içinde)
--   B) Aşağıdaki email hesabını admin yapar (emaili değiştirin)
--
-- Güvenli: tekrar çalıştırılabilir (idempotent).
-- ============================================================

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

-- Kendi hesabını admin yap (emaili kendi hesabınla değiştir):
update public.profiles set is_admin = true where email = 'imhaccy@gmail.com';


-- ============================================================
-- 2) TELEFON BİLDİRİMLERİ (Web Push) — tablolar
-- ============================================================
-- Yeni bölüm yayınlanınca kayıtlı telefonlara bildirim gider.
-- (schema.sql'de de var; tek yapıştırma ile her şey kurulsun diye
--  buraya da eklendi — idempotent, tekrar çalıştırmak zararsız.)

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

create policy "push_subscriptions: owner reads own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "push_subscriptions: owner inserts own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "push_subscriptions: owner deletes own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

create table if not exists public.push_config (
  id         int primary key default 1,
  public_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.push_config enable row level security;

create policy "push_config: herkes okur"
  on public.push_config for select
  using (true);

create policy "push_config: admin yazar (insert)"
  on public.push_config for insert
  with check (public.is_admin());

create policy "push_config: admin yazar (update)"
  on public.push_config for update
  using (public.is_admin())
  with check (public.is_admin());
