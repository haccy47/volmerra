/* ============================================================
   VOLMERRA — Theme switching
   Persists the chosen theme; falls back to the system
   preference on first visit.
   ============================================================ */

(function () {
  "use strict";

  var THEME_KEY = "volmerra:theme";

  function storedTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function systemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  apply(storedTheme() || systemTheme());

  window.VolmerraTheme = {
    current: currentTheme,
    toggle: function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      apply(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* storage unavailable — theme still applies for this visit */
      }
      syncButtons();
    },
  };

  function syncButtons() {
    document
      .querySelectorAll(".theme-toggle")
      .forEach(function (btn) {
        btn.setAttribute("aria-label", "Switch to " + (currentTheme() === "dark" ? "light" : "dark") + " mode");
      });
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest(".theme-toggle");
    if (btn) {
      window.VolmerraTheme.toggle();
    }
  });

  document.addEventListener("DOMContentLoaded", syncButtons);
})();
