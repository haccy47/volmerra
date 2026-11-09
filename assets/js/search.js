/* ============================================================
   VOLMERRA — Site search
   ------------------------------------------------------------
   One overlay, opened from the navbar search buttons
   ([data-search-open]) on desktop and mobile. Searches the
   published, publicly visible content only — the data layers
   themselves filter out drafts and unreleased seasons:

     Chapters    VolmerraChapters.published()
     Characters  VolmerraCMS.list("characters")
     Places      VolmerraCMS.list("locations")
     Lore        VolmerraCMS.list("lore")
     Pages       the site's own main pages

   Results are grouped by type and link to their pages.
   ============================================================ */

(function () {
  "use strict";

  var ROOT = document.documentElement.getAttribute("data-root") || "";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  var STATIC_PAGES = [
    { label: "Story", href: "pages/story.html", keywords: "story chapters reading" },
    { label: "Characters", href: "pages/characters.html", keywords: "characters profiles people" },
    { label: "Places", href: "pages/places.html", keywords: "places regions locations" },
    { label: "Universe", href: "pages/universe.html", keywords: "universe lore world" },
    { label: "Gallery", href: "pages/gallery.html", keywords: "gallery artwork images" },
    { label: "About", href: "pages/about.html", keywords: "about accounts library help" },
  ];

  var overlay = null;
  var input = null;
  var resultsMount = null;

  function build() {
    overlay = el("div", "search-overlay");
    overlay.hidden = true;
    var panel = el("div", "search-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Search");

    var bar = el("div", "search-bar");
    input = document.createElement("input");
    input.type = "search";
    input.className = "search-input";
    input.placeholder = "Search chapters, characters, places…";
    input.setAttribute("aria-label", "Search");
    var close = el("button", "icon-btn", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "Close search");
    close.addEventListener("click", closeSearch);
    bar.appendChild(input);
    bar.appendChild(close);
    panel.appendChild(bar);

    resultsMount = el("div", "search-results");
    panel.appendChild(resultsMount);
    overlay.appendChild(panel);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeSearch();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !overlay.hidden) closeSearch();
    });
    input.addEventListener("input", function () {
      runSearch(input.value.trim().toLowerCase());
    });
    document.body.appendChild(overlay);
  }

  function openSearch() {
    if (!overlay) build();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    input.value = "";
    runSearch("");
    input.focus();
  }

  function closeSearch() {
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function resultLink(label, href, note) {
    var a = el("a", "search-result");
    a.href = href;
    a.appendChild(el("span", "search-result-label", label));
    if (note) a.appendChild(el("span", "search-result-note", note));
    return a;
  }

  function matches(text, q) {
    return String(text || "").toLowerCase().indexOf(q) > -1;
  }

  function runSearch(q) {
    resultsMount.innerHTML = "";

    var quick = el("div", "search-quick");
    STATIC_PAGES.forEach(function (p) {
      quick.appendChild(resultLink(p.label, ROOT + p.href));
    });
    resultsMount.appendChild(quick);

    if (!q) return;

    /* Data layers are optional per page: login/signup only load auth,
       so every source degrades gracefully to an empty list. */
    var chaptersP =
      window.VolmerraChapters && window.VolmerraChapters.published
        ? window.VolmerraChapters.published()
        : Promise.resolve([]);
    var charactersP =
      window.VolmerraCMS && window.VolmerraCMS.list
        ? window.VolmerraCMS.list("characters")
        : Promise.resolve([]);
    var locationsP =
      window.VolmerraCMS && window.VolmerraCMS.list
        ? window.VolmerraCMS.list("locations")
        : Promise.resolve([]);
    var loreP =
      window.VolmerraCMS && window.VolmerraCMS.list
        ? window.VolmerraCMS.list("lore")
        : Promise.resolve([]);

    Promise.all([chaptersP, charactersP, locationsP, loreP])
      .then(function (all) {
      resultsMount.innerHTML = "";
      var found = 0;

      var chapters = all[0].filter(function (c) {
        return matches(c.title + " " + c.number + " " + c.description, q);
      });
      if (chapters.length) {
        resultsMount.appendChild(el("p", "search-group", "Chapters"));
        chapters.forEach(function (c) {
          resultsMount.appendChild(
            resultLink(
              c.number + " — " + c.title,
              ROOT + "pages/chapter.html?id=" + encodeURIComponent(c.id),
              "Season " + c.season.toUpperCase()
            )
          );
          found++;
        });
      }

      var characters = all[1].filter(function (c) {
        return matches(
          (c.name || "") + " " + (c.description || "") + " " + (c.affiliations || ""),
          q
        );
      });
      if (characters.length) {
        resultsMount.appendChild(el("p", "search-group", "Characters"));
        characters.forEach(function (c) {
          resultsMount.appendChild(
            resultLink(
              c.name || "(unnamed)",
              ROOT + "pages/character.html?id=" + encodeURIComponent(c.id),
              c.season ? "Season " + c.season.toUpperCase() : ""
            )
          );
          found++;
        });
      }

      var locations = all[2].filter(function (l) {
        return matches(
          (l.name || "") + " " + (l.region || "") + " " + (l.description || ""),
          q
        );
      });
      if (locations.length) {
        resultsMount.appendChild(el("p", "search-group", "Places"));
        locations.forEach(function (l) {
          var href = l.region
            ? ROOT +
              "pages/place.html?region=" +
              encodeURIComponent(l.region)
            : ROOT + "pages/places.html";
          resultsMount.appendChild(
            resultLink(l.name || "(unnamed)", href, l.region || "")
          );
          found++;
        });
      }

      var lore = all[3].filter(function (l) {
        return matches(
          (l.title || "") + " " + (l.category || "") + " " + (l.content || ""),
          q
        );
      });
      if (lore.length) {
        resultsMount.appendChild(el("p", "search-group", "Universe & Lore"));
        lore.forEach(function (l) {
          resultsMount.appendChild(
            resultLink(l.title || "(untitled)", ROOT + "pages/universe.html", l.category || "")
          );
          found++;
        });
      }

      var pages = STATIC_PAGES.filter(function (p) {
        return matches(p.label + " " + p.keywords, q);
      });
      if (pages.length) {
        resultsMount.appendChild(el("p", "search-group", "Pages"));
        pages.forEach(function (p) {
          resultsMount.appendChild(resultLink(p.label, ROOT + p.href));
          found++;
        });
      }

      if (!found) {
        resultsMount.appendChild(
          el(
            "div",
            "empty-state",
            'No results for "' + q + '". Unreleased content is never shown in search.'
          )
        );
      }
    });
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-search-open]")) {
      event.preventDefault();
      openSearch();
    }
  });
})();