/* ============================================================
   VOLMERRA — Homepage
   Renders the guest or authenticated homepage depending on
   the current session. Both layouts live in index.html; the
   member layout stays hidden until a session exists.
   ============================================================ */

(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  /* Every library reference is validated against the CURRENT chapter
     collection before display: entries pointing at deleted, unpublished
     or no-longer-accessible chapters are pruned from the stored library
     itself (valid progress is never reset), and sections render from
     live chapter records — never from cached titles. */
  function renderMemberHome(user) {
    var nameEl = document.getElementById("member-name");
    if (nameEl) {
      nameEl.textContent = user.displayName;
    }

    window.VolmerraChapters.published().then(function (published) {
      var byId = {};
      published.forEach(function (c) {
        byId[c.id] = c;
      });

      /* Prune stale references out of the stored library first. */
      var library = window.VolmerraLibrary.prune(user.id, byId);

      renderContinueReading(library.continueReading, byId);
      renderHistory(library.history, byId);
      renderLibraryCards(
        "favorites-list",
        library.favorites,
        byId,
        "You have not marked any chapters as favorite yet. Use the favorite control on a chapter page to add it here."
      );
      renderLibraryCards(
        "saved-list",
        library.saved,
        byId,
        "No saved chapters yet. Use the save control on a chapter page to keep it here."
      );

      /* Library counts reflect the pruned lists. */
      var stats = {
        "stat-favorites": library.favorites.length,
        "stat-saved": library.saved.length,
        "stat-history": library.history.length,
      };
      Object.keys(stats).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.textContent = stats[id];
        }
      });

      var subEl = document.getElementById("member-sub");
      if (subEl) {
        subEl.textContent =
          "Welcome back, " + user.displayName + ". The story continues where you left it.";
      }
    });
  }

  /* Continue Reading: the chapter the reader can resume. Cover, current
     title and code from the live record, progress bar, and a clear
     Continue Reading action. */
  function renderContinueReading(items, byId) {
    var mount = document.getElementById("continue-reading");
    if (!mount) return;

    if (!items.length) {
      mount.innerHTML =
        '<div class="empty-state">Your next adventure awaits.</div>';
      return;
    }

    mount.innerHTML = items
      .map(function (item) {
        var c = byId[item.id];
        var cover = c.cover
          ? '<img class="reading-card-cover" src="' + c.cover + '" alt="">'
          : '<div class="reading-card-cover reading-card-cover--empty"><span>VOLMERRA</span></div>';
        var progress =
          '<div class="reading-progress"><div class="progress">' +
          '<div class="progress-fill" style="width:' +
          Math.round(item.percent || 0) +
          '%"></div></div>' +
          '<p class="reading-progress-label">' +
          Math.round(item.percent || 0) +
          "% read</p></div>";
        return (
          '<div class="reading-card">' +
          cover +
          '<div class="reading-card-body">' +
          '<p class="reading-card-code">' +
          escapeHtml(c.number) +
          "</p>" +
          '<p class="reading-card-title">' +
          escapeHtml(c.title) +
          "</p>" +
          progress +
          '<a class="btn btn--primary btn--sm" href="pages/read.html?id=' +
          encodeURIComponent(item.id) +
          '">Continue Reading</a>' +
          "</div></div>"
        );
      })
      .join("");
  }

  /* Reading History: a chronological personal archive (most recent
     first) of chapters actually opened — covers, codes and last-read
     dates. Duplicate entries are impossible by design: the library
     upserts per chapter id and refreshes its last-read date. */
  function renderHistory(items, byId) {
    var mount = document.getElementById("history-list");
    if (!mount) return;

    if (!items.length) {
      mount.innerHTML =
        '<div class="empty-state">Your reading journey will appear here.</div>';
      return;
    }

    mount.innerHTML = items
      .map(function (item) {
        var c = byId[item.id];
        var cover = c.cover
          ? '<img class="history-cover" src="' + c.cover + '" alt="">'
          : '<div class="history-cover history-cover--empty"><span>VOLMERRA</span></div>';
        return (
          '<a class="history-item" href="pages/read.html?id=' +
          encodeURIComponent(item.id) +
          '">' +
          cover +
          '<span class="history-body">' +
          '<span class="history-code">' +
          escapeHtml(c.number) +
          "</span>" +
          '<span class="history-title">' +
          escapeHtml(c.title) +
          "</span>" +
          '<span class="history-date">Last read ' +
          escapeHtml(formatLibraryDate(item.updatedAt)) +
          "</span>" +
          (item.completed
            ? '<span class="badge badge--published">Completed</span>'
            : "") +
          "</span></a>"
        );
      })
      .join("");
  }

  /* Favori Bölümler / Kaydedilen Bölümler: cover cards consistent
     with the Continue Reading design, rendered from live records. */
  function renderLibraryCards(mountId, items, byId, emptyText) {
    var mount = document.getElementById(mountId);
    if (!mount) return;

    if (!items.length) {
      mount.innerHTML = '<div class="empty-state">' + emptyText + "</div>";
      return;
    }

    mount.innerHTML = items
      .map(function (item) {
        var c = byId[item.id];
        var cover = c.cover
          ? '<img class="reading-card-cover" src="' + c.cover + '" alt="">'
          : '<div class="reading-card-cover reading-card-cover--empty"><span>VOLMERRA</span></div>';
        return (
          '<div class="reading-card">' +
          cover +
          '<div class="reading-card-body">' +
          '<p class="reading-card-code">' +
          escapeHtml(c.number) +
          "</p>" +
          '<p class="reading-card-title">' +
          escapeHtml(c.title) +
          "</p>" +
          '<a class="btn btn--ghost btn--sm" href="pages/chapter.html?id=' +
          encodeURIComponent(item.id) +
          '">Open chapter</a>' +
          "</div></div>"
        );
      })
      .join("");
  }

  function formatLibraryDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /* ============================================================
     Chapter cover gallery + SON YAYINLANAN BÖLÜM
     ------------------------------------------------------------
     The homepage no longer lists chapter names as flat rows:
     every published chapter is a cover in a horizontal gallery
     (several visible on desktop, horizontal scroll on mobile).
     Only the chapter code shows below a cover; the title fades
     in over the cover on hover (desktop) or tap (mobile). The
     "SON YAYINLANAN BÖLÜM" section features the newest published
     chapter — newest by publication date, NOT by number — with
     cover, title, code, description and a read button, and
     re-renders automatically whenever a chapter publishes.
     ============================================================ */

  /* Each cover glows in its own season's theme color. */
  var SEASON_ACCENTS = {
    s1: "#e4bc54",
    s2: "#54265f",
    s3: "#a5dceb",
    s4: "#d52e38",
    s5: "#20bfd0",
    s6: "#c49a42",
    s7: "#243b75",
    s8: "#6d7178",
  };

  function galleryCard(c) {
    var card = el("a", "cover-card");
    card.href = "pages/chapter.html?id=" + encodeURIComponent(c.id);
    card.style.setProperty(
      "--card-accent",
      SEASON_ACCENTS[c.season] || "var(--season-accent)"
    );
    card.setAttribute("aria-label", c.number + " — " + c.title);

    var media = el("div", "cover-card-media");
    if (c.cover) {
      var img = el("img");
      img.src = c.cover;
      img.alt = "";
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      media.classList.add("cover-card-media--empty");
      media.appendChild(el("p", "cover-card-wordmark", "VOLMERRA"));
    }
    /* Title hidden normally; fades in over the cover on hover or
       selection. */
    media.appendChild(el("p", "cover-card-title", c.title));
    card.appendChild(media);
    card.appendChild(el("span", "cover-card-code", c.number));
    return card;
  }

  /* Touch devices have no hover: first tap selects (same glow +
     title reveal), tapping another cover moves the selection, and
     tapping the selected cover again opens the chapter page. */
  function bindGallerySelection(mount) {
    mount.addEventListener("click", function (event) {
      var card = event.target.closest(".cover-card");
      if (!card) return;
      var hoverCapable = window.matchMedia
        ? window.matchMedia("(hover: hover)").matches
        : true;
      if (hoverCapable) return; /* desktop: plain navigation */
      if (!card.classList.contains("is-selected")) {
        event.preventDefault();
        mount
          .querySelectorAll(".cover-card.is-selected")
          .forEach(function (n) {
            n.classList.remove("is-selected");
          });
        card.classList.add("is-selected");
      }
      /* second tap on the selected cover: let the navigation happen */
    });
  }

  function renderChapterGallery() {
    if (!window.VolmerraChapters) return;
    window.VolmerraChapters.published().then(function (chapters) {
      ["chapter-gallery-guest", "chapter-gallery-member"].forEach(function (
        mountId
      ) {
        var mount = document.getElementById(mountId);
        if (!mount) return;
        mount.innerHTML = "";
        if (!chapters.length) {
          mount.innerHTML =
            '<div class="empty-state">No chapters have been published yet. Once chapters go live, they appear here as a cover gallery.</div>';
          return;
        }
        chapters.forEach(function (c) {
          mount.appendChild(galleryCard(c));
        });
        bindGallerySelection(mount);
      });
    });
  }

  function renderLatestChapter() {
    if (!window.VolmerraChapters) return;
    var body = document.getElementById("latest-chapter-body");
    var section = document.getElementById("latest-chapter");
    if (!body || !section) return;

    window.VolmerraChapters.published().then(function (chapters) {
      body.innerHTML = "";
      section.hidden = false;
      if (!chapters.length) {
        body.appendChild(
          el(
            "div",
            "empty-state",
            "No chapters have been published yet. The newest chapter will be featured here the moment it goes live."
          )
        );
        return;
      }
      /* SON YAYINLANAN BÖLÜM = newest by publication date, not by
         chapter number. */
      var latest = chapters
        .slice()
        .sort(function (a, b) {
          return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
        })[0];

      var card = el("div", "latest-chapter");

      var cover = el(
        "a",
        "latest-chapter-cover" + (latest.cover ? "" : " latest-chapter-cover--empty")
      );
      cover.href = "pages/chapter.html?id=" + encodeURIComponent(latest.id);
      if (latest.cover) {
        var img = el("img");
        img.src = latest.cover;
        img.alt = "Cover of " + latest.number;
        cover.appendChild(img);
      } else {
        cover.appendChild(el("span", null, "VOLMERRA"));
      }
      card.appendChild(cover);

      var info = el("div", "latest-chapter-info");
      info.appendChild(el("span", "badge", latest.number));
      info.appendChild(el("h3", "latest-chapter-title", latest.title));
      if (latest.description) {
        info.appendChild(el("p", "latest-chapter-desc", latest.description));
      }
      var cta = el("a", "btn btn--primary", "Okumaya Başla");
      cta.href = "pages/read.html?id=" + encodeURIComponent(latest.id);
      info.appendChild(cta);
      card.appendChild(info);

      body.appendChild(card);
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var guest = document.getElementById("home-guest");
    var member = document.getElementById("home-member");
    if (!guest || !member) return;

    var user = window.VolmerraAuth.currentUser();
    if (user) {
      guest.hidden = true;
      member.hidden = false;
      renderMemberHome(user);
    } else {
      guest.hidden = false;
      member.hidden = true;
    }

    renderChapterGallery();
    renderLatestChapter();
    initHero();
  });

  /* Live refresh for the real backend (Supabase adapter): when the
     session is restored or the reader's library row arrives, re-run
     the member/guest switch and re-render the library panels. The
     localStorage flow never fires these events. */
  function refreshHomeAuth() {
    var guest = document.getElementById("home-guest");
    var member = document.getElementById("home-member");
    if (!guest || !member) return;
    var user = window.VolmerraAuth.currentUser();
    if (user) {
      guest.hidden = true;
      member.hidden = false;
      renderMemberHome(user);
    } else {
      guest.hidden = false;
      member.hidden = true;
    }
  }
  document.addEventListener("volmerra:auth-ready", refreshHomeAuth);
  document.addEventListener("volmerra:library-loaded", function () {
    if (window.VolmerraAuth.currentUser()) renderMemberHome(window.VolmerraAuth.currentUser());
  });

  /* ============================================================
     Cinematic countdown hero
     ------------------------------------------------------------
     Reads the real scheduled publication date from the chapter
     scheduling system (no hardcoded values, ISO dates are
     timezone-safe). Rules:
       - next scheduled chapter ≤7 days away → countdown hero
         replaces the normal hero (urgent styling under 24h)
       - >7 days away → normal hero + compact teaser strip
       - at zero → the chapter publishes through the existing
         publishDue() mechanism, the countdown disappears and the
         new chapter becomes the featured hero
       - no scheduling data → normal hero, untouched
     Honest limit: the publication flip runs while the site is
     open in a browser; reliable publishing without a visitor
     requires the future server-side scheduler.
     ============================================================ */

  var heroTimer = null;
  var WEEK = 7 * 24 * 60 * 60 * 1000;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function hideNormalHeroes() {
    var guestHero = document.querySelector("#home-guest .hero");
    var memberGreeting = document.querySelector(
      "#home-member .member-greeting"
    );
    if (guestHero) guestHero.hidden = true;
    if (memberGreeting) memberGreeting.hidden = true;
  }

  function setCountdownValues(prefix, at) {
    var diff = new Date(at).getTime() - Date.now();
    if (diff < 0) diff = 0;
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);
    var seconds = Math.floor((diff % 60000) / 1000);
    document.getElementById(prefix + "-days").textContent = pad(days);
    document.getElementById(prefix + "-hours").textContent = pad(hours);
    document.getElementById(prefix + "-minutes").textContent = pad(minutes);
    document.getElementById(prefix + "-seconds").textContent = pad(seconds);
    return diff;
  }

  function initHero() {
    if (!window.VolmerraChapters) return;

    window.VolmerraChapters.upcoming().then(function (upcoming) {
      var next = upcoming[0];

      if (next && new Date(next.scheduledAt).getTime() - Date.now() <= WEEK) {
        renderCountdownHero(next);
        return;
      }

      window.VolmerraChapters.published().then(function (published) {
        var newest = published
          .slice()
          .sort(function (a, b) {
            return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
          })[0];

        if (
          newest &&
          newest.publishedAt &&
          Date.now() - new Date(newest.publishedAt).getTime() <= WEEK
        ) {
          renderFeatureHero(newest);
          return;
        }

        if (next) renderUpcomingTeaser(next);
      });
    });
  }

  function renderCountdownHero(chapter) {
    hideNormalHeroes();

    var media = document.getElementById("countdown-media");
    media.innerHTML = "";
    if (chapter.cover) {
      var img = el("img");
      img.src = chapter.cover;
      img.alt = "";
      media.appendChild(img);
    } else {
      media.classList.add("cinema-hero-media--empty");
      media.appendChild(el("p", "cinema-hero-wordmark", "VOLMERRA"));
    }

    document.getElementById("countdown-title").textContent = chapter.title;
    document.getElementById("countdown-meta").textContent =
      chapter.number +
      " · Season " +
      chapter.season.toUpperCase() +
      " · " +
      new Date(chapter.scheduledAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });

    var hero = document.getElementById("hero-countdown");
    hero.hidden = false;

    function tick() {
      var diff = new Date(chapter.scheduledAt).getTime() - Date.now();
      if (diff <= 0) {
        window.clearInterval(heroTimer);
        heroTimer = null;
        /* Prototype auto-publish: the chapter flips to published via
           the existing scheduling mechanism; a real release while
           nobody is online needs the server-side scheduler. */
        window.VolmerraChapters.publishDue().then(function () {
          /* The chapter is public now: refresh the gallery, the
             SON YAYINLANAN BÖLÜM section and the hero itself, and
             notify the signed-in reader. */
          renderChapterGallery();
          renderLatestChapter();
          if (window.VolmerraNotifications) {
            window.VolmerraNotifications.add({
              title: "New chapter published",
              body: chapter.number + " — " + chapter.title,
              href: "pages/chapter.html?id=" + chapter.id,
            });
          }
          renderFeatureHero(chapter);
        });
        return;
      }
      document
        .getElementById("hero-countdown")
        .classList.toggle(
          "hero-countdown--urgent",
          diff < 24 * 60 * 60 * 1000
        );
      setCountdownValues("cd", chapter.scheduledAt);
    }

    if (heroTimer) window.clearInterval(heroTimer);
    tick();
    heroTimer = window.setInterval(tick, 1000);
  }

  function renderFeatureHero(chapter) {
    hideNormalHeroes();

    var media = document.getElementById("feature-media");
    media.innerHTML = "";
    if (chapter.cover) {
      var img = el("img");
      img.src = chapter.cover;
      img.alt = "";
      media.appendChild(img);
    } else {
      media.classList.add("cinema-hero-media--empty");
      media.appendChild(el("p", "cinema-hero-wordmark", "VOLMERRA"));
    }

    document.getElementById("feature-title").textContent = chapter.title;
    document.getElementById("feature-meta").textContent =
      chapter.number +
      " · Season " +
      chapter.season.toUpperCase() +
      (chapter.publishedAt
        ? " · " +
          new Date(chapter.publishedAt).toLocaleDateString(undefined, {
            dateStyle: "medium",
          })
        : "");
    document.getElementById("feature-cta").href =
      "pages/chapter.html?id=" + encodeURIComponent(chapter.id);

    var feature = document.getElementById("hero-feature");
    feature.hidden = false;
    document.getElementById("hero-countdown").hidden = true;
  }

  function renderUpcomingTeaser(chapter) {
    document.getElementById("upcoming-title").textContent =
      chapter.number + " — " + chapter.title;
    document.getElementById("upcoming-meta").textContent =
      "Season " +
      chapter.season.toUpperCase() +
      " · " +
      new Date(chapter.scheduledAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });

    var section = document.getElementById("hero-upcoming");
    section.hidden = false;

    if (heroTimer) return; /* strip ticks with the hero timer */
    heroTimer = window.setInterval(function () {
      setCountdownValues("up", chapter.scheduledAt);
    }, 1000);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
})();
