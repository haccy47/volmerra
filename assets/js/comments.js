/* ============================================================
   VOLMERRA — Comments data layer
   ------------------------------------------------------------
   Chapter comments with replies, likes and ownership rules.
   Same architecture as the other data layers: async API over a
   swappable storage adapter, so the preview build's browser
   adapter can be replaced by a backend API adapter without
   touching UI code.

   Model (flat storage, threaded views):
     { id, chapterId, parentId (null = top level), userId,
       authorName, authorAvatar, text, createdAt, updatedAt,
       edited, likedBy: [userIds] }

   Rules enforced here:
   - only the author can edit or delete their comment
   - one like per user per comment (likedBy holds user ids)
   - replies attach to a top-level comment (one thread level)
   - guests may READ (public data) but the UI blocks writes for
     them; in production, write permissions must also be
     enforced server-side.

   Prototype limit: comments live in this browser via the
   adapter — cross-device persistence requires the backend.
   ============================================================ */

(function () {
  "use strict";

  var STORAGE_KEY = "volmerra:comments";
  var MAX_LENGTH = 2000;

  var localStorageAdapter = {
    read: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        return Promise.resolve(raw ? JSON.parse(raw) : []);
      } catch (e) {
        return Promise.reject(new Error("Could not read the comments."));
      }
    },
    write: function (comments) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(new Error("Could not save the comment."));
      }
    },
  };

  var adapter = localStorageAdapter;

  var queue = Promise.resolve();
  function enqueue(operation) {
    var run = queue.then(operation);
    queue = run.catch(function () {});
    return run;
  }

  function makeId() {
    return (
      "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }

  function readComments() {
    return adapter.read().then(function (data) {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.comments)) return data.comments;
      return [];
    });
  }

  function validateText(text) {
    var value = (text || "").trim();
    if (!value) throw new Error("Please write a comment first.");
    if (value.length > MAX_LENGTH) {
      throw new Error(
        "Comments are limited to " + MAX_LENGTH + " characters."
      );
    }
    return value;
  }

  window.VolmerraComments = {
    setAdapter: function (replacement) {
      adapter = replacement;
    },

    /* Threaded view: top-level comments (newest first), each with its
       replies in chronological order. */
    list: function (chapterId) {
      return readComments().then(function (all) {
        var mine = all.filter(function (c) {
          return c.chapterId === chapterId;
        });
        return mine
          .filter(function (c) {
            return !c.parentId;
          })
          .sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
          })
          .map(function (top) {
            return Object.assign({}, top, {
              replies: mine
                .filter(function (r) {
                  return r.parentId === top.id;
                })
                .sort(function (a, b) {
                  return new Date(a.createdAt) - new Date(b.createdAt);
                }),
            });
          });
      });
    },

    /* Total number of comments (top-level + replies) for a chapter. */
    count: function (chapterId) {
      return readComments().then(function (all) {
        return all.filter(function (c) {
          return c.chapterId === chapterId;
        }).length;
      });
    },

    add: function (input) {
      if (!input.userId) {
        return Promise.reject(new Error("Sign in to write a comment."));
      }
      if (!input.chapterId) {
        return Promise.reject(new Error("Unknown chapter."));
      }
      var text;
      try {
        text = validateText(input.text);
      } catch (error) {
        return Promise.reject(error);
      }
      return enqueue(function () {
        return readComments().then(function (all) {
          var parentId = null;
          if (input.parentId) {
            var parent = all.find(function (c) {
              return c.id === input.parentId;
            });
            if (!parent || parent.chapterId !== input.chapterId) {
              throw new Error("The comment you are replying to no longer exists.");
            }
            /* Keep threads one level deep: replies to replies attach
               to the top-level parent. */
            parentId = parent.parentId || parent.id;
          }
          var comment = {
            id: makeId(),
            chapterId: input.chapterId,
            parentId: parentId,
            userId: input.userId,
            authorName: input.authorName || "Reader",
            authorAvatar: input.authorAvatar || null,
            text: text,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            edited: false,
            likedBy: [],
          };
          all.push(comment);
          return adapter.write(all).then(function () {
            return comment;
          });
        });
      });
    },

    /* Only the author may edit their own comment. */
    update: function (id, userId, text) {
      return enqueue(function () {
        return readComments().then(function (all) {
          var comment = all.find(function (c) {
            return c.id === id;
          });
          if (!comment) throw new Error("Comment not found.");
          if (comment.userId !== userId) {
            throw new Error("You can only edit your own comments.");
          }
          var value = validateText(text);
          comment.text = value;
          comment.edited = true;
          comment.updatedAt = new Date().toISOString();
          return adapter.write(all).then(function () {
            return comment;
          });
        });
      });
    },

    /* Only the author may delete their own comment; its replies go
       with it. */
    remove: function (id, userId) {
      return enqueue(function () {
        return readComments().then(function (all) {
          var comment = all.find(function (c) {
            return c.id === id;
          });
          if (!comment) throw new Error("Comment not found.");
          if (comment.userId !== userId) {
            throw new Error("You can only delete your own comments.");
          }
          var keep = all.filter(function (c) {
            return c.id !== id && c.parentId !== id;
          });
          return adapter.write(keep);
        });
      });
    },

    /* One like per user per comment: the same user liking again
       removes their like. */
    toggleLike: function (id, userId) {
      if (!userId) {
        return Promise.reject(new Error("Sign in to like comments."));
      }
      return enqueue(function () {
        return readComments().then(function (all) {
          var comment = all.find(function (c) {
            return c.id === id;
          });
          if (!comment) throw new Error("Comment not found.");
          var index = comment.likedBy.indexOf(userId);
          if (index > -1) {
            comment.likedBy.splice(index, 1);
          } else {
            comment.likedBy.push(userId);
          }
          return adapter.write(all).then(function () {
            return comment.likedBy.length;
          });
        });
      });
    },
  };
})();
