/* ============================================================
   VOLMERRA — Chapter interactions
   ------------------------------------------------------------
   Save ("Kaydedilen Bölümler"), favorites ("Favori Bölümler")
   and the comment system, wired to the existing account +
   personal library layers.

   Guest rules (visible + restricted, never silent):
   - guests can read comments, see like counts and browse
   - guests cannot write, like, reply, save or favorite —
     clicking a restricted action shows a clean login/sign-up
     prompt

   Ownership and one-like-per-user rules are enforced in the
   comments data layer; in production they must also be
   enforced server-side. Local storage is per browser and is
   NOT cross-device persistence.
   ============================================================ */

(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function user() {
    return window.VolmerraAuth.currentUser();
  }

  function icon(name) {
    var paths = {
      bookmark:
        '<path d="M6 4h12v17l-6-4-6 4V4z"/>',
      heart:
        '<path d="M12 20.5S4 15 4 9.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15 12 20.5 12 20.5z"/>',
    };
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths[name] +
      "</svg>"
    );
  }

  function avatarNode(name, avatar, sizeClass) {
    if (avatar) {
      var img = el("img", "avatar " + (sizeClass || ""));
      img.src = avatar;
      img.alt = "";
      return img;
    }
    var initial = (name || "?").trim().charAt(0).toUpperCase();
    return el(
      "span",
      "avatar avatar--fallback " + (sizeClass || ""),
      initial
    );
  }

  function authPrompt(message) {
    var root = document.documentElement.getAttribute("data-root") || "";
    var wrap = el("div", "auth-prompt");
    wrap.setAttribute("role", "alert");
    wrap.appendChild(el("p", "auth-prompt-text", message));
    var actions = el("div", "auth-prompt-actions");
    var login = el("a", "btn btn--ghost btn--sm", "Log in");
    login.href = root + "pages/login.html";
    var signup = el("a", "btn btn--primary btn--sm", "Sign up");
    signup.href = root + "pages/signup.html";
    actions.appendChild(login);
    actions.appendChild(signup);
    wrap.appendChild(actions);
    return wrap;
  }

  var state = {
    chapterId: null,
    chapter: null,
    sort: "newest",
    editingId: null,
    replyToId: null,
    refreshComments: null,
  };

  /* ---------- Save & Favorite ---------- */

  function renderChapterActions(mount, chapter) {
    var u = user();
    mount.innerHTML = "";

    var saved = u && window.VolmerraLibrary.isSaved(u.id, chapter.id);
    var fav = u && window.VolmerraLibrary.isFavorite(u.id, chapter.id);

    var saveBtn = el(
      "button",
      "btn btn--ghost btn--sm action-btn" + (saved ? " is-active" : ""),
      saved ? "Saved" : "Save"
    );
    saveBtn.type = "button";
    saveBtn.setAttribute(
      "aria-pressed",
      String(!!saved)
    );
    saveBtn.innerHTML =
      icon("bookmark") +
      "<span>" +
      (saved ? "Saved" : "Save") +
      "</span>";
    saveBtn.addEventListener("click", function () {
      if (!user()) {
        mount.insertBefore(
          authPrompt("Sign in to save chapters to your library."),
          mount.firstChild
        );
        return;
      }
      window.VolmerraLibrary.toggleSaved(user().id, {
        id: chapter.id,
        title: chapter.title,
      });
      renderChapterActions(mount, chapter);
    });

    var favBtn = el(
      "button",
      "btn btn--ghost btn--sm action-btn action-btn--favorite" +
        (fav ? " is-active" : ""),
      fav ? "In Favorites" : "Favorite"
    );
    favBtn.type = "button";
    favBtn.setAttribute("aria-pressed", String(!!fav));
    favBtn.innerHTML = icon("heart") + "<span>" + favBtn.textContent + "</span>";
    favBtn.addEventListener("click", function () {
      if (!user()) {
        mount.insertBefore(
          authPrompt("Sign in to add chapters to your favorites."),
          mount.firstChild
        );
        return;
      }
      window.VolmerraLibrary.toggleFavorite(user().id, {
        id: chapter.id,
        title: chapter.title,
      });
      renderChapterActions(mount, chapter);
    });

    mount.appendChild(saveBtn);
    mount.appendChild(favBtn);

    /* Keep only one prompt visible in the mount. */
    mount.querySelectorAll(".auth-prompt").forEach(function (p, i) {
      if (i > 0) p.remove();
    });
  }

  /* ---------- Comments ---------- */

  function commentForm(mount) {
    var form = el("form", "comment-form");
    var textarea = el("textarea", "comment-input");
    textarea.placeholder = "Write a comment…";
    textarea.maxLength = 2000;
    textarea.rows = 3;
    textarea.required = true;
    var actions = el("div", "comment-form-actions");
    var submit = el("button", "btn btn--primary btn--sm", "Post Comment");
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(textarea);
    form.appendChild(actions);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var u = user();
      if (!u) return;
      window.VolmerraComments
        .add({
          userId: u.id,
          authorName: u.displayName,
          authorAvatar: u.avatar,
          chapterId: state.chapterId,
          text: textarea.value,
        })
        .then(function () {
          state.refreshComments();
        })
        .catch(function (error) {
          textarea.setCustomValidity(error.message);
          textarea.reportValidity();
          window.setTimeout(function () {
            textarea.setCustomValidity("");
          }, 3000);
        });
    });

    return form;
  }

  function replyForm(parentId) {
    var form = el("form", "comment-form comment-form--reply");
    var textarea = el("textarea", "comment-input reply-input");
    textarea.placeholder = "Reply…";
    textarea.maxLength = 2000;
    textarea.rows = 2;
    var actions = el("div", "comment-form-actions");
    var submit = el("button", "btn btn--primary btn--sm", "Reply");
    submit.type = "submit";
    var cancel = el("button", "btn btn--ghost btn--sm", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", function () {
      state.replyToId = null;
      state.refreshComments();
    });
    actions.appendChild(submit);
    actions.appendChild(cancel);
    form.appendChild(textarea);
    form.appendChild(actions);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var u = user();
      if (!u) return;
      window.VolmerraComments
        .add({
          userId: u.id,
          authorName: u.displayName,
          authorAvatar: u.avatar,
          chapterId: state.chapterId,
          text: textarea.value,
          parentId: parentId,
        })
        .then(function () {
          state.replyToId = null;
          state.refreshComments();
        })
        .catch(function (error) {
          textarea.setCustomValidity(error.message);
          textarea.reportValidity();
          window.setTimeout(function () {
            textarea.setCustomValidity("");
          }, 3000);
        });
    });

    return form;
  }

  function commentCard(c, isReply, mount) {
    var u = user();
    var own = u && c.userId === u.id;
    var liked = u && c.likedBy.indexOf(u.id) > -1;

    var card = el("div", "comment" + (isReply ? " comment--reply" : ""));
    card.appendChild(avatarNode(c.authorName, c.authorAvatar, "comment-avatar"));

    var main = el("div", "comment-main");

    var head = el("div", "comment-head");
    /* Yazar adı = profil sayfasına bağlantı: tıklayınca o okuyucunun
       herkese açık profili açılır. */
    var authorLink = document.createElement("a");
    authorLink.className = "comment-author";
    authorLink.href = "../pages/profile.html?id=" + encodeURIComponent(c.userId || "");
    authorLink.textContent = c.authorName;
    head.appendChild(authorLink);
    var date = el(
      "span",
      "comment-date",
      formatDate(c.createdAt) + (c.edited ? " (edited)" : "")
    );
    head.appendChild(date);
    main.appendChild(head);

    if (state.editingId === c.id) {
      var editor = el("form", "comment-form");
      var textarea = el("textarea", "comment-input");
      textarea.value = c.text;
      textarea.maxLength = 2000;
      textarea.rows = 2;
      var editActions = el("div", "comment-form-actions");
      var save = el("button", "btn btn--primary btn--sm", "Save");
      save.type = "submit";
      var cancel = el("button", "btn btn--ghost btn--sm", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", function () {
        state.editingId = null;
        state.refreshComments();
      });
      editActions.appendChild(save);
      editActions.appendChild(cancel);
      editor.appendChild(textarea);
      editor.appendChild(editActions);
      editor.addEventListener("submit", function (event) {
        event.preventDefault();
        window.VolmerraComments
          .update(c.id, user().id, textarea.value)
          .then(function () {
            state.editingId = null;
            state.refreshComments();
          })
          .catch(function (error) {
            textarea.setCustomValidity(error.message);
            textarea.reportValidity();
            window.setTimeout(function () {
              textarea.setCustomValidity("");
            }, 3000);
          });
      });
      main.appendChild(editor);
    } else {
      main.appendChild(el("p", "comment-text", c.text));
    }

    var actions = el("div", "comment-actions");
    var like = el(
      "button",
      "comment-action like-btn" + (liked ? " is-liked" : "")
    );
    like.type = "button";
    like.innerHTML = icon("heart") + "<span>" + c.likedBy.length + "</span>";
    like.setAttribute("aria-label", "Like comment");
    like.addEventListener("click", function () {
      if (!user()) {
        mount.insertBefore(
          authPrompt("Sign in to like comments."),
          mount.firstChild
        );
        return;
      }
      window.VolmerraComments
        .toggleLike(c.id, user().id)
        .then(function () {
          state.refreshComments();
        })
        .catch(function () {});
    });
    actions.appendChild(like);

    if (!isReply) {
      var reply = el("button", "comment-action", "Reply");
      reply.type = "button";
      reply.addEventListener("click", function () {
        if (!user()) {
          mount.insertBefore(
            authPrompt("Sign in to reply to comments."),
            mount.firstChild
          );
          return;
        }
        state.replyToId = state.replyToId === c.id ? null : c.id;
        state.refreshComments();
      });
      actions.appendChild(reply);
    }

    if (own) {
      var edit = el("button", "comment-action", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () {
        state.editingId = c.id;
        state.replyToId = null;
        state.refreshComments();
      });
      actions.appendChild(edit);

      var del = el("button", "comment-action comment-action--danger", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        var hasReplies = !isReply && c.replies.length > 0;
        if (
          window.confirm(
            "Delete this comment" +
              (hasReplies ? " and its replies" : "") +
              "? This cannot be undone."
          )
        ) {
          window.VolmerraComments
            .remove(c.id, user().id)
            .then(state.refreshComments);
        }
      });
      actions.appendChild(del);
    }

    main.appendChild(actions);

    if (state.replyToId === c.id) {
      main.appendChild(replyForm(c.id));
    }

    card.appendChild(main);

    if (c.replies && c.replies.length) {
      var thread = el("div", "comment-replies");
      c.replies.forEach(function (r) {
        thread.appendChild(commentCard(r, true, mount));
      });
      card.appendChild(thread);
    }

    return card;
  }

  function renderComments(mount) {
    mount.innerHTML = "";

    function refresh() {
      state.refreshComments = refresh;
      window.VolmerraComments.list(state.chapterId).then(function (comments) {
        mount.innerHTML = "";

        var head = el("div", "comments-head");
        var total = comments.reduce(function (sum, c) {
          return sum + 1 + c.replies.length;
        }, 0);
        head.appendChild(
          el("h2", "comments-title", "Comments (" + total + ")")
        );

        var sortLabel = el("label", "comments-sort");
        sortLabel.htmlFor = "comment-sort";
        sortLabel.textContent = "Sort";
        var sort = el("select", null, null);
        sort.id = "comment-sort";
        [
          ["newest", "Newest"],
          ["liked", "Most liked"],
        ].forEach(function (pair) {
          var o = document.createElement("option");
          o.value = pair[0];
          o.textContent = pair[1];
          if (state.sort === pair[0]) o.selected = true;
          sort.appendChild(o);
        });
        sort.addEventListener("change", function () {
          state.sort = sort.value;
          refresh();
        });
        head.appendChild(sortLabel);
        head.appendChild(sort);
        mount.appendChild(head);

        if (!user()) {
          mount.appendChild(
            authPrompt("Sign in to write, like or reply to comments.")
          );
        } else {
          mount.appendChild(commentForm(mount));
        }

        if (!comments.length) {
          mount.appendChild(
            el(
              "div",
              "empty-state",
              "No comments yet. Be the first to share your thoughts."
            )
          );
          return;
        }

        var list = el("div", "comments-list");
        comments
          .slice()
          .sort(function (a, b) {
            if (state.sort === "liked") {
              var diff = b.likedBy.length - a.likedBy.length;
              if (diff !== 0) return diff;
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
          })
          .forEach(function (c) {
            list.appendChild(commentCard(c, false, mount));
          });
        mount.appendChild(list);
      });
    }

    refresh();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var actionsMount = document.getElementById("chapter-actions");
    var readActionsMount = document.getElementById("read-actions");
    var commentsMount = document.getElementById("comments-mount");
    if (!actionsMount && !readActionsMount && !commentsMount) return;

    var params = new URLSearchParams(window.location.search);
    var chapterId = params.get("id");

    /* Bind every interaction to the canonical chapter id from the data
       layer — the same id the homepage library sections render from. */
    function bind(chapterId) {
      state.chapterId = chapterId;
      var admin = window.VolmerraAuth.isAdmin();
      window.VolmerraChapters
        .get(chapterId, { includeDrafts: admin, all: admin })
        .then(function (c) {
          if (!c) return;
          state.chapter = c;
          if (actionsMount) renderChapterActions(actionsMount, c);
          if (readActionsMount) renderChapterActions(readActionsMount, c);
          if (commentsMount) {
            var section = commentsMount.closest("section");
            if (section) section.hidden = false;
            renderComments(commentsMount);
          }
        });
    }

    /* The backend adapter attaches asynchronously: without waiting,
       the localStorage fallback answers with stale or empty content.
       Wait for the real backend (or the timeout fallback) first. */
    window.VolmerraAuth.whenReady(function () {
      if (chapterId) {
        bind(chapterId);
      } else {
        /* No id in the URL: the detail and reading pages fall back to
           the most recently published chapter — the interactions must
           bind to that same chapter, never silently disappear. */
        window.VolmerraChapters.published().then(function (chapters) {
          if (!chapters.length) return;
          var latest = chapters
            .slice()
            .sort(function (a, b) {
              return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
            })[0];
          bind(latest.id);
        });
      }
    });
  });
})();
