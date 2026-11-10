// ============================================================
// VOLMERRA — Supabase Edge Function: notify-new-chapter
// ------------------------------------------------------------
// Yeni bir bölüm yayınlandığında, kayıtlı telefonlara Web Push
// bildirimi gönderir. Zamanı geçmiş planlanmış bölümleri de
// yayınlar (cron'dan da çağrılabilir).
//
// KURULUM (Supabase Dashboard'da):
//   1) Edge Functions → Create a new function → "Deploy from editor"
//   2) Adını "notify-new-chapter" yap
//   3) Aşağıdaki kodu yapıştır — Admin → Website sayfasındaki
//      "Telefon bildirimleri" panelinden ürettiğin VAPID
//      anahtarlarını __VAPID_PUBLIC__ ve __VAPID_PRIVATE__
//      yerlerine yaz
//   4) Deploy
//   (Not: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam
//    değişkenleri Edge Function'lara otomatik verilir.)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.3";

const VAPID_PUBLIC_KEY = "__VAPID_PUBLIC__";
const VAPID_PRIVATE_KEY = "__VAPID_PRIVATE__";

webpush.setVapidDetails(
  Deno.env.get("SUPABASE_URL")!,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Çağıran tarayıcının oturumu admin mi?
    const anonKey = req.headers.get("apikey") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin } = await caller.rpc("is_admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({
          error:
            "sadece yöneticiler bildirim gönderebilir (oturum yok veya admin değil)",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const service = createClient(supabaseUrl, serviceRoleKey);

    // Zamanı geçmiş planlanmış bölümleri yayınla (kron senaryosu için de)
    const { data: dueChapters } = await service.rpc("publish_due_chapters");

    let body: { chapter?: { number?: string; title?: string; id?: string } } =
      {};
    try {
      body = await req.json();
    } catch {
      /* gövde opsiyonel — cron'dan sade çağrılar için */
    }

    const published: { number: string; title: string; id: string }[] = [];
    if (body.chapter && body.chapter.id && body.chapter.title) {
      published.push({
        number: body.chapter.number || "",
        title: body.chapter.title,
        id: body.chapter.id,
      });
    }
    for (const c of (dueChapters as any[]) || []) {
      published.push({ number: c.number, title: c.title, id: c.id });
    }

    if (published.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Kayıtlı tüm telefon aboneliklerini çek (service role RLS'i bypass eder)
    const { data: subs } = await service
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    const results = await Promise.all(
      ((subs as any[]) || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({
              title: "Yeni bölüm yayınlandı — VOLMERRA",
              body: published
                .map((c) => `${c.number} — ${c.title}`)
                .join("  •  "),
              url: `/pages/chapter.html?id=${encodeURIComponent(published[0].id)}`,
            })
          );
          return { endpoint: s.endpoint, ok: true };
        } catch (e: any) {
          // 410 = abonelik artık geçersiz → temizle
          if (e?.statusCode === 410) {
            await service
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", s.endpoint);
          }
          return { endpoint: s.endpoint, ok: false };
        }
      })
    );

    const sent = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ sent, total: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
