/* ============================================================
   VOLMERRA — Season release & visibility
   ------------------------------------------------------------
   Central authority for whether a season (S1–S8) is public.
   A season existing in the database does NOT make it publicly
   available: only seasons with status "published" (or "archived",
   i.e. once released) are public.

   The public website theme automatically follows the latest
   published season. The admin panel may preview unreleased
   themes (session-scoped, applied on admin pages only) — the
   preview never affects the public website.

   Statuses: unreleased → coming-soon (scheduled) → published →
   archived. Release dates are validated (must be a valid future
   date; released seasons cannot be scheduled again).

   Prototype limits (no backend yet): statuses are stored per
   browser through the same adapter pattern as the other data
   layers, and scheduled seasons release automatically only while
   the website is open. Reliable release scheduling and access
   control require backend support.
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "volmerra:season-statuses";
  var PREVIEW_KEY = "volmerra:season-preview";
  var SEASON_ORDER = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
  var STATUSES = ["unreleased", "coming-soon", "published", "archived"];

  function defaultState() {
    var seasons = {};
    SEASON_ORDER.forEach(function (id, i) {
      seasons[id] = {
        status: i === 0 ? "published" : "unreleased",
        publishedAt: i === 0 ? new Date().toISOString() : null,
        releaseAt: null
      };
    });
    return { seasons: seasons };
  }

  var cache = null;
  function loadCache() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      cache = raw ? JSON.parse(raw) : defaultState();
    } catch (e) {
      cache = defaultState();
    }
  }
  loadCache();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
      /* storage unavailable — statuses still apply for this visit */
    }
    document.dispatchEvent(new CustomEvent("volmerra:seasons-updated"));
  }

  function recordFor(season) {
    return {
      id: season,
      status: cache.seasons[season].status,
      publishedAt: cache.seasons[season].publishedAt,
      releaseAt: cache.seasons[season].releaseAt
    };
  }

  window.VolmerraSeasons = {
    list: function () {
      return SEASON_ORDER.map(recordFor);
    },

    get: function (season) {
      return SEASON_ORDER.indexOf(season) > -1 ? recordFor(season) : null;
    },

    /* The one visibility rule every public consumer goes through. */
    isPublic: function (season) {
      if (SEASON_ORDER.indexOf(season) === -1) return false;
      var status = cache.seasons[season].status;
      return status === "published" || status === "archived";
    },

    publicList: function () {
      var self = this;
      return SEASON_ORDER.filter(function (id) {
        return self.isPublic(id);
      });
    },

    /* Latest published (or archived) season — drives the public theme. */
    latestPublished: function () {
      for (var i = SEASON_ORDER.length - 1; i >= 0; i--) {
        if (this.isPublic(SEASON_ORDER[i])) return SEASON_ORDER[i];
      }
      return null;
    },

    setStatus: function (season, patch) {
      patch = patch || {};
      if (SEASON_ORDER.indexOf(season) === -1) {
        return Promise.reject(new Error("Unknown season."));
      }
      var record = cache.seasons[season];
      var next = patch.status || record.status;
      if (STATUSES.indexOf(next) === -1) {
        return Promise.reject(new Error("Unknown publication status."));
      }
      if (patch.releaseAt !== undefined && patch.releaseAt !== null) {
        if (record.status === "published" || record.status === "archived") {
          return Promise.reject(
            new Error(
              "This season is already released and cannot be scheduled again."
            )
          );
        }
        var t = new Date(patch.releaseAt).getTime();
        if (isNaN(t)) {
          return Promise.reject(new Error("The release date is invalid."));
        }
        if (t <= Date.now()) {
          return Promise.reject(
            new Error("The release date must be in the future.")
          );
        }
      }
      if (next === "coming-soon" && !record.releaseAt && !patch.releaseAt) {
        return Promise.reject(
          new Error(
            "Choose a release date and time, then press Schedule release."
          )
        );
      }

      record.status = next;
      if ("releaseAt" in patch) record.releaseAt = patch.releaseAt;
      if (next === "published") {
        if (!record.publishedAt) {
          record.publishedAt = new Date().toISOString();
        }
        record.releaseAt = null;
      }
      if (next === "unreleased") record.releaseAt = null;
      persist();

      var verbs = {
        "unreleased": "set to unreleased",
        "coming-soon": "scheduled for release",
        "published": "published",
        "archived": "archived"
      };
      if (window.VolmerraCMS) {
        window.VolmerraCMS.log(
          "Season " +
            season.toUpperCase() +
            " " +
            (verbs[next] || "updated")
        );
      }
      return Promise.resolve(recordFor(season));
    },

    /* Prototype auto-release: flips scheduled seasons whose time has
       passed to published while the website is open. Reliable release
       scheduling requires a server-side scheduler. */
    releaseDue: function () {
      var now = Date.now();
      var released = [];
      SEASON_ORDER.forEach(function (id) {
        var r = cache.seasons[id];
        if (
          r.status === "coming-soon" &&
          r.releaseAt &&
          new Date(r.releaseAt).getTime() <= now
        ) {
          r.status = "published";
          r.publishedAt = r.releaseAt;
          r.releaseAt = null;
          released.push(recordFor(id));
        }
      });
      if (released.length) persist();
      return Promise.resolve(released);
    },

    /* Admin theme preview — session-scoped and applied only on admin
       pages. Never affects the public website. */
    setPreview: function (season) {
      if (SEASON_ORDER.indexOf(season) === -1) return;
      try {
        sessionStorage.setItem(PREVIEW_KEY, season);
      } catch (e) {}
      document.dispatchEvent(new CustomEvent("volmerra:seasons-updated"));
    },

    clearPreview: function () {
      try {
        sessionStorage.removeItem(PREVIEW_KEY);
      } catch (e) {}
      document.dispatchEvent(new CustomEvent("volmerra:seasons-updated"));
    },

    getPreview: function () {
      try {
        return sessionStorage.getItem(PREVIEW_KEY);
      } catch (e) {
        return null;
      }
    },

    isPreview: function () {
      return !!this.getPreview();
    }
  };
})();
