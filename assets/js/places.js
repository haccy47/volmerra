/* ============================================================
   VOLMERRA — Places (public pages)
   ------------------------------------------------------------
   Powers three pages, dispatched by <body data-page="…">:

     places    pages/places.html    region overview
     region    pages/place.html     ?region=<exact region name>
     location  pages/location.html  ?id=<chapter-free location id>

   Locations come straight from the CMS data layer (admin panel
   data — nothing is hardcoded or duplicated here). Grouping uses
   the exact trimmed region string of each location; locations
   without a region are grouped under "Unassigned" (public) and
   "Unassigned Locations" (admin panel). Unreleased-season content
   is already filtered out by the CMS data layer itself.
   ============================================================ */

(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Exact canonical region reference: trimmed, case-sensitive string
     equality. No fuzzy or approximate name matching. */
  function regionKey(location) {
    return (location.region || "").trim();
  }

  function groupByRegion(locations) {
    var groups = {};
    var order = [];
    locations.forEach(function (loc) {
      var key = regionKey(loc);
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(loc);
    });
    /* Regions alphabetical; the unassigned group always last. */
    order.sort(function (a, b) {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });
    return { keys: order, groups: groups };
  }

  function locationCard(loc) {
    var card = el("a", "card location-card");
    card.href = "location.html?id=" + encodeURIComponent(loc.id);

    var media = el("div", "location-card-media");
    if (loc.image) {
      var img = el("img");
      img.src = loc.image;
      img.alt = "";
      img.loading = "lazy";
      media.appendChild(img);
    } else {
      media.classList.add("location-card-media--empty");
      media.appendChild(el("span", null, "No image"));
    }
    card.appendChild(media);

    card.appendChild(el("h3", null, loc.name || "(unnamed location)"));
    if (loc.description) {
      card.appendChild(el("p", "card-text", loc.description));
    }
    return card;
  }

  /* ---------- Places overview: regions as primary items ---------- */

  function initPlaces() {
    var mount = document.getElementById("regions-mount");
    if (!mount) return;

    window.VolmerraCMS.list("locations").then(function (locations) {
      mount.innerHTML = "";

      if (!locations.length) {
        mount.appendChild(
          el(
            "div",
            "empty-state",
            "No locations have been added yet. Regions appear here as soon as locations are created in the admin panel."
          )
        );
        return;
      }

      var grouped = groupByRegion(locations);

      grouped.keys.forEach(function (key) {
        var items = grouped.groups[key];
        var cover = null;
        items.some(function (loc) {
          if (loc.image) {
            cover = loc.image;
            return true;
          }
          return false;
        });

        var card = el("a", "card region-card");
        card.href = "place.html?region=" + encodeURIComponent(key);

        var media = el("div", "region-card-media");
        if (cover) {
          var img = el("img");
          img.src = cover;
          img.alt = "";
          img.loading = "lazy";
          media.appendChild(img);
        } else {
          media.classList.add("region-card-media--empty");
          media.appendChild(el("span", null, "No image"));
        }
        card.appendChild(media);

        card.appendChild(el("h3", null, key || "Unassigned"));
        if (items.length === 1 && items[0].description) {
          card.appendChild(el("p", "card-text", items[0].description));
        }
        card.appendChild(
          el(
            "p",
            "region-card-count",
            items.length +
              (items.length === 1 ? " location" : " locations") +
              " · View locations →"
          )
        );
        mount.appendChild(card);
      });
    });
  }

  /* ---------- Region detail: locations of one exact region ---------- */

  function initRegion() {
    var mount = document.getElementById("region-locations-mount");
    if (!mount) return;

    var params = new URLSearchParams(window.location.search);
    var region = params.get("region");

    window.VolmerraCMS.list("locations").then(function (locations) {
      if (!region) {
        mount.appendChild(
          el("div", "empty-state", "No region was selected.")
        );
        return;
      }

      /* Exact match against the stored region value. */
      var items = locations.filter(function (loc) {
        return regionKey(loc) === region;
      });

      document.getElementById("region-title").textContent = region;

      var lede = document.getElementById("region-lede");
      lede.textContent =
        items.length +
        (items.length === 1
          ? " location in this region."
          : " locations in this region.");

      mount.innerHTML = "";
      if (!items.length) {
        mount.appendChild(
          el(
            "div",
            "empty-state",
            "No locations in this region yet. They will appear here as soon as a location is assigned to it in the admin panel."
          )
        );
        return;
      }

      var grid = el("div", "grid-3");
      items.forEach(function (loc) {
        grid.appendChild(locationCard(loc));
      });
      mount.appendChild(grid);
    });
  }

  /* ---------- Location detail ---------- */

  function initLocation() {
    var detail = document.getElementById("location-detail");
    if (!detail) return;

    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    if (!id) {
      detail.hidden = true;
      document.getElementById("location-error").hidden = false;
      document.getElementById("location-error-text").textContent =
        "No location was selected.";
      return;
    }

    window.VolmerraCMS.list("locations").then(function (locations) {
      var loc = null;
      locations.forEach(function (l) {
        if (l.id === id) loc = l;
      });

      if (!loc) {
        detail.hidden = true;
        var error = document.getElementById("location-error");
        error.hidden = false;
        document.getElementById("location-error-text").textContent =
          "This location is not available. It may have been removed.";
        return;
      }

      document.getElementById("location-name").textContent =
        loc.name || "(unnamed location)";
      document.getElementById("location-region").textContent = loc.region
        ? "Region: " + loc.region
        : "Unassigned";

      var media = document.getElementById("location-media");
      if (loc.image) {
        var img = el("img");
        img.src = loc.image;
        img.alt = "Image of " + (loc.name || "location");
        media.appendChild(img);
      } else {
        media.classList.add("location-detail-media--empty");
        media.appendChild(el("span", null, "No image available"));
      }

      var desc = document.getElementById("location-desc");
      if (loc.description) {
        desc.textContent = loc.description;
      } else {
        desc.hidden = true;
      }

      /* Back link: to the region when it has one, otherwise Places. */
      var back = document.getElementById("location-back");
      if (regionKey(loc)) {
        back.href = "place.html?region=" + encodeURIComponent(regionKey(loc));
        back.textContent = "← Back to " + regionKey(loc);
      } else {
        back.href = "places.html";
        back.textContent = "← Back to Places";
      }

      detail.hidden = false;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.dataset.page;
    if (page === "places") initPlaces();
    else if (page === "region") initRegion();
    else if (page === "location") initLocation();
  });
})();
