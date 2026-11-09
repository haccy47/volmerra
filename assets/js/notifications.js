/* ============================================================
   VOLMERRA — Notifications
   ------------------------------------------------------------
   Per-user in-app notifications stored in localStorage. New
   chapter releases (and admin publishes) add entries for the
   signed-in reader who witnesses the event on the site.

   Honest limit: this is in-app, per-browser notification
   history. Real push/email delivery to users who are offline
   requires the future backend.
   ============================================================ */

(function () {
  "use strict";

  function keyFor(userId) {
    return "volmerra:notifications:" + userId;
  }

  function read(userId) {
    try {
      return JSON.parse(localStorage.getItem(keyFor(userId))) || [];
    } catch (e) {
      return [];
    }
  }

  function write(userId, list) {
    localStorage.setItem(keyFor(userId), JSON.stringify(list.slice(0, 50)));
  }

  window.VolmerraNotifications = {
    /* Per-account preference: chapter release notifications on/off. */
    prefOff: function () {
      var u = window.VolmerraAuth.currentUser();
      if (!u) return false;
      try {
        return (
          localStorage.getItem("volmerra:pref:notify:" + u.id) === "off"
        );
      } catch (e) {
        return false;
      }
    },

    /* The signed-in user's notifications, newest first. Guests have
       no notification history. */
    list: function () {
      var u = window.VolmerraAuth.currentUser();
      return u ? read(u.id) : [];
    },

    unread: function () {
      return this.list().filter(function (n) {
        return !n.read;
      }).length;
    },

    markAllRead: function () {
      var u = window.VolmerraAuth.currentUser();
      if (!u) return;
      var list = read(u.id).map(function (n) {
        n.read = true;
        return n;
      });
      write(u.id, list);
    },

    /* add({ title, body, href }) — newest first, capped at 50.
       Respects the reader's notification preference. */
    add: function (notification) {
      if (this.prefOff()) return;
      var u = window.VolmerraAuth.currentUser();
      if (!u || !notification || !notification.title) return;
      var list = read(u.id);
      var entry = {
        id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: String(notification.title),
        body: notification.body ? String(notification.body) : "",
        href: notification.href || "",
        read: false,
        at: new Date().toISOString(),
      };
      /* Avoid exact duplicates (same title + href added twice in a row). */
      if (
        list.length &&
        list[0].title === entry.title &&
        list[0].href === entry.href
      ) {
        return;
      }
      list.unshift(entry);
      write(u.id, list);
      document.dispatchEvent(new CustomEvent("volmerra:notifications-updated"));
    },
  };
})();