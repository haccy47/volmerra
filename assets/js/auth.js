/* ============================================================
   VOLMERRA — Authentication
   ------------------------------------------------------------
   Two interchangeable backends behind one API:

   1. localStorage backend (default): honest client-side
      scaffold so the interface works without a server.
      Accounts and sessions live in localStorage and are NOT
      secure — kept only as a fallback for preview builds
      with no config.js.

   2. Supabase backend (assets/js/supabase.js): real accounts
      (Supabase Auth), profiles in the `profiles` table, the
      admin role enforced by Row Level Security. Attached
      automatically when `config.js` defines the project
      credentials.

   The public API is unchanged for every caller:
     currentUser()   sync, backed by an in-memory session cache
     register/login/logout/updateProfile  Promises
     isAdmin()       sync (cached profile role)
     adminExists()   -> Promise<boolean>
     setAdmin(flag)  -> Promise<user>
     listUsers()     -> Promise<array>
     whenReady(cb)   resolves once the active backend has
                     restored its session (immediate for the
                     localStorage backend)
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Backend bootstrap ----------
     Tries to load config.js next to this file. If it defines
     window.VOLMERRA_BACKEND, the Supabase client library and the
     adapter module are loaded and every data layer swaps to the
     real backend. A missing config.js silently keeps the site on
     the localStorage adapters below.
     Every dynamically loaded script carries a version query so
     browsers never run a stale cached copy after a new publish. */
  var BACKEND_VERSION = "2";
  var SELF_SRC = document.currentScript
    ? document.currentScript.src
    : null;

  var bootstrapped = new Promise(function (resolve) {
    function done() {
      document.dispatchEvent(new CustomEvent("volmerra:backend-ready"));
      resolve();
    }
    if (!SELF_SRC) {
      done();
      return;
    }
    var dir = SELF_SRC.replace(/[^/]*$/, "");
    var config = document.createElement("script");
    config.src = dir + "config.js?v=" + BACKEND_VERSION;
    config.onload = function () {
      /* Two accepted shapes:
         window.VOLMERRA_BACKEND = { url, anonKey }  (canonical)
         window.VOLMERRA_CONFIG  = { supabaseUrl, supabaseAnonKey } */
      var cfg =
        window.VOLMERRA_BACKEND ||
        (window.VOLMERRA_CONFIG
          ? {
              url: window.VOLMERRA_CONFIG.supabaseUrl,
              anonKey: window.VOLMERRA_CONFIG.supabaseAnonKey,
            }
          : null);
      if (cfg && cfg.url && cfg.anonKey) {
        window.VOLMERRA_BACKEND = cfg;
        window.VOLMERRA_BACKEND_CONFIGURED = true;
        /* The Supabase client library is vendored locally
           (assets/js/vendor/supabase.js) so the site never depends
           on a third-party CDN — some networks block CDNs, and a
           failed load used to silently fall back to localStorage. */
        var cdn = document.createElement("script");
        cdn.src = dir + "vendor/supabase.js?v=" + BACKEND_VERSION;
        cdn.onload = function () {
          var backend = document.createElement("script");
          backend.src = dir + "supabase.js?v=" + BACKEND_VERSION;
          backend.onload = done;
          backend.onerror = function () {
            console.warn("Volmerra: supabase.js could not be loaded — staying on the localStorage adapters.");
            done();
          };
          document.head.appendChild(backend);
        };
        cdn.onerror = function () {
          console.warn("Volmerra: the Supabase client library could not be loaded — staying on the localStorage adapters.");
          done();
        };
        document.head.appendChild(cdn);
      } else {
        done();
      }
    };
    config.onerror = done;
    document.head.appendChild(config);
  });

  var USERS_KEY = "volmerra:users";
  var SESSION_KEY = "volmerra:session";

  function readUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
      return null;
    }
  }

  function writeSession(session) {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  /* SHA-256 when available (secure contexts); simple fallback otherwise. */
  function hashPassword(password) {
    if (window.crypto && window.crypto.subtle) {
      var bytes = new TextEncoder().encode(password);
      return window.crypto.subtle
        .digest("SHA-256", bytes)
        .then(function (buf) {
          return Array.prototype.map
            .call(new Uint8Array(buf), function (b) {
              return b.toString(16).padStart(2, "0");
            })
            .join("");
        });
    }
    return Promise.resolve(fallbackHash(password));
  }

  function fallbackHash(text) {
    var hash = 5381;
    for (var i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    }
    return "fb-" + (hash >>> 0).toString(16);
  }

  function makeId() {
    return (
      "u_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function publicUser(user) {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      avatar: user.avatar || null,
      bio: user.bio || "",
      isAdmin: !!user.isAdmin,
    };
  }

  /* ---------- localStorage backend (preview fallback) ---------- */

  var localStorageBackend = {
    isReady: function () {
      return true;
    },

    currentUser: function () {
      return readSession() || null;
    },

    register: function (input) {
      var displayName = (input.displayName || "").trim();
      var email = (input.email || "").trim().toLowerCase();
      var password = input.password || "";

      if (!displayName) {
        return Promise.reject(new Error("Please enter a display name."));
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Promise.reject(new Error("Please enter a valid email address."));
      }
      if (password.length < 8) {
        return Promise.reject(
          new Error("Password must be at least 8 characters long.")
        );
      }

      var users = readUsers();
      var exists = users.some(function (u) {
        return u.email === email;
      });
      if (exists) {
        return Promise.reject(
          new Error("An account with this email already exists. Try logging in.")
        );
      }

      return hashPassword(password).then(function (passwordHash) {
        var user = {
          id: makeId(),
          displayName: displayName,
          email: email,
          passwordHash: passwordHash,
          avatar: null,
          createdAt: new Date().toISOString(),
        };
        users.push(user);
        writeUsers(users);
        writeSession(publicUser(user));
        return publicUser(user);
      });
    },

    login: function (input) {
      var email = (input.email || "").trim().toLowerCase();
      var password = input.password || "";
      var users = readUsers();
      var user = users.find(function (u) {
        return u.email === email;
      });

      if (!user) {
        return Promise.reject(
          new Error("No account found with this email.")
        );
      }

      return hashPassword(password).then(function (hash) {
        if (hash !== user.passwordHash) {
          return Promise.reject(new Error("Incorrect password."));
        }
        writeSession(publicUser(user));
        return publicUser(user);
      });
    },

    logout: function () {
      writeSession(null);
      return Promise.resolve();
    },

    updateProfile: function (patch) {
      var session = readSession();
      if (!session) {
        return Promise.reject(new Error("Not signed in."));
      }
      var users = readUsers();
      var user = users.find(function (u) {
        return u.id === session.id;
      });
      if (!user) {
        return Promise.reject(new Error("Account not found."));
      }
      if (typeof patch.displayName === "string" && patch.displayName.trim()) {
        user.displayName = patch.displayName.trim();
      }
      if ("avatar" in patch) {
        user.avatar = patch.avatar;
      }
      if (typeof patch.bio === "string") {
        user.bio = patch.bio.trim();
      }
      writeUsers(users);
      var fresh = publicUser(user);
      writeSession(fresh);
      return Promise.resolve(fresh);
    },

    isAdmin: function () {
      var session = readSession();
      return !!(session && session.isAdmin);
    },

    /* Promisified so both backends share one call shape. */
    adminExists: function () {
      return Promise.resolve(
        readUsers().some(function (u) {
          return u.isAdmin;
        })
      );
    },

    setAdmin: function (flag) {
      var session = readSession();
      if (!session) {
        return Promise.reject(new Error("Not signed in."));
      }
      var users = readUsers();
      var user = users.find(function (u) {
        return u.id === session.id;
      });
      if (!user) {
        return Promise.reject(new Error("Account not found."));
      }
      user.isAdmin = !!flag;
      writeUsers(users);
      var fresh = publicUser(user);
      writeSession(fresh);
      return Promise.resolve(fresh);
    },

    /* Read-only account directory for the admin panel. Never
       exposes password hashes. */
    listUsers: function () {
      return Promise.resolve(
        readUsers().map(function (u) {
          return {
            id: u.id,
            displayName: u.displayName,
            email: u.email,
            isAdmin: !!u.isAdmin,
            createdAt: u.createdAt,
          };
        })
      );
    },
  };

  var backend = localStorageBackend;

  /* Guard: when the site is configured for the real backend, never
     allow an account to be created or a session to be opened in the
     localStorage fallback. That fallback exists only for preview
     builds with no config.js — a signup landing there silently
     per-browser is exactly the failure mode this gate prevents. */
  function requireLiveBackend() {
    if (
      window.VOLMERRA_BACKEND_CONFIGURED &&
      !window.VOLMERRA_BACKEND_ACTIVE
    ) {
      throw new Error(
        "Veritabanı bağlantısı kurulamadı — sayfayı yenile ve tekrar dene. (Database connection unavailable — reload this page.)"
      );
    }
  }

  window.VolmerraAuth = {
    /* Attaches a real backend (assets/js/supabase.js). The adapter
       implements the same interface as localStorageBackend. */
    setAdapter: function (replacement) {
      if (!replacement) return;
      backend = replacement;
      if (typeof replacement.boot === "function") {
        replacement.boot(window.VolmerraAuth);
      }
    },

    /* Resolves once the active backend restored its session (or
       immediately for the localStorage backend). The backend is
       only evaluated after the bootstrap chain finished, so a
       Supabase adapter that is still loading is never mistaken for
       the localStorage fallback; a timeout keeps pages usable even
       if the backend never becomes reachable. */
    whenReady: function (callback) {
      var restored = bootstrapped.then(function () {
        return new Promise(function (resolve) {
          if (backend.isReady && backend.isReady()) {
            resolve();
            return;
          }
          document.addEventListener("volmerra:auth-ready", resolve, {
            once: true,
          });
        });
      });
      var timeout = new Promise(function (resolve) {
        window.setTimeout(resolve, 8000);
      });
      return Promise.race([restored, timeout]).then(callback);
    },

    /* ---------- public API (delegates to the active backend) ---------- */

    currentUser: function () {
      return backend.currentUser();
    },

    register: function (input) {
      var displayName = (input.displayName || "").trim();
      var email = (input.email || "").trim().toLowerCase();
      var password = input.password || "";

      if (!displayName) {
        return Promise.reject(new Error("Please enter a display name."));
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Promise.reject(new Error("Please enter a valid email address."));
      }
      if (password.length < 8) {
        return Promise.reject(
          new Error("Password must be at least 8 characters long.")
        );
      }
      try {
        requireLiveBackend();
      } catch (error) {
        return Promise.reject(error);
      }
      return backend.register({
        displayName: displayName,
        email: email,
        password: password,
      });
    },

    login: function (input) {
      try {
        requireLiveBackend();
      } catch (error) {
        return Promise.reject(error);
      }
      return backend.login({
        email: (input.email || "").trim().toLowerCase(),
        password: input.password || "",
      });
    },

    logout: function () {
      return backend.logout();
    },

    updateProfile: function (patch) {
      return backend.updateProfile(patch || {});
    },

    /* Administrator permissions: with the Supabase backend the role
       lives in the `profiles` table and every admin write is enforced
       by Row Level Security — the client cannot grant itself access.
       adminExists() enables the one-time first-run ownership claim;
       once any account is an admin, that offer disappears. */
    isAdmin: function () {
      return backend.isAdmin();
    },

    adminExists: function () {
      return backend.adminExists();
    },

    setAdmin: function (flag) {
      return backend.setAdmin(!!flag);
    },

    listUsers: function () {
      return backend.listUsers();
    },
  };

  /* ---------- DB status badge ----------
     On a site configured for the real backend, a tiny badge in the
     bottom-right corner shows whether the connection is actually
     live. Absence of the badge = the page is running a stale cached
     copy of the code or a wrong copy of the site. */
  function updateDbBadge() {
    if (!window.VOLMERRA_BACKEND_CONFIGURED) return;
    var badge = document.getElementById("volmerra-db-badge");
    if (!badge) {
      if (!document.body) return;
      badge = document.createElement("div");
      badge.id = "volmerra-db-badge";
      badge.style.cssText =
        "position:fixed;bottom:6px;right:6px;z-index:2147483647;" +
        "font:600 10px/1.4 -apple-system,Helvetica,Arial,sans-serif;" +
        "padding:4px 8px;border-radius:999px;pointer-events:none;" +
        "opacity:0.85;color:#fff;background:#555;";
      document.body.appendChild(badge);
    }
    if (window.VOLMERRA_BACKEND_ACTIVE) {
      badge.textContent = "DB: Supabase ✓";
      badge.style.background = "#1d7a3a";
    } else {
      badge.textContent = "DB: OFFLINE — sayfayı yenile";
      badge.style.background = "#a03434";
    }
  }
  document.addEventListener("volmerra:backend-ready", function () {
    document.addEventListener("volmerra:auth-ready", updateDbBadge);
    updateDbBadge();
    /* Final verdict: if the backend never attaches, the badge turns
       red after a short wait instead of staying ambiguous. */
    window.setTimeout(updateDbBadge, 4000);
  });
})();
