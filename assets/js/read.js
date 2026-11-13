/* ============================================================
   VOLMERRA — Dedicated reading page
   ------------------------------------------------------------
   Renders one chapter (?id=…) in the site's reading layout: the
   uploaded TXT content is parsed into paragraphs (never offered
   as a raw file), with adjustable text size, light/dark support,
   comfortable line length and a back link to the chapter's
   cinematic detail page.

   Reading progress is tracked for signed-in readers so the
   chapter appears under Continue Reading on their homepage.
   ============================================================ */

(function () {
  "use strict";

  var FONT_KEY = "volmerra:reader-font-size";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function showError(message) {
    document.getElementById("reader-page-section").hidden = true;
    var error = document.getElementById("reader-error");
    error.hidden = false;
    document.getElementById("reader-error-text").textContent = message;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mount = document.getElementById("reader-content");
    if (!mount) return;

    /* Adjustable text size, persisted per visitor. */
    var size = 18;
    try {
      var saved = parseInt(localStorage.getItem(FONT_KEY), 10);
      if (saved >= 15 && saved <= 26) size = saved;
    } catch (e) {}
    function applySize() {
      mount.style.fontSize = size + "px";
      try {
        localStorage.setItem(FONT_KEY, String(size));
      } catch (e) {}
    }
    function step(delta) {
      size = Math.min(26, Math.max(15, size + delta));
      applySize();
    }
    document
      .getElementById("font-smaller")
      .addEventListener("click", function () {
        step(-1);
      });
    document
      .getElementById("font-larger")
      .addEventListener("click", function () {
        step(1);
      });
    applySize();

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    /* isAdmin() is only meaningful once the backend session has been
       restored — read it inside the whenReady callback below. */
    var admin = null;

    function load(id) {
      window.VolmerraChapters
        .get(id, { includeDrafts: admin, all: admin })
        .then(function (c) {
          if (!c) {
            showError(
              "This chapter is not available. It may be an unpublished draft, belongs to a season that has not been released yet, or was removed."
            );
            return;
          }

          document.getElementById("reader-number").textContent = c.number;
          document.getElementById("reader-season").textContent =
            "Season " + c.season.toUpperCase();
          var status = document.getElementById("reader-status");
          if (c.status !== "published") {
            status.textContent = "Draft preview";
            status.hidden = false;
          }
          document.getElementById("reader-title").textContent = c.title;
          document.getElementById("reader-back").href =
            "chapter.html?id=" + encodeURIComponent(c.id);

          /* Parsed TXT content: paragraphs from blank lines, line
             breaks preserved — never a raw file download. */
          window.VolmerraChapters.appendContent(mount, c.content);
          if (!c.content) {
            mount.appendChild(
              el(
                "div",
                "empty-state",
                "This chapter has no text content yet. Once the chapter file is uploaded in the admin panel, it will be readable here."
              )
            );
          }

          document.getElementById("reader-page-section").hidden = false;
          trackReading(c);
        });
    }

    /* The backend adapter attaches asynchronously (config → client
       library → adapter): without waiting, the localStorage fallback
       answers with stale or empty content and the page freezes on it.
       Wait for the real backend (or the timeout fallback) first. */
    window.VolmerraAuth.whenReady(function () {
      admin = window.VolmerraAuth.isAdmin();
      if (!id) {
        /* Direct visit without a chapter id: open the most recently
           published chapter instead of a dead end. */
        window.VolmerraChapters.published().then(function (chapters) {
          if (!chapters.length) {
            showError("No chapters have been published yet.");
            return;
          }
          var latest = chapters.slice().sort(function (a, b) {
            return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
          })[0];
          load(latest.id);
        });
        return;
      }

      load(id);
    });
  });

  function trackReading(chapter) {
    var user = window.VolmerraAuth.currentUser();
    if (!user || !window.VolmerraLibrary) return;

    var title = chapter.number + " — " + chapter.title;
    var last = 0;

    function record(percent) {
      window.VolmerraLibrary.trackReading(user.id, {
        id: chapter.id,
        title: title,
        percent: percent,
      });
    }

    record(0);

    /* "Bitirdim": mark the chapter as completed — progress jumps to
       100%, the chapter leaves Continue Reading and stays in Reading
       History with its completed status. */
    var completeBtn = document.getElementById("read-completed");
    var lib = window.VolmerraLibrary.get(user.id);
    var alreadyDone = lib.history.some(function (h) {
      return h.id === chapter.id && h.completed;
    });
    function markCompleted() {
      completeBtn.disabled = true;
      completeBtn.textContent = "Completed";
      completeBtn.classList.add("is-done");
    }
    if (alreadyDone) markCompleted();
    if (completeBtn) {
      completeBtn.addEventListener("click", function () {
        record(100);
        markCompleted();
      });
    }

    var pending = null;
    window.addEventListener(
      "scroll",
      function () {
        if (pending) return;
        pending = window.setTimeout(function () {
          pending = null;
          var doc = document.documentElement;
          var max = doc.scrollHeight - window.innerHeight;
          var percent =
            max > 0
              ? Math.min(100, Math.round((window.scrollY / max) * 100))
              : 100;
          if (percent - last >= 5) {
            last = percent;
            record(percent);
          }
        }, 500);
      },
      { passive: true }
    );
  }
})();
