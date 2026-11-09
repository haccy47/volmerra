/* ============================================================
   VOLMERRA — Characters pages
   ------------------------------------------------------------
   Two public views, dispatched by <body data-page="…">:

     overview  pages/characters.html   compact gallery: portrait
                                       + full name per character,
                                       clickable to the profile
     profile   pages/character.html    ?id=… dedicated profile:
                                       portrait (season-aware),
                                       name, biography, age,
                                       affiliations and other info

   One profile per character, straight from the CMS data layer —
   nothing duplicated. Seasonal portraits follow the Season
   Release & Visibility system: only published seasons render,
   the selector on the profile page lists released seasons with
   portraits only, and the fallback never crosses an unreleased
   season.
   ============================================================ */

(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Visitors only ever see published seasons. */
  var currentSeason =
    (window.VolmerraSeasons && window.VolmerraSeasons.latestPublished()) ||
    "s1";

  function portraitNode(item) {
    var src = window.VolmerraCMS.portraitFor(item, currentSeason);
    if (src) {
      var img = el("img", "character-portrait");
      img.src = src;
      img.alt =
        "Portrait of " +
        (item.name || "character") +
        " — " +
        currentSeason.toUpperCase();
      return img;
    }
    return el(
      "div",
      "character-portrait placeholder placeholder--square",
      "No portrait available for " + currentSeason.toUpperCase()
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.dataset.page;

    /* The profile page has no overview mount — dispatch by page, not
       by element, so the profile controller always runs there. */
    if (page === "profile") {
      initProfile();
      return;
    }

    var mount = document.getElementById("characters-mount");
    if (!mount) return;
    initOverview();
  });

    /* ---------- Season tabs (shared by both views) ---------- */

    function seasonTabs(onPick) {
      var bar = el("div", "filter-bar");
      var tabs = el("div", "filter-tabs");
      tabs.setAttribute("role", "group");
      tabs.setAttribute("aria-label", "Season");
      window.VolmerraChapters.seasons.forEach(function (season) {
        if (
          window.VolmerraSeasons &&
          !window.VolmerraSeasons.isPublic(season)
        ) {
          return; /* unreleased seasons are never listed publicly */
        }
        var tab = el(
          "button",
          "tab" + (season === currentSeason ? " is-active" : ""),
          season.toUpperCase()
        );
        tab.type = "button";
        tab.addEventListener("click", function () {
          currentSeason = season;
          tabs.querySelectorAll(".tab").forEach(function (node) {
            node.classList.toggle(
              "is-active",
              node.textContent === season.toUpperCase()
            );
          });
          onPick();
        });
        tabs.appendChild(tab);
      });
      bar.appendChild(tabs);
      return bar;
    }

    /* ---------- Overview: portrait + name, nothing else ---------- */

    function initOverview() {
      var mount = document.getElementById("characters-mount");
      if (!mount) return;
      window.VolmerraCMS.list("characters").then(function (characters) {
        mount.innerHTML = "";

        if (!characters.length) {
          mount.appendChild(
            el(
              "div",
              "empty-state",
              "No character profiles yet. Profiles created in the admin panel appear here — one profile per character, with a gallery of seasonal portraits."
            )
          );
          return;
        }

        mount.appendChild(seasonTabs(renderCards));

        var grid = el("div", "character-grid");
        mount.appendChild(grid);

        function renderCards() {
          grid.innerHTML = "";
          characters.forEach(function (item) {
            var card = el("a", "character-card");
            card.href =
              "character.html?id=" + encodeURIComponent(item.id);
            card.setAttribute(
              "aria-label",
              (item.name || "Character") + " profile"
            );
            card.appendChild(portraitNode(item));
            card.appendChild(
              el("h3", "character-card-name", item.name || "(unnamed)")
            );
            grid.appendChild(card);
          });
        }

        renderCards();
      });
    }

    /* ---------- Dedicated profile page ---------- */

    function initProfile() {
      var detail = document.getElementById("character-profile");
      if (!detail) return;

      function showError(message) {
        detail.hidden = true;
        var error = document.getElementById("character-error");
        error.hidden = false;
        document.getElementById("character-error-text").textContent =
          message;
      }

      var params = new URLSearchParams(window.location.search);
      var id = params.get("id");

      window.VolmerraCMS.list("characters").then(function (characters) {
        if (!characters.length) {
          showError("No character profiles exist yet.");
          return;
        }
        /* Direct visit without an id: open the first profile instead of
           a dead end (consistent with the chapter pages). */
        var item = null;
        characters.forEach(function (c) {
          if (c.id === id) item = c;
        });
        item = item || characters[0];

        document.getElementById("profile-portrait").innerHTML = "";
        document
          .getElementById("profile-portrait")
          .appendChild(portraitNode(item));

        document.getElementById("profile-name").textContent =
          item.name || "(unnamed character)";

        /* Details: only what actually exists in the character data. */
        var facts = document.getElementById("profile-facts");
        facts.innerHTML = "";
        if (item.season) {
          facts.appendChild(
            el("span", "badge", "Season " + item.season.toUpperCase())
          );
        }
        if (item.age) {
          facts.appendChild(el("span", "profile-fact", "Age: " + item.age));
        }
        if (item.affiliations) {
          facts.appendChild(
            el("span", "profile-fact", "Affiliations: " + item.affiliations)
          );
        }

        var bio = document.getElementById("profile-bio");
        bio.innerHTML = "";
        if (item.description) {
          bio.appendChild(el("p", null, item.description));
        }
        if (item.other) {
          bio.appendChild(el("p", null, item.other));
        }
        if (!item.description && !item.other) {
          bio.appendChild(
            el(
              "p",
              "empty-state",
              "No biography has been written for this character yet."
            )
          );
        }

        /* Season selector only when this character has portraits in
           more than one released season. */
        var seasonsWithPortraits = window.VolmerraCMS.portraitSeasons(
          item
        ).filter(function (s) {
          return (
            !window.VolmerraSeasons || window.VolmerraSeasons.isPublic(s)
          );
        });
        var bar = document.getElementById("profile-seasons");
        bar.innerHTML = "";
        if (seasonsWithPortraits.length > 1) {
          bar.appendChild(
            seasonTabs(function () {
              document
                .getElementById("profile-portrait")
                .replaceChildren(portraitNode(item));
            })
          );
        }

        detail.hidden = false;
      });
    }
})();
