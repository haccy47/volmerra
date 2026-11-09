/* ============================================================
   VOLMERRA — Authentication scaffold
   ------------------------------------------------------------
   NOTE: This is a client-side scaffold built so the interface
   can be designed and demonstrated without a server. Accounts
   and sessions live in localStorage and are NOT secure.
   Replace this module with a real backend (accounts, sessions,
   password hashing on the server) before launch.
   No demo accounts exist: every account is created by the user.
   ============================================================ */

(function () {
  "use strict";

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

  window.VolmerraAuth = {
    currentUser: function () {
      var session = readSession();
      return session || null;
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

    /* ---------- Administrator permissions ----------
       Preview build: roles live in the client-side account store
       and the admin gate is enforced in the UI only. In production,
       admin roles must be granted and every admin operation must
       be authorized server-side. adminExists() enables a one-time
       first-run ownership claim; once any account is an admin,
       that offer disappears. */

    isAdmin: function () {
      var session = readSession();
      return !!(session && session.isAdmin);
    },

    adminExists: function () {
      return readUsers().some(function (u) {
        return u.isAdmin;
      });
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
       exposes password hashes. Real user administration (roles,
       deletion) must happen server-side in the backend. */
    listUsers: function () {
      return readUsers().map(function (u) {
        return {
          id: u.id,
          displayName: u.displayName,
          email: u.email,
          isAdmin: !!u.isAdmin,
          createdAt: u.createdAt,
        };
      });
    },
  };
})();
