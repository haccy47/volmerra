/* ============================================================
   VOLMERRA — Chapter detail page (cinematic hero)
   ------------------------------------------------------------
   Shows one chapter (?id=…) as a cinematic title page: full-width
   cover hero with the chapter information over the bottom-left,
   then a clean information section with the "Okumaya Başla" call
   to action. The chapter text itself is never shown here — reading
   happens on pages/read.html?id=… (a direct visit without an id
   falls back to the most recently published chapter).

   Only published chapters of released seasons are shown to
   visitors; administrators can privately preview drafts and
   unreleased seasons (draft badge shown).
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
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /* Rough reading-time estimate: ~200 words per minute. */
  function readingTime(text) {
    var words = String(text || "")
      .split(/\s+/)
      .filter(Boolean).length;
    if (!words) return null;
    return Math.max(1, Math.round(words / 200));
  }

  function showError(message) {
    document.getElementById("chapter-hero-section").hidden = true;
    document.getElementById("chapter-info-section").hidden = true;
    var error = document.getElementById("chapter-error");
    error.hidden = false;
    document.getElementById("chapter-error-text").textContent = message;
  }

  function render(c) {
    /* Hero media: uploaded cover, or a clean fallback. */
    var media = document.getElementById("chapter-hero-media");
    media.innerHTML = "";
    if (c.cover) {
      var img = el("img");
      img.src = c.cover;
      img.alt = "";
      media.appendChild(img);
    } else {
      media.classList.add("cinema-hero-media--empty");
      media.appendChild(el("p", "cinema-hero-wordmark", "VOLMERRA"));
    }

    document.getElementById("chapter-number").textContent = c.number;
    document.getElementById("chapter-season").textContent =
      "Season " + c.season.toUpperCase();
    var status = document.getElementById("chapter-status");
    if (c.status !== "published") {
      status.textContent = "Draft preview";
      status.hidden = false;
    } else {
      status.hidden = true;
    }
    document.getElementById("chapter-title").textContent = c.title;

    var desc = document.getElementById("chapter-desc");
    if (c.description) {
      desc.textContent = c.description;
      desc.hidden = false;
    } else {
      desc.hidden = true;
    }

    document.getElementById("fact-season").textContent =
      c.season.toUpperCase();
    document.getElementById("fact-number").textContent = c.number;
    if (c.publishedAt) {
      document.getElementById("fact-published").hidden = false;
      document.getElementById("fact-date").textContent = formatDate(
        c.publishedAt
      );
    } else {
      document.getElementById("fact-published").hidden = true;
    }
    var minutes = readingTime(c.content);
    if (minutes) {
      document.getElementById("fact-reading").hidden = false;
      document.getElementById("fact-time").textContent =
        "~" + minutes + " min";
    } else {
      document.getElementById("fact-reading").hidden = true;
    }

    document.getElementById("read-cta").href =
      "read.html?id=" + encodeURIComponent(c.id);

    document.getElementById("chapter-hero-section").hidden = false;
    document.getElementById("chapter-info-section").hidden = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");

    /* The backend adapter attaches asynchronously: without waiting,
       the localStorage fallback answers with stale or empty content
       and the page freezes on it. Wait for the real backend (or the
       timeout fallback) before loading. */
    window.VolmerraAuth.whenReady(function () {
      var admin = window.VolmerraAuth.isAdmin();

      if (!id) {
        /* Direct visit without a chapter id: fall back to the most
           recently published chapter instead of a dead end. */
        window.VolmerraChapters.published().then(function (chapters) {
          if (!chapters.length) {
            showError("No chapters have been published yet.");
            return;
          }
          var latest = chapters.slice().sort(function (a, b) {
            return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
          })[0];
          render(latest);
        });
        return;
      }

      window.VolmerraChapters
        .get(id, { includeDrafts: admin, all: admin })
        .then(function (c) {
          if (!c) {
            showError(
              "This chapter is not available. It may be an unpublished draft, belongs to a season that has not been released yet, or was removed."
            );
            return;
          }
          render(c);
        });
    });
  });
})();
