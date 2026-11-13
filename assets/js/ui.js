/* ============================================================
   VOLMERRA — Shared UI
   Injects the header, page banners, mobile navigation and the
   footer into every page. Pages mark the mount points with
   #site-header and #site-footer, and set data-root on <html>
   ("../" on pages inside /pages, "" at the project root).

   Desktop navigation is unchanged. On small screens (≤640px)
   the header becomes a compact top bar (logo, search,
   notifications, profile, menu) and a fixed bottom navigation
   (Home, Story, Characters, Places, Profile) appears — both
   driven by CSS, with the remaining pages in the menu.
   ============================================================ */

(function () {
  "use strict";

  var ROOT = document.documentElement.getAttribute("data-root") || "";

  var NAV_LINKS = [
    { href: "index.html", label: "Home" },
    { href: "pages/story.html", label: "Story" },
    { href: "pages/characters.html", label: "Characters" },
    { href: "pages/universe.html", label: "Universe" },
    { href: "pages/places.html", label: "Places" },
    { href: "pages/gallery.html", label: "Gallery" },
    { href: "pages/about.html", label: "About" },
  ];

  var BOTTOM_NAV = [
    { href: "index.html", label: "Home", icon: "home" },
    { href: "pages/story.html", label: "Story", icon: "book" },
    { href: "pages/characters.html", label: "Cast", icon: "users" },
    { href: "pages/places.html", label: "Places", icon: "map" },
    { href: "pages/account.html", label: "You", icon: "user" },
  ];

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

  function pageFile() {
    var parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || "index.html";
  }

  function isActive(href) {
    return href.split("/").pop() === pageFile();
  }

  function icon(name) {
    var paths = {
      sun:
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
      moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
      bell:
        '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
      menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      search:
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
      home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
      book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13z"/><path d="M20 17v4H6.5a2.5 2.5 0 0 1 0-5"/>',
      users:
        '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.5a3.5 3.5 0 0 1 0 5"/><path d="M17.5 14.5a6.5 6.5 0 0 1 4 5.5"/>',
      map: '<path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/>',
      user:
        '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      bookmark:
        '<path d="M6 4h12v17l-6-4-6 4V4z"/>',
    };
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths[name] +
      "</svg>"
    );
  }

  function navList(classAttr) {
    return (
      "<ul" +
      (classAttr ? ' class="' + classAttr + '"' : "") +
      ">" +
      NAV_LINKS.map(function (link) {
        return (
          '<li><a href="' +
          ROOT +
          link.href +
          '"' +
          (isActive(link.href) ? ' class="is-active" aria-current="page"' : "") +
          ">" +
          link.label +
          "</a></li>"
        );
      }).join("") +
      "</ul>"
    );
  }

  function themeButton() {
    return (
      '<button class="icon-btn theme-toggle" type="button" aria-label="Switch theme">' +
      '<span class="icon-sun">' +
      icon("sun") +
      "</span>" +
      '<span class="icon-moon">' +
      icon("moon") +
      "</span>" +
      "</button>"
    );
  }

  function searchButton(extraClass) {
    return (
      '<button class="icon-btn' +
      (extraClass ? " " + extraClass : "") +
      '" type="button" data-search-open aria-label="Search">' +
      icon("search") +
      "</button>"
    );
  }

  function avatarHtml(user, extraClass) {
    if (user.avatar) {
      return '<img class="avatar ' + (extraClass || "") + '" src="' + user.avatar + '" alt="">';
    }
    var initial = (user.displayName || "?").trim().charAt(0).toUpperCase();
    return (
      '<span class="avatar avatar--fallback ' + (extraClass || "") + '">' +
      escapeHtml(initial) +
      "</span>"
    );
  }

  /* Notifications panel content, shared by the desktop bell and the
     mobile bell. Guests see a sign-in prompt instead. */
  function notifPanelHtml() {
    var user = window.VolmerraAuth.currentUser();
    var html = '<p class="notif-title">Notifications</p>';
    if (!window.VolmerraNotifications) {
      html += '<p class="notif-empty">Notifications are unavailable right now.</p>';
      return html;
    }
    if (!user) {
      html +=
        '<p class="notif-empty">Sign in to receive chapter updates and replies.</p>' +
        '<div class="notif-auth">' +
        '<a class="btn btn--ghost btn--sm" href="' + ROOT + 'pages/login.html">Log in</a>' +
        '<a class="btn btn--primary btn--sm" href="' + ROOT + 'pages/signup.html">Sign up</a>' +
        "</div>";
      return html;
    }
    var list = window.VolmerraNotifications.list();
    if (!list.length) {
      html +=
        '<p class="notif-empty">No notifications yet. New chapters and updates will appear here.</p>';
      return html;
    }
    if (window.VolmerraNotifications.unread() > 0) {
      html +=
        '<button class="notif-mark" type="button" data-notif-read>Mark all as read</button>';
    }
    html += '<ul class="notif-list">';
    list.forEach(function (n) {
      html +=
        '<li class="notif-item' + (n.read ? "" : " is-unread") + '">' +
        '<a href="' + (n.href ? ROOT + n.href : ROOT + "index.html") + '">' +
        '<span class="notif-item-title">' + escapeHtml(n.title) + "</span>" +
        (n.body ? '<span class="notif-item-body">' + escapeHtml(n.body) + "</span>" : "") +
        '<span class="notif-item-date">' +
        new Date(n.at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }) +
        "</span></a></li>";
    });
    html += "</ul>";
    return html;
  }

  function notifBell(withUnread) {
    var unread = 0;
    if (window.VolmerraNotifications) unread = window.VolmerraNotifications.unread();
    return (
      '<div class="notif-wrap' + (withUnread ? "" : " header-only-desktop") + '">' +
      '<button class="icon-btn" type="button" data-notif-toggle aria-haspopup="true" aria-expanded="false" aria-label="Notifications">' +
      icon("bell") +
      (unread
        ? '<span class="notif-badge">' + (unread > 9 ? "9+" : unread) + "</span>"
        : "") +
      "</button>" +
      '<div class="notif-panel" hidden>' +
      notifPanelHtml() +
      "</div>" +
      "</div>"
    );
  }

  function authActionsHtml() {
    var user = window.VolmerraAuth.currentUser();

    if (user) {
      return (
        themeButton() +
        searchButton("header-only-desktop") +
        notifBell(false) +
        '<a class="user-chip header-only-desktop" href="' + ROOT + 'pages/account.html" title="Your account">' +
        avatarHtml(user) +
        '<span class="chip-name">' +
        escapeHtml(user.displayName) +
        "</span></a>"
      );
    }

    return (
      themeButton() +
      searchButton("header-only-desktop") +
      '<a class="btn btn--ghost btn--sm header-only-desktop" href="' + ROOT + 'pages/login.html">Log in</a>' +
      '<a class="btn btn--primary btn--sm header-only-desktop" href="' + ROOT + 'pages/signup.html">Sign up</a>'
    );
  }

  /* Mobile top-bar icons: search, notifications, profile — rendered
     next to the menu toggle and shown only on small screens. */
  function mobileTopActions() {
    var user = window.VolmerraAuth.currentUser();
    return (
      searchButton("header-only-mobile") +
      notifBell(true).replace("header-only-desktop", "header-only-mobile") +
      '<a class="icon-btn header-only-mobile" href="' +
      ROOT +
      (user ? "pages/account.html" : "pages/login.html") +
      '" aria-label="Your account">' +
      (user ? avatarHtml(user) : icon("user")) +
      "</a>"
    );
  }

  function mobileActionsHtml() {
    var user = window.VolmerraAuth.currentUser();
    var html =
      '<div class="menu-actions">' +
      themeButton() +
      '<a class="btn btn--ghost btn--block" href="' + ROOT + "pages/account.html" + '">' +
      (user ? "Your Account" : "Log in") +
      "</a>";
    if (user) {
      html +=
        '<a class="btn btn--ghost btn--block" href="' + ROOT + 'pages/settings.html">Account Settings</a>' +
        '<button class="btn btn--primary btn--block sign-out" type="button">Sign out</button>';
    } else {
      html +=
        '<a class="btn btn--primary btn--block" href="' + ROOT + 'pages/signup.html">Sign up</a>';
    }
    html += "</div>";
    return html;
  }

  function renderHeader() {
    var mount = document.getElementById("site-header");
    if (!mount) return;

    mount.innerHTML =
      '<header class="site-header">' +
      '<div class="container header-inner">' +
      '<a class="brand" href="' + ROOT + 'index.html">VOLMERRA</a>' +
      '<nav class="main-nav" aria-label="Primary">' +
      navList() +
      "</nav>" +
      '<div class="header-actions">' +
      authActionsHtml() +
      "</div>" +
      '<div class="header-mobile-actions">' +
      mobileTopActions() +
      "</div>" +
      '<button class="icon-btn menu-toggle" id="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu">' +
      icon("menu") +
      "</button>" +
      "</div>" +
      '<div class="mobile-menu" id="mobile-menu">' +
      mobileMenuList() +
      mobileActionsHtml() +
      "</div>" +
      "</header>";

    wireHeader();
    wireNotifications();
  }

  /* Mobile menu: every page NOT in the bottom nav stays reachable. */
  function mobileMenuList() {
    var extra = NAV_LINKS.filter(function (link) {
      return (
        link.label !== "Home" &&
        link.label !== "Story" &&
        link.label !== "Characters" &&
        link.label !== "Places"
      );
    });
    return (
      "<ul>" +
      extra
        .map(function (link) {
          return (
            '<li><a href="' +
            ROOT +
            link.href +
            '"' +
            (isActive(link.href) ? ' class="is-active" aria-current="page"' : "") +
            ">" +
            link.label +
            "</a></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function bottomNavHtml() {
    var user = window.VolmerraAuth.currentUser();
    return (
      '<nav class="mobile-bottom-nav" aria-label="Mobile">' +
      BOTTOM_NAV.map(function (link) {
        var href = ROOT + link.href;
        if (link.label === "You" && !user) href = ROOT + "pages/login.html";
        return (
          '<a href="' + href + '"' +
          (isActive(link.href) ? ' class="is-active" aria-current="page"' : "") +
          ">" +
          icon(link.icon) +
          "<span>" +
          link.label +
          "</span></a>"
        );
      }).join("") +
      "</nav>"
    );
  }

  function wireHeader() {
    var toggle = document.getElementById("menu-toggle");
    var menu = document.getElementById("mobile-menu");

    function closeMenu() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    }

    function onEscape(event) {
      if (event.key === "Escape") closeMenu();
    }

    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
      if (open) {
        document.addEventListener("keydown", onEscape);
      } else {
        document.removeEventListener("keydown", onEscape);
      }
    });

    document.addEventListener("click", function (event) {
      if (
        menu.classList.contains("is-open") &&
        !event.target.closest("#mobile-menu") &&
        !event.target.closest("#menu-toggle")
      ) {
        closeMenu();
      }
    });

    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        closeMenu();
      }
    });
  }

  /* Every bell on the page (desktop header bell AND the mobile top
     bell) gets its own click handler bound to ITS OWN panel. The old
     code wired only the FIRST match in the DOM — on a phone that was
     the hidden desktop bell, so the visible mobile bell did nothing. */
  function wireNotifications() {
    document.querySelectorAll("[data-notif-toggle]").forEach(function (toggle) {
      var panel = toggle.parentElement.querySelector(".notif-panel");
      if (!panel) return;

      toggle.addEventListener("click", function (event) {
        event.stopPropagation();
        var wasHidden = panel.hidden;
        document.querySelectorAll(".notif-panel").forEach(function (p) {
          p.hidden = true;
        });
        panel.hidden = !wasHidden;
        toggle.setAttribute("aria-expanded", String(panel.hidden === false));
        if (panel.hidden === false) {
          /* Opening the panel rebuilds it with the CURRENT session
             state and marks everything as read. */
          if (window.VolmerraNotifications) {
            window.VolmerraNotifications.markAllRead();
          }
          panel.innerHTML = notifPanelHtml();
          wireNotifications();
          updateNotifBadges();
        }
      });
    });

    document.querySelectorAll("[data-notif-read]").forEach(function (mark) {
      mark.addEventListener("click", function () {
        if (window.VolmerraNotifications) {
          window.VolmerraNotifications.markAllRead();
          document.querySelectorAll(".notif-panel").forEach(function (panel) {
            panel.innerHTML = notifPanelHtml();
          });
          wireNotifications();
          updateNotifBadges();
        }
      });
    });
  }

  /* Clicking anywhere outside a bell closes every open panel. Bound
     ONCE at module level so re-wiring never stacks copies of it. */
  document.addEventListener("click", function (event) {
    if (event.target.closest(".notif-wrap")) return;
    document.querySelectorAll(".notif-panel").forEach(function (p) {
      p.hidden = true;
    });
    document.querySelectorAll("[data-notif-toggle]").forEach(function (t) {
      t.setAttribute("aria-expanded", "false");
    });
  });

  function updateNotifBadges() {
    var unread = window.VolmerraNotifications
      ? window.VolmerraNotifications.unread()
      : 0;
    document.querySelectorAll(".notif-wrap").forEach(function (wrap) {
      var btn = wrap.querySelector("[data-notif-toggle]");
      var old = wrap.querySelector(".notif-badge");
      if (old) old.remove();
      if (unread && btn) {
        var badge = el("span", "notif-badge", unread > 9 ? "9+" : String(unread));
        btn.appendChild(badge);
      }
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- Page banners ----------
     Admin-managed horizontal banners rendered above the page hero on
     every main page that sets data-banner="story|characters|places|
     universe|gallery|about" on <body>. No banner configured → nothing
     is rendered (no empty or broken image area). The homepage hero
     system is separate and unaffected. */
  function renderPageBanner() {
    var key = document.body.dataset.banner;
    if (!key || !window.VolmerraCMS || document.body.dataset.adminPage) return;

    window.VolmerraCMS.settings().then(function (settings) {
      var banner = settings.banners && settings.banners[key];
      if (!banner || !banner.image) return;

      var elBanner = el("div", "page-banner" + (banner.gradient ? " page-banner--gradient" : ""));
      var img = el("img", "page-banner-img");
      img.src = banner.image;
      img.alt = "";
      img.style.objectPosition = "50% " + (banner.focus || 50) + "%";
      elBanner.appendChild(img);

      var header = document.getElementById("site-header");
      if (header && header.parentNode) {
        header.parentNode.insertBefore(elBanner, header.nextSibling);
      }
    });
  }

  function renderFooter() {
    var mount = document.getElementById("site-footer");
    if (!mount) return;

    var seasonPicker = "";
    var isAdminPage = document.body.dataset.adminPage;
    if (window.VolmerraSeasons) {
      if (isAdminPage) {
        /* Admin-only theme preview: any season, session-scoped,
           never affects the public website. */
        var active = window.VolmerraSeason.current();
        var previewing = window.VolmerraSeasons.isPreview();
        seasonPicker =
          '<div class="season-picker" role="group" aria-label="Season theme preview (admin only)">' +
          '<span class="season-picker-label">Theme preview (admin only):</span>' +
          '<button class="season-option' + (!previewing ? " is-active" : "") +
          '" type="button" data-season-id="auto" aria-pressed="' + String(!previewing) + '">Auto</button>' +
          window.VolmerraSeason
            .list()
            .map(function (id) {
              var isActive = previewing && id === active;
              return (
                '<button class="season-option' + (isActive ? " is-active" : "") +
                '" type="button" data-season-id="' + id + '"' +
                ' aria-pressed="' + String(isActive) + '">' +
                id.toUpperCase() +
                "</button>"
              );
            })
            .join("") +
          "</div>";
      } else {
        /* Public pages: the theme follows the latest published season
           automatically, so there is nothing for visitors to pick. */
        seasonPicker =
          '<p class="season-indicator">Active season: ' +
          (window.VolmerraSeasons.latestPublished() || "s1").toUpperCase() +
          " (latest published)</p>";
      }
    }

    mount.innerHTML =
      '<footer class="site-footer">' +
      '<div class="container footer-inner">' +
      "<div>" +
      '<p class="footer-brand">VOLMERRA</p>' +
      '<p class="footer-note">All story content across this site is clearly marked placeholder pending original Volmerra material.</p>' +
      "</div>" +
      '<nav aria-label="Footer">' +
      '<ul class="footer-links">' +
      NAV_LINKS.slice(1)
        .map(function (link) {
          return '<li><a href="' + ROOT + link.href + '">' + link.label + "</a></li>";
        })
        .join("") +
      "</ul>" +
      "</nav>" +
      "</div>" +
      '<div class="container footer-base">' +
      "<p>&copy; Volmerra. All rights reserved." +
      ' <a href="' + ROOT + 'README.md" class="footer-doc-link">Project documentation</a>' +
      "</p>" +
      seasonPicker +
      "</div>" +
      "</footer>";
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest(".sign-out");
    if (btn) {
      /* logout() returns a Promise on the real backend (Supabase):
         wait for the session to end before redirecting. */
      Promise.resolve(window.VolmerraAuth.logout()).then(function () {
        window.location.href = ROOT + "index.html";
      });
    }
  });

  /* When the real backend restores the session (Supabase adapter),
     re-render the header and the mobile bottom navigation so the
     signed-in state appears without a manual reload. The
     localStorage flow never fires this event. */
  document.addEventListener("volmerra:auth-ready", function () {
    renderHeader();
    var wrap = document.querySelector(".mobile-bottom-nav-wrap");
    if (wrap) wrap.innerHTML = bottomNavHtml();
  });

  /* Re-render the footer when season statuses change so the public
     season indicator (and the admin preview picker) stay current. */
  document.addEventListener("volmerra:seasons-updated", renderFooter);

  document.addEventListener("volmerra:notifications-updated", updateNotifBadges);

  document.addEventListener("DOMContentLoaded", function () {
    renderHeader();
    renderFooter();
    renderPageBanner();
    /* Mobile bottom navigation + bottom safe-area padding. */
    if (!document.body.dataset.adminPage && window.matchMedia) {
      var nav = document.createElement("nav");
      nav.innerHTML = bottomNavHtml();
      nav.className = "mobile-bottom-nav-wrap";
      document.body.appendChild(nav);
      document.body.classList.add("has-mobile-nav");
    }
    updateNotifBadges();
  });
})();