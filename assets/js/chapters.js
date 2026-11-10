/* ============================================================
   VOLMERRA — Chapter data layer
   ------------------------------------------------------------
   Central store for story chapters. Every method is async and
   goes through a pluggable storage adapter, so the preview
   build's browser adapter can be replaced by a backend API
   adapter without touching any UI code:

     VolmerraChapters.setAdapter({
       read:  function () {},   // -> Promise<state|null>
       write: function (state) {} // -> Promise
     });

   The default adapter persists to localStorage. NOTE: this is a
   client-side preview store, not a database — published content,
   numbering sequences and admin authorization must move to a
   real backend with server-side enforcement before launch.

   Chapter numbering (SXBX):
   - The season part comes from the admin's season selection; the
     B-number is suggested automatically (next free number in the
     season) but the admin may set any whole number instead — the
     full code (e.g. "S1B4") is always derived from season + number.
   - Manual numbers must be unique within their season; the season
     counter (the suggestion) follows the highest number ever used,
     so the auto-suggestion never collides with existing chapters.
   - Mutations are serialized through a queue so operations from
     this client can never interleave; cross-client concurrency
     must be enforced transactionally by the backend adapter.
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "volmerra:chapters";
  var SEASONS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

  var localStorageAdapter = {
    read: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return Promise.reject(new Error("Could not read the chapter storage."));
      }
    },
    write: function (state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return Promise.resolve();
      } catch (e) {
        var quota =
          e &&
          (e.name === "QuotaExceededError" ||
            e.code === 22 ||
            e.number === 22);
        return Promise.reject(
          new Error(
            quota
              ? "Local storage is full. Remove older covers or use smaller images, then try again."
              : "Could not save the chapter storage."
          )
        );
      }
    },
  };

  var adapter = localStorageAdapter;

  /* Central season visibility hook. The season release layer
     (seasons.js) registers its rule here; public-facing reads apply
     it at the data layer so unreleased seasons never reach the UI. */
  var visibility = function () {
    return true;
  };
  if (window.VolmerraSeasons && window.VolmerraSeasons.isPublic) {
    visibility = window.VolmerraSeasons.isPublic;
  }

  var queue = Promise.resolve();
  function enqueue(operation) {
    var run = queue.then(operation);
    queue = run.catch(function () {});
    return run;
  }

  function emptyState() {
    return { chapters: [], counters: {} };
  }

  function readState() {
    return adapter.read().then(function (state) {
      return state || emptyState();
    });
  }

  function makeId() {
    return (
      "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }

  function numberLabel(season, n) {
    return season.toUpperCase() + "B" + n;
  }

  function nextInSeason(state, season) {
    return (state.counters[season] || 0) + 1;
  }

  /* Chapter numbers may be assigned manually by the admin; they must
     stay unique within a season. */
  function isNumberTaken(state, season, n, excludeId) {
    return state.chapters.some(function (c) {
      return (
        c.season === season &&
        c.numberInSeason === n &&
        c.id !== (excludeId || null)
      );
    });
  }

  function byOrder(a, b) {
    if (a.season !== b.season) {
      return SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season);
    }
    return a.numberInSeason - b.numberInSeason;
  }

  function validateScheduledAt(scheduledAt) {
    if (!scheduledAt) {
      throw new Error("Please choose a date and time to schedule.");
    }
    var time = new Date(scheduledAt).getTime();
    if (isNaN(time)) {
      throw new Error("The scheduled date is invalid.");
    }
    if (time <= Date.now()) {
      throw new Error("The scheduled date must be in the future.");
    }
  }

  window.VolmerraChapters = {
    seasons: SEASONS.slice(),

    setAdapter: function (replacement) {
      adapter = replacement;
    },

    setVisibility: function (fn) {
      if (typeof fn === "function") visibility = fn;
    },

    /* Preview of the next free number in a season, e.g. 4 ("S1B4"). */
    nextNumberIn: function (season) {
      if (SEASONS.indexOf(season) === -1) {
        return Promise.reject(new Error("Unknown season."));
      }
      return readState().then(function (state) {
        return nextInSeason(state, season);
      });
    },

    list: function () {
      return readState().then(function (state) {
        return state.chapters.slice().sort(byOrder);
      });
    },

    published: function () {
      return readState().then(function (state) {
        return state.chapters
          .filter(function (c) {
            return c.status === "published" && visibility(c.season);
          })
          .sort(byOrder);
      });
    },

    /* Published chapters grouped per season, in numerical order. */
    publishedBySeason: function () {
      return this.published().then(function (chapters) {
        return SEASONS.map(function (season) {
          return {
            season: season,
            chapters: chapters.filter(function (c) {
              return c.season === season;
            }),
          };
        }).filter(function (group) {
          return group.chapters.length > 0;
        });
      });
    },

    /* Scheduled chapters, soonest first. Prototype: the countdown is
       computed in the browser and an administrator publishes manually.
       Automatic publishing at the scheduled time requires a
       server-side scheduler in the future backend. */
    scheduled: function () {
      return readState().then(function (state) {
        return state.chapters
          .filter(function (c) {
            return c.status === "scheduled";
          })
          .sort(function (a, b) {
            return new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0);
          });
      });
    },

    /* Auto-publish: flips scheduled chapters whose time has passed
       to published. On the Supabase backend this is a server-side
       RPC (publish_due_chapters); on the localStorage fallback it
       runs in the browser while the website is open — reliable
       publication without a visitor still needs a hosted scheduler. */
    publishDue: function () {
      /* Backend adapter path: publication is a server-side operation
         (a SECURITY DEFINER RPC), so a visitor's browser can trigger
         it without any write access and RLS stays intact. */
      if (adapter.publishDue) {
        return adapter.publishDue();
      }
      return enqueue(function () {
        return readState().then(function (state) {
          var now = Date.now();
          var published = [];
          state.chapters.forEach(function (c) {
            if (
              c.status === "scheduled" &&
              c.scheduledAt &&
              new Date(c.scheduledAt).getTime() <= now
            ) {
              c.status = "published";
              if (!c.publishedAt) c.publishedAt = c.scheduledAt;
              published.push(c);
            }
          });
          if (!published.length) return published;
          return adapter.write(state).then(function () {
            return published;
          });
        });
      });
    },

    /* Upcoming scheduled chapters in released seasons only, soonest
       first. Used by the public homepage hero — work scheduled in an
       unreleased season is never teased publicly. */
    upcoming: function () {
      return this.scheduled().then(function (list) {
        return list.filter(function (c) {
          return visibility(c.season);
        });
      });
    },

    get: function (id, opts) {
      return readState().then(function (state) {
        var chapter = state.chapters.find(function (c) {
          return c.id === id;
        });
        if (!chapter) return null;
        if (chapter.status !== "published" && !(opts && opts.includeDrafts)) {
          return null;
        }
        /* Season release visibility: chapters of unreleased seasons are
           never returned to public consumers (data-level protection). */
        if (!(opts && opts.all) && !visibility(chapter.season)) {
          return null;
        }
        return chapter;
      });
    },

    create: function (input) {
      var season = input.season;
      var title = (input.title || "").trim();
      if (SEASONS.indexOf(season) === -1) {
        return Promise.reject(new Error("Please select a season."));
      }
      if (!title) {
        return Promise.reject(new Error("Please enter a chapter title."));
      }
      var status =
        ["published", "draft", "scheduled"].indexOf(input.status) > -1
          ? input.status
          : "draft";
      if (status === "scheduled") {
        try {
          validateScheduledAt(input.scheduledAt);
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return enqueue(function () {
        return readState().then(function (state) {
          /* Manual number (optional): the admin may pick any free
             whole number in the season; otherwise the next counter
             value is suggested automatically. */
          var numberInSeason;
          if (input.numberInSeason != null) {
            if (
              !Number.isInteger(input.numberInSeason) ||
              input.numberInSeason < 1
            ) {
              throw new Error(
                "The chapter number must be a whole number of at least 1."
              );
            }
            if (isNumberTaken(state, season, input.numberInSeason, null)) {
              throw new Error(
                season.toUpperCase() +
                  "B" +
                  input.numberInSeason +
                  " is already used in this season. Choose another number."
              );
            }
            numberInSeason = input.numberInSeason;
          } else {
            numberInSeason = nextInSeason(state, season);
          }
          /* The season counter (the auto-suggestion) follows the highest
             number ever used, whether assigned automatically or by hand. */
          state.counters[season] = Math.max(
            state.counters[season] || 0,
            numberInSeason
          );
          var chapter = {
            id: makeId(),
            number: numberLabel(season, numberInSeason),
            numberInSeason: numberInSeason,
            season: season,
            title: title,
            description: (input.description || "").trim(),
            cover: input.cover || null,
            content: input.content || "",
            status: status,
            publishedAt:
              status === "published" ? new Date().toISOString() : null,
            scheduledAt:
              status === "scheduled" ? input.scheduledAt || null : null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          state.chapters.push(chapter);
          return adapter.write(state).then(function () {
            return chapter;
          });
        });
      });
    },

    /* Editing keeps a chapter's number and season unless the admin
       explicitly changes the number (which must stay unique in the
       season). Titles, covers, content and publishing are unaffected. */
    update: function (id, patch) {
      return enqueue(function () {
        return readState().then(function (state) {
          var chapter = state.chapters.find(function (c) {
            return c.id === id;
          });
          if (!chapter) {
            throw new Error("Chapter not found.");
          }
          if (patch.numberInSeason !== undefined) {
            var newNumber = patch.numberInSeason;
            if (!Number.isInteger(newNumber) || newNumber < 1) {
              throw new Error(
                "The chapter number must be a whole number of at least 1."
              );
            }
            if (isNumberTaken(state, chapter.season, newNumber, chapter.id)) {
              throw new Error(
                chapter.season.toUpperCase() +
                  "B" +
                  newNumber +
                  " is already used in this season. Choose another number."
              );
            }
            chapter.numberInSeason = newNumber;
            chapter.number = numberLabel(chapter.season, newNumber);
            state.counters[chapter.season] = Math.max(
              state.counters[chapter.season] || 0,
              newNumber
            );
          }
          if (typeof patch.title === "string" && patch.title.trim()) {
            chapter.title = patch.title.trim();
          }
          if (typeof patch.description === "string") {
            chapter.description = patch.description.trim();
          }
          if ("cover" in patch) {
            chapter.cover = patch.cover || null;
          }
          if (typeof patch.content === "string") {
            chapter.content = patch.content;
          }
          if (
            patch.status === "published" ||
            patch.status === "draft" ||
            patch.status === "scheduled"
          ) {
            if (patch.status === "published") {
              if (!chapter.publishedAt) {
                chapter.publishedAt = new Date().toISOString();
              }
              chapter.scheduledAt = null;
            }
            if (patch.status === "scheduled") {
              if (chapter.status === "published") {
                throw new Error(
                  "This chapter is already published and cannot be scheduled again."
                );
              }
              var when = patch.scheduledAt || chapter.scheduledAt;
              try {
                validateScheduledAt(when);
              } catch (error) {
                throw error;
              }
              chapter.scheduledAt = when;
            }
            if (patch.status === "draft") {
              /* Cancelling a schedule: drop the stored release date so
                 no stale schedule survives on the draft. */
              chapter.scheduledAt = null;
            }
            chapter.status = patch.status;
          }
          chapter.updatedAt = new Date().toISOString();
          return adapter.write(state).then(function () {
            return chapter;
          });
        });
      });
    },

    setStatus: function (id, status) {
      return this.update(id, { status: status });
    },

    /* Deleting a chapter never changes the season counter, so the
       auto-suggestion keeps pointing past deleted numbers. */
    remove: function (id) {
      return enqueue(function () {
        return readState().then(function (state) {
          state.chapters = state.chapters.filter(function (c) {
            return c.id !== id;
          });
          return adapter.write(state);
        });
      });
    },

    /* One-time migration: pushes the state that was saved in this
       browser's localStorage (from before a backend was connected)
       into the current storage adapter. Merged by chapter id —
       entries that already exist in the backend are kept untouched,
       the season counters take the maximum of both sides. */
    importLocalBackup: function () {
      var raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (e) {}
      if (!raw) return Promise.resolve({ chapters: 0 });
      var local;
      try {
        local = JSON.parse(raw);
      } catch (e) {
        return Promise.reject(
          new Error("The local chapter backup could not be read.")
        );
      }
      return enqueue(function () {
        return readState().then(function (state) {
          var byId = {};
          state.chapters.forEach(function (c) {
            byId[c.id] = true;
          });
          var added = 0;
          (local.chapters || []).forEach(function (c) {
            if (c && c.id && !byId[c.id]) {
              state.chapters.push(c);
              added++;
            }
          });
          Object.keys(local.counters || {}).forEach(function (season) {
            state.counters[season] = Math.max(
              state.counters[season] || 0,
              local.counters[season]
            );
          });
          if (!added) return { chapters: 0 };
          return adapter.write(state).then(function () {
            return { chapters: added };
          });
        });
      });
    },

    /* Renders stored TXT content into a node, preserving paragraph
       breaks (blank lines) and line breaks. Built with DOM nodes so
       chapter content is never interpreted as HTML. */
    appendContent: function (node, text) {
      node.innerHTML = "";
      if (!text) return node;
      String(text)
        .split(/\r?\n\s*\r?\n/)
        .forEach(function (para) {
          var p = document.createElement("p");
          para.split(/\r?\n/).forEach(function (line, i) {
            if (i) p.appendChild(document.createElement("br"));
            p.appendChild(document.createTextNode(line));
          });
          node.appendChild(p);
        });
      return node;
    },
  };
})();
