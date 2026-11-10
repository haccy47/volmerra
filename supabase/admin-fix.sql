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
