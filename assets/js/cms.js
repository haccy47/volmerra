/* ============================================================
   VOLMERRA — CMS data layer
   ------------------------------------------------------------
   Central store for everything the admin panel manages besides
   chapters (which live in chapters.js): characters, locations,
   lore entries, gallery images, plus website settings, an
   activity log, and (until public commenting launches) the
   comments/reports moderation collections.

   Same architecture as chapters.js: every method is async and
   routed through a swappable storage adapter so a backend API
   adapter can replace the preview build's browser adapter
   without touching UI code. NOTE: this is a client-side preview
   store, not a database — content and admin authorization must
   move server-side before launch.
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "volmerra:cms";
  var COLLECTIONS = [
    "characters",
    "locations",
    "lore",
    "gallery",
    "comments",
    "reports",
  ];
  var SEASON_ORDER = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

  var localStorageAdapter = {
    read: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return Promise.reject(new Error("Could not read the CMS storage."));
      }
    },
    write: function (state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(new Error("Could not save the CMS storage."));
      }
    },
  };

  var adapter = localStorageAdapter;

  /* Central season visibility hook (registered by seasons.js). Public
     reads filter out entries bound to a non-public season. */
  var seasonVisibility = function () {
    return true;
  };
  if (window.VolmerraSeasons && window.VolmerraSeasons.isPublic) {
    seasonVisibility = window.VolmerraSeasons.isPublic;
  }

  var queue = Promise.resolve();
  function enqueue(operation) {
    var run = queue.then(operation);
    queue = run.catch(function () {});
    return run;
  }

  function makeId() {
    return (
      "m_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }

  function defaultSettings() {
    return {
      featuredChapterId: null,
      featuredCharacterId: null,
      announcement: { text: "", visible: false },
      sections: [
        { id: "hero", label: "Hero", visible: true },
        { id: "intro", label: "Introduction", visible: true },
        { id: "featured", label: "Featured story", visible: true },
        { id: "recent", label: "Recently published", visible: true },
        { id: "characters", label: "Character highlights", visible: true },
        { id: "explore", label: "Explore", visible: true },
      ],
    };
  }

  function defaultState() {
    return {
      characters: [],
      locations: [],
      lore: [],
      gallery: [],
      comments: [],
      reports: [],
      activity: [],
      settings: defaultSettings(),
    };
  }

  function readState() {
    return adapter.read().then(function (state) {
      if (!state) return defaultState();
      var base = defaultState();
      Object.keys(base).forEach(function (key) {
        if (state[key] == null) state[key] = base[key];
      });
      return state;
    });
  }

  window.VolmerraCMS = {
    setAdapter: function (replacement) {
      adapter = replacement;
    },

    setVisibility: function (fn) {
      if (typeof fn === "function") seasonVisibility = fn;
    },

    /* Seasonal portrait resolution for characters: one profile keeps
       all seasonal portraits (item.portraits.s1…s8). The portrait for
       a season falls back to the closest earlier PUBLISHED season that
       has one — future or unreleased seasons are never shown publicly —
       then to the character's default image, then null (the UI shows
       the default placeholder). Admin consumers can pass opts.all to
       preview unreleased seasons privately. */
    portraitFor: function (item, season, opts) {
      if (!item) return null;
      var portraits = item.portraits || {};
      var allowed = function (s) {
        return (opts && opts.all) || seasonVisibility(s);
      };
      if (season && portraits[season]) return portraits[season];
      var index = season ? SEASON_ORDER.indexOf(season) : -1;
      for (var i = index; i >= 0; i--) {
        var s = SEASON_ORDER[i];
        if (allowed(s) && portraits[s]) return portraits[s];
      }
      return item.image || null;
    },

    /* Seasons that have their own portrait, in order. Public consumers
       only see published seasons unless opts.all is passed (admin). */
    portraitSeasons: function (item, opts) {
      if (!item || !item.portraits) return [];
      return SEASON_ORDER.filter(function (season) {
        if (!item.portraits[season]) return false;
        return (opts && opts.all) || seasonVisibility(season);
      });
    },

    list: function (name, opts) {
      if (COLLECTIONS.indexOf(name) === -1) {
        return Promise.reject(new Error("Unknown collection."));
      }
      return readState().then(function (state) {
        var items = (state[name] || []).slice();
        /* Season visibility at the data layer: entries bound to an
           unreleased season are never returned to public consumers. */
        if (!(opts && opts.all)) {
          items = items.filter(function (item) {
            return !item.season || seasonVisibility(item.season);
          });
        }
        return items;
      });
    },

    create: function (name, data) {
      if (COLLECTIONS.indexOf(name) === -1) {
        return Promise.reject(new Error("Unknown collection."));
      }
      return enqueue(function () {
        return readState().then(function (state) {
          var item = Object.assign({}, data, {
            id: makeId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          state[name].push(item);
          return adapter.write(state).then(function () {
            return item;
          });
        });
      });
    },

    update: function (name, id, patch) {
      if (COLLECTIONS.indexOf(name) === -1) {
        return Promise.reject(new Error("Unknown collection."));
      }
      return enqueue(function () {
        return readState().then(function (state) {
          var item = state[name].find(function (entry) {
            return entry.id === id;
          });
          if (!item) throw new Error("Entry not found.");
          Object.keys(patch).forEach(function (key) {
            item[key] = patch[key];
          });
          item.updatedAt = new Date().toISOString();
          return adapter.write(state).then(function () {
            return item;
          });
        });
      });
    },

    remove: function (name, id) {
      if (COLLECTIONS.indexOf(name) === -1) {
        return Promise.reject(new Error("Unknown collection."));
      }
      return enqueue(function () {
        return readState().then(function (state) {
          state[name] = state[name].filter(function (entry) {
            return entry.id !== id;
          });
          return adapter.write(state);
        });
      });
    },

    /* Activity log: what was changed in the admin panel, newest first. */
    log: function (text) {
      return enqueue(function () {
        return readState().then(function (state) {
          state.activity.unshift({
            id: makeId(),
            text: String(text || ""),
            at: new Date().toISOString(),
          });
          state.activity = state.activity.slice(0, 50);
          return adapter.write(state);
        });
      });
    },

    activity: function () {
      return readState().then(function (state) {
        return state.activity.slice();
      });
    },

    settings: function () {
      return readState().then(function (state) {
        return Object.assign({}, defaultSettings(), state.settings || {});
      });
    },

    /* Public-safe announcement: returns the announcement only when it
       is visible AND its bound season (if any) is published. */
    publicAnnouncement: function () {
      return readState().then(function (state) {
        var a = state.settings.announcement || {};
        if (!a.visible) return null;
        if (a.season && !seasonVisibility(a.season)) return null;
        return Object.assign({}, a);
      });
    },

    saveSettings: function (patch) {
      return enqueue(function () {
        return readState().then(function (state) {
          state.settings = Object.assign(
            {},
            defaultSettings(),
            state.settings || {},
            patch
          );
          return adapter.write(state).then(function () {
            return state.settings;
          });
        });
      });
    },
  };
})();
