/* ============================================================
   VOLMERRA — Service worker
   ------------------------------------------------------------
   Telefon bildirimlerini karşılar: yayıncı bir bölüm
   yayınladığında Edge Function buraya push gönderir ve
   işletim sistemi bildirimi gösterilir. Bildirime basınca
   ilgili bölüm açılır.
   ============================================================ */

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "VOLMERRA", body: "Yeni bölüm yayında." };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "VOLMERRA", {
      body: data.body || "",
      icon: data.icon || "/icon.svg",
      badge: data.icon || "/icon.svg",
      tag: "volmerra-new-chapter",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var client = list[i];
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
