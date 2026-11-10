/* ============================================================
   VOLMERRA — Supabase backend adapter
   ------------------------------------------------------------
   Loaded automatically by auth.js when assets/js/config.js
   defines window.VOLMERRA_BACKEND (the Supabase project URL
   and its public anon key) and the client library is present.

   Swaps every data layer from its localStorage adapter to the
   real backend, without touching any UI code:

     VolmerraAuth      -> Supabase Auth + `profiles` table
     VolmerraChapters  -> `site_state` (key "chapters") via RPC
     VolmerraCMS       -> `site_state` (key "cms") via RPC
     VolmerraComments  -> `comments` + `comment_likes` rows
     VolmerraLibrary   -> `library` row per user

   Everything sensitive is enforced server-side by Row Level
   Security (see supabase/schema.sql):
     - only administrators can write chapters/CMS data
     - guests can read published content and comments, but every
       write needs a signed-in account
     - comment edit/delete is restricted to the author by RLS,
       not just by client checks
     - the admin role lives in `profiles.is_admin` and cannot be
       granted from the client (one-time claim RPC closes itself)

   The session is kept in an in-memory cache so the existing
   synchronous `VolmerraAuth.currentUser()` call sites keep
   working; `volmerra:auth-ready` fires once the session is
   restored (or absent), and `volmerra:library-loaded` fires
   when the reader's library has been fetched.
   ============================================================ */

(function () {
  "use strict";

  window.VOLMERRA_ATTACH_STAGE = "adapter-script-loaded";

  var config = window.VOLMERRA_BACKEND;
  if (!config || !window.supabase || !window.supabase.createClient) {
    console.warn(
      "Volmerra: backend configuration or the Supabase library is missing — staying on the localStorage adapters."
    );
    return;
  }

  window.VOLMERRA_ATTACH_STAGE = "library-ok";

  var client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  var state = { user: null, ready: false };

  function now() {
    return new Date().toISOString();
  }

  /* ---------- profiles / session cache ---------- */

  function publicProfile(row) {
    return {
      id: row.id,
      displayName: row.display_name,
      email: row.email || "",
      avatar: row.avatar || null,
      bio: row.bio || "",
      isAdmin: !!row.is_admin,
    };
  }

  function fetchProfile(userId, fallbacks) {
    return client
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        if (result.data) return publicProfile(result.data);
        /* No profile row (account created before the schema was
           applied): create it from the auth metadata. RLS allows
           inserting the caller's own profile. */
        var email = (fallbacks && fallbacks.email) || "";
        var row = {
          id: userId,
          display_name:
            (fallbacks && fallbacks.displayName) ||
            (email ? email.split("@")[0] : "Reader"),
          email: email,
        };
        return client
          .from("profiles")
          .insert(row)
          .select("*")
          .single()
          .then(function (created) {
            if (created.error) throw created.error;
            return publicProfile(created.data);
          });
      });
  }

  function dispatchAuthReady() {
    if (state.ready) return;
    state.ready = true;
    document.dispatchEvent(new CustomEvent("volmerra:auth-ready"));
  }

  /* ---------- auth adapter ---------- */

  var authAdapter = {
    isReady: function () {
      return state.ready;
    },

    currentUser: function () {
      return state.user;
    },

    register: function (input) {
      return client.auth
        .signUp({
          email: input.email,
          password: input.password,
          options: { data: { display_name: input.displayName } },
        })
        .then(function (result) {
          if (result.error) throw result.error;
          if (!result.data.session) {
            throw new Error(
              "Account created, but email confirmation is required before signing in. You can disable email confirmation in Supabase (Authentication → Sign In / Providers) for instant sign-in."
            );
          }
          return fetchProfile(result.data.user.id, {
            displayName: input.displayName,
            email: input.email,
          });
        })
        .then(function (profile) {
          state.user = profile;
          return profile;
        });
    },

    login: function (input) {
      return client.auth
        .signInWithPassword({ email: input.email, password: input.password })
        .then(function (result) {
          if (result.error) throw result.error;
          return fetchProfile(result.data.user.id, {
            email: result.data.user.email,
            displayName:
              result.data.user.user_metadata &&
              result.data.user.user_metadata.display_name,
          });
        })
        .then(function (profile) {
          state.user = profile;
          return profile;
        });
    },

    logout: function () {
      var previous = state.user;
      return client.auth.signOut().then(function (result) {
        if (result && result.error) throw result.error;
        state.user = null;
        if (
          previous &&
          window.VolmerraLibrary &&
          window.VolmerraLibrary._forget
        ) {
          window.VolmerraLibrary._forget(previous.id);
        }
      });
    },

    updateProfile: function (patch) {
      if (!state.user) {
        return Promise.reject(new Error("Not signed in."));
      }
      var row = {};
      if (typeof patch.displayName === "string" && patch.displayName.trim()) {
        row.display_name = patch.displayName.trim();
      }
      if ("avatar" in patch) {
        row.avatar = patch.avatar;
      }
      if (typeof patch.bio === "string") {
        row.bio = patch.bio.trim();
      }
      if (!Object.keys(row).length) {
        return Promise.resolve(state.user);
      }
      return client
        .from("profiles")
        .update(row)
        .eq("id", state.user.id)
        .select("*")
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          state.user = publicProfile(result.data);
          return state.user;
        });
    },

    isAdmin: function () {
      return !!(state.user && state.user.isAdmin);
    },

    adminExists: function () {
      return client.rpc("has_admin").then(function (result) {
        if (result.error) throw result.error;
        return !!result.data;
      });
    },

    /* The only grant path is the self-closing one-time claim RPC;
       revoking or granting roles afterwards is a Supabase-dashboard
       operation (or an admin-side SQL statement). */
    setAdmin: function (flag) {
      if (!state.user) {
        return Promise.reject(
          new Error("Sign in first, then claim administrator access.")
        );
      }
      if (!flag) {
        return Promise.reject(
          new Error("Administrator roles are managed in the Supabase dashboard.")
        );
      }
      return client.rpc("claim_admin").then(function (result) {
        if (result.error) throw result.error;
        if (!result.data) {
          throw new Error(
            "An administrator already exists. Ask an existing administrator to grant access from the Supabase dashboard."
          );
        }
        return fetchProfile(state.user.id).then(function (profile) {
          state.user = profile;
          return profile;
        });
      });
    },

    listUsers: function () {
      return client
        .from("profiles")
        .select("id, display_name, email, is_admin, created_at")
        .order("created_at", { ascending: true })
        .then(function (result) {
          if (result.error) throw result.error;
          return result.data.map(function (row) {
            return {
              id: row.id,
              displayName: row.display_name,
              email: row.email || "",
              isAdmin: !!row.is_admin,
              createdAt: row.created_at,
            };
          });
        });
    },
  };

  /* ---------- chapters & CMS: `site_state` document adapter ----------
     Reads go through the read_state() RPC: administrators get the
     full document, everyone else gets a public-safe projection
     (published + scheduled chapters, CMS without internal
     moderation collections). Writes are admin-only, enforced by
     RLS on the table itself. */

  function stateAdapter(key) {
    return {
      read: function () {
        return client
          .rpc("read_state", { p_key: key })
          .then(function (result) {
            if (result.error) throw result.error;
            return result.data;
          });
      },
      write: function (data) {
        /* Admin writes are gated on the JWT's role: an expired
           access token makes the request look anonymous and the
           write fails with a raw RLS violation. Refresh the session
           first (best effort) and, if the write is still rejected
           after a failed refresh, explain that in plain words. */
        var prep =
          state.user
            ? client
                .auth.refreshSession()
                .then(function (result) {
                  return !result.error;
                })
                .catch(function () {
                  return false;
                })
            : Promise.resolve(true);
        return prep.then(function (refreshed) {
          return client
            .from("site_state")
            .upsert(
              { key: key, data: data, updated_at: now() },
              { onConflict: "key" }
            )
            .then(function (result) {
              if (result.error) {
                if (
                  !refreshed &&
                  (result.error.message || "").indexOf(
                    "row-level security"
                  ) !== -1
                ) {
                  throw new Error(
                    "Oturumun süresi doldu — sayfayı yenile ve tekrar giriş yap. (Your session expired — reload the page and sign in again.)"
                  );
                }
                throw result.error;
              }
            });
        });
      },
    };
  }

  var chaptersAdapter = stateAdapter("chapters");
  /* Scheduled publication flips past-due chapters server-side, so a
     visitor's browser can trigger it without any write access. */
  chaptersAdapter.publishDue = function () {
    return client.rpc("publish_due_chapters").then(function (result) {
      if (result.error) throw result.error;
      return Array.isArray(result.data) ? result.data : [];
    });
  };

  var cmsAdapter = stateAdapter("cms");

  /* ---------- comments: row-level adapter ----------
     Ownership rules live in RLS: insert/update/delete policies
     compare the row's user_id with auth.uid(). The client-side
     checks below the adapter remain as friendly error messages. */

  function mapComment(row) {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      parentId: row.parent_id || null,
      userId: row.user_id,
      authorName: row.author_name,
      authorAvatar: row.author_avatar || null,
      text: row.text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      edited: !!row.edited,
      likedBy: (row.likes || []).map(function (like) {
        return like.user_id;
      }),
    };
  }

  var commentsAdapter = {
    fetchAll: function () {
      return client
        .from("comments")
        .select("*, likes:comment_likes(user_id)")
        .order("created_at", { ascending: true })
        .then(function (result) {
          if (result.error) throw result.error;
          return result.data.map(mapComment);
        });
    },

    insert: function (comment) {
      return client
        .from("comments")
        .insert({
          chapter_id: comment.chapterId,
          parent_id: comment.parentId,
          user_id: comment.userId,
          author_name: comment.authorName,
          author_avatar: comment.authorAvatar,
          text: comment.text,
        })
        .select("*")
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          result.data.likes = [];
          return mapComment(result.data);
        });
    },

    updateRow: function (id, userId, text) {
      return client
        .from("comments")
        .update({ text: text, edited: true, updated_at: now() })
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .single()
        .then(function (result) {
          if (result.error) throw result.error;
          return mapComment(Object.assign({ likes: [] }, result.data));
        });
    },

    deleteRow: function (id, userId) {
      return client
        .from("comments")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .then(function (result) {
          if (result.error) throw result.error;
        });
    },

    toggleLike: function (id, userId) {
      return client
        .from("comment_likes")
        .select("comment_id")
        .eq("comment_id", id)
        .eq("user_id", userId)
        .maybeSingle()
        .then(function (result) {
          if (result.error) throw result.error;
          if (result.data) {
            return client
              .from("comment_likes")
              .delete()
              .eq("comment_id", id)
              .eq("user_id", userId);
          }
          return client
            .from("comment_likes")
            .insert({ comment_id: id, user_id: userId });
        })
        .then(function (result) {
          if (result.error) throw result.error;
          return client
            .from("comment_likes")
            .select("comment_id", { count: "exact", head: true })
            .eq("comment_id", id)
            .then(function (countResult) {
              if (countResult.error) throw countResult.error;
              return countResult.count || 0;
            });
        });
    },
  };

  /* ---------- library: one row per user ---------- */

  var libraryAdapter = {
    save: function (userId, library) {
      return client
        .from("library")
        .upsert(
          { user_id: userId, data: library, updated_at: now() },
          { onConflict: "user_id" }
        )
        .then(function (result) {
          if (result.error) throw result.error;
        });
    },
  };

  function loadLibrary(userId) {
    client
      .from("library")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        if (
          window.VolmerraLibrary &&
          typeof window.VolmerraLibrary._install === "function"
        ) {
          window.VolmerraLibrary._install(
            userId,
            result.data ? result.data.data : null
          );
        } else {
          console.warn(
            "Volmerra: the library module on this page is stale — reload the page to sync it."
          );
        }
      })
      .catch(function (error) {
        console.warn(
          "Volmerra library could not be loaded:",
          error && error.message
        );
      });
  }

  document.addEventListener("volmerra:auth-ready", function () {
    if (state.user) loadLibrary(state.user.id);
  });

  /* ---------- attach everything ----------
     supabase.js is injected asynchronously (after the CDN library);
     on a very first load it can finish before the remaining local
     data-layer scripts have run. Attach only once every module
     exists, otherwise wait for DOMContentLoaded. */
  function attachAdapters() {
    if (!window.VolmerraAuth) {
      document.addEventListener("volmerra:backend-ready", attachAdapters, {
        once: true,
      });
      return;
    }

    /* Attach defensively: on a page whose browser cached an older
       copy of a data-layer module, a missing setAdapter must never
       stop the whole backend from attaching — accounts and content
       sync matter more than any single optional integration. */
    window.VolmerraAuth.setAdapter(authAdapter);
    if (window.VolmerraChapters) {
      try {
        window.VolmerraChapters.setAdapter(chaptersAdapter);
      } catch (error) {
        console.warn("Volmerra: chapters module is stale — reload the page to sync it.", error);
      }
    }
    if (window.VolmerraCMS) {
      try {
        window.VolmerraCMS.setAdapter(cmsAdapter);
      } catch (error) {
        console.warn("Volmerra: cms module is stale — reload the page to sync it.", error);
      }
    }
    if (window.VolmerraComments) {
      try {
        window.VolmerraComments.setAdapter(commentsAdapter);
      } catch (error) {
        console.warn("Volmerra: comments module is stale — reload the page to sync it.", error);
      }
    }
    if (window.VolmerraLibrary) {
      try {
        window.VolmerraLibrary.setAdapter(libraryAdapter);
      } catch (error) {
        console.warn("Volmerra: library module is stale — reload the page to sync it.", error);
      }
    }
    /* Public diagnostic flag: the real backend is attached. Set
       unconditionally — a stale optional module degrades its own
       feature but must not disable accounts. */
    window.VOLMERRA_BACKEND_ACTIVE = true;
    window.VOLMERRA_ATTACH_STAGE = "attached";

    /* ---------- session restore ---------- */

    client.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") {
        if (
          state.user &&
          window.VolmerraLibrary &&
          window.VolmerraLibrary._forget
        ) {
          window.VolmerraLibrary._forget(state.user.id);
        }
        state.user = null;
      }
    });

    client.auth
      .getSession()
      .then(function (result) {
        var session = result && result.data ? result.data.session : null;
        if (!session) return null;
        return fetchProfile(session.user.id, {
          email: session.user.email,
          displayName:
            session.user.user_metadata &&
            session.user.user_metadata.display_name,
        }).then(function (profile) {
          state.user = profile;
          return profile;
        });
      })
      .catch(function (error) {
        console.warn(
          "Volmerra session restore failed:",
          error && error.message
        );
      })
      .then(function () {
        dispatchAuthReady();
      });
  }

  attachAdapters();
})();
