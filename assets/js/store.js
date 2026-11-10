/* ============================================================
   VOLMERRA — Personal library store
   ------------------------------------------------------------
   Stores reading progress, favorites, saved chapters and
   reading history per user id. Two interchangeable persistence
   paths behind the same synchronous API:

   - localStorage (default, per browser, like the preview build)
   - a backend adapter (assets/js/supabase.js stores one row per
     user in the `library` table). The in-memory cache keeps the
     existing synchronous call sites working: every mutation
     updates the cache immediately and is pushed to the backend
     in the background. When the backend loads a user's row it
     installs it with _install() and fires "volmerra:library-
     loaded" so open pages can re-render.

   Chapter records are { id, title, percent } and reference
   chapters in the chapter data layer (chapters.js).

   prune(userId, validById) removes library references that no
   longer point at an existing, published, publicly accessible
   chapter (deleted, unpublished or unreleased-season chapters).
   Valid progress is never touched or reset.
   ============================================================ */

(function () {
  "use strict";

  var defaults = function () {
    return {
      continueReading: [],
      history: [],
      favorites: [],
      saved: [],
    };
  };

  var LIBRARY_LISTS = ["continueReading", "history", "favorites", "saved"];

  function keyFor(userId) {
    return "volmerra:library:" + userId;
  }

  /* Optional backend adapter: { save(userId, library) -> Promise }. */
  var adapter = null;

  /* In-memory cache: user id -> library. Keeps the synchronous
     API intact while the real backend loads/saves in the
     background. */
  var cache = {};

  function read(userId) {
    if (cache[userId]) {
      return cache[userId];
    }
    if (adapter) {
      /* Backend active but the row has not arrived yet. */
      return defaults();
    }
    try {
      var data = JSON.parse(localStorage.getItem(keyFor(userId)));
      return Object.assign(defaults(), data || {});
    } catch (e) {
      return defaults();
    }
  }

  function write(userId, library) {
    cache[userId] = library;
    if (adapter) {
      adapter.save(userId, library).catch(function (error) {
        console.warn(
          "Volmerra library could not be saved:",
          error && error.message
        );
      });
      return;
    }
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify(library));
    } catch (e) {
      /* storage unavailable — the library still applies for this visit */
    }
  }

  function upsert(list, chapter) {
    var rest = list.filter(function (item) {
      return item.id !== chapter.id;
    });
    rest.unshift(chapter);
    return rest;
  }

  window.VolmerraLibrary = {
    get: read,

    setAdapter: function (replacement) {
      adapter = replacement;
    },

    /* Internal hooks used by the backend adapter (assets/js/
       supabase.js). _install() puts the fetched row into the cache
       and lets open pages re-render; _forget() clears a signed-out
       user's cache. */
    _install: function (userId, library) {
      cache[userId] = Object.assign(defaults(), library || {});
      document.dispatchEvent(new CustomEvent("volmerra:library-loaded"));
    },

    _forget: function (userId) {
      delete cache[userId];
    },

    /* Keeps only entries whose id exists in validById. Any truthy
       value counts as valid (home.js passes { id: chapterObject }),
       so the previous `=== true` strict check — which silently
       deleted every valid entry — is gone. The pruned library is
       persisted and returned. */
    prune: function (userId, validById) {
      var library = read(userId);
      var valid = validById || {};
      var changed = false;
      LIBRARY_LISTS.forEach(function (listName) {
        var kept = library[listName].filter(function (item) {
          return !!valid[item.id];
        });
        if (kept.length !== library[listName].length) {
          library[listName] = kept;
          changed = true;
        }
      });
      if (changed) write(userId, library);
      return library;
    },

    trackReading: function (userId, chapter) {
      var library = read(userId);
      var nowCompleted =
        Math.max(0, Math.min(100, chapter.percent || 0)) >= 100;
      /* A chapter stays "completed" once finished, even if the reader
         opens it again later. */
      var alreadyCompleted = library.history.some(function (h) {
        return h.id === chapter.id && h.completed;
      });
      var entry = {
        id: chapter.id,
        title: chapter.title,
        percent: Math.max(0, Math.min(100, chapter.percent || 0)),
        completed: nowCompleted || alreadyCompleted,
        updatedAt: new Date().toISOString(),
      };
      library.continueReading = upsert(library.continueReading, entry);
      library.continueReading = library.continueReading.slice(0, 5);
      if (nowCompleted) {
        /* Finished: out of Continue Reading, kept in History as
           completed. */
        library.continueReading = library.continueReading.filter(function (item) {
          return item.id !== entry.id;
        });
      }
      library.history = upsert(library.history, entry).slice(0, 50);
      write(userId, library);
      return library;
    },

    toggleFavorite: function (userId, chapter) {
      return toggleList(userId, "favorites", chapter);
    },

    toggleSaved: function (userId, chapter) {
      return toggleList(userId, "saved", chapter);
    },

    isFavorite: function (userId, chapterId) {
      return read(userId).favorites.some(function (item) {
        return item.id === chapterId;
      });
    },

    isSaved: function (userId, chapterId) {
      return read(userId).saved.some(function (item) {
        return item.id === chapterId;
      });
    },
  };

  function toggleList(userId, listName, chapter) {
    var library = read(userId);
    var entry = { id: chapter.id, title: chapter.title, updatedAt: new Date().toISOString() };
    var exists = library[listName].some(function (item) {
      return item.id === entry.id;
    });
    if (exists) {
      library[listName] = library[listName].filter(function (item) {
        return item.id !== entry.id;
      });
    } else {
      library[listName] = upsert(library[listName], entry);
    }
    write(userId, library);
    return library;
  }
})();
