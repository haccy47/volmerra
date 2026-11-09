/* ============================================================
   VOLMERRA — Seasonal accent system
   ------------------------------------------------------------
   Applies the active season's accent via data-season on <html>.
   The public website automatically uses the theme of the latest
   published season (seasons.js). The admin panel may preview any
   season's theme; the preview is session-scoped, applies only on
   admin pages, and never affects the public website.
   ============================================================ */

(function () {
  "use strict";

  var FALLBACK = "s1";

  function publicDefault() {
    if (window.VolmerraSeasons && window.VolmerraSeasons.latestPublished()) {
      return window.VolmerraSeasons.latestPublished();
    }
    return FALLBACK;
  }

  function currentSeason() {
    return document.documentElement.getAttribute("data-season") || FALLBACK;
  }

  function apply(season) {
    document.documentElement.setAttribute("data-season", season);
  }

  /* Public default: the latest published season. Admin previews are
     applied on DOMContentLoaded, once the admin context is known. */
  apply(publicDefault());

  window.VolmerraSeason = {
    list: function () {
      if (window.VolmerraSeasons) {
        return window.VolmerraSeasons.list().map(function (r) {
          return r.id;
        });
      }
      return ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
    },

    current: currentSeason,

    /* Admin theme preview only. */
    set: function (season) {
      if (window.VolmerraSeasons) window.VolmerraSeasons.setPreview(season);
      apply(season);
      syncPicker();
    },

    applyPublic: function () {
      apply(publicDefault());
      syncPicker();
    }
  };

  function syncPicker() {
    var previewing =
      window.VolmerraSeasons && window.VolmerraSeasons.isPreview();
    document.querySelectorAll(".season-option").forEach(function (btn) {
      var id = btn.getAttribute("data-season-id");
      var active =
        id === "auto" ? !previewing : previewing && id === currentSeason();
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
      if (id && id !== "auto") {
        btn.setAttribute("aria-label", id.toUpperCase() + " theme preview (admin only)");
      }
    });
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest(".season-option");
    if (!btn) return;
    var id = btn.getAttribute("data-season-id");
    if (id === "auto") {
      if (window.VolmerraSeasons) window.VolmerraSeasons.clearPreview();
      window.VolmerraSeason.applyPublic();
    } else {
      window.VolmerraSeason.set(id);
    }
  });

  /* When a season's status changes, the public theme follows. Admin
     previews are left untouched until cleared. */
  document.addEventListener("volmerra:seasons-updated", function () {
    var isAdmin =
      document.body && document.body.dataset.adminPage;
    if (!isAdmin || !window.VolmerraSeasons.isPreview()) {
      window.VolmerraSeason.applyPublic();
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    var isAdmin = document.body.dataset.adminPage;
    if (
      isAdmin &&
      window.VolmerraSeasons &&
      window.VolmerraSeasons.isPreview()
    ) {
      apply(window.VolmerraSeasons.getPreview());
    }
    syncPicker();
  });
})();
