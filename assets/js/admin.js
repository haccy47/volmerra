/* ============================================================
   VOLMERRA — Admin panel (content management system)
   ------------------------------------------------------------
   Powers every page in /admin:

     dashboard   admin/index.html       overview + quick access
     chapters    admin/chapters.html    chapter management
     chapter     admin/chapter.html     publish/edit form
     collection  characters / locations / lore / gallery
     publishing  admin/publishing.html  drafts / scheduled / published
     website     admin/website.html     featured content, sections,
                                        announcements, season settings
     community   admin/community.html   users, comments, reports

   Access: every page is gated on administrator permissions from
   the auth layer (VolmerraAuth.isAdmin). This preview build has
   no backend, so the gate is enforced in the client only and the
   first signed-in account may claim ownership once. In production
   the admin role and every admin operation must be authorized
   server-side — the storage adapters (chapters.js, cms.js) are
   the single places to enforce that. Nothing here claims to be
   securely protected.
   ============================================================ */

(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Downscale an uploaded image through a canvas before it is stored.
     Large phone photos used to be saved as multi-megabyte base64 data
     URLs, which filled localStorage and made publishing fail with a
     quota error. Covers and portraits are photos, so they are re
     -encoded as JPEG (white fill for transparent PNGs) at a maximum
     long edge, typically landing between 100–300 KB. */
  window.VolmerraAdminImages = {
    process: function (file, maxEdge, callback) {
      if (!file.type || file.type.indexOf("image/") !== 0) {
        callback(new Error("Please choose an image file."));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        callback(new Error("The image file could not be read."));
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          callback(new Error("The image could not be processed."));
        };
        img.onload = function () {
          try {
            var scale = Math.min(
              1,
              maxEdge / Math.max(img.naturalWidth, img.naturalHeight)
            );
            var w = Math.max(1, Math.round(img.naturalWidth * scale));
            var h = Math.max(1, Math.round(img.naturalHeight * scale));
            var canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            callback(null, canvas.toDataURL("image/jpeg", 0.85));
          } catch (e) {
            callback(
              new Error("The image could not be processed. Try another file.")
            );
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    },
  };

  function formatDate(iso) {
    if (!iso) return "Not published";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function countdown(iso) {
    if (!iso) return "";
    var diff = new Date(iso) - Date.now();
    if (diff <= 0) return "due now";
    var minutes = Math.floor(diff / 60000);
    var hours = Math.floor(minutes / 60);
    if (hours < 48) return "in " + hours + " h " + (minutes % 60) + " min";
    return "in " + Math.round(hours / 24) + " days";
  }

  function statusLabel(status) {
    return status === "published"
      ? "Published"
      : status === "scheduled"
      ? "Scheduled"
      : "Draft";
  }

  /* ---------- shared shell ---------- */

  var ADMIN_LINKS = [
    ["index.html", "Dashboard"],
    ["chapters.html", "Chapters"],
    ["chapter.html", "New chapter"],
    ["characters.html", "Characters"],
    ["locations.html", "Locations"],
    ["lore.html", "Lore"],
    ["gallery.html", "Gallery"],
    ["publishing.html", "Publishing"],
    ["seasons.html", "Seasons"],
    ["banners.html", "Page Banners"],
    ["website.html", "Website"],
    ["community.html", "Community"],
  ];

  function renderAdminNav() {
    var mount = document.getElementById("admin-nav");
    if (!mount) return;
    var current =
      window.location.pathname.split("/").pop() || "index.html";
    mount.innerHTML = "";
    ADMIN_LINKS.forEach(function (pair) {
      var link = el("a", null, pair[1]);
      link.href = pair[0];
      if (current === pair[0]) {
        link.className = "is-active";
        link.setAttribute("aria-current", "page");
      }
      mount.appendChild(link);
    });
  }

  /* Shared guard: shows the denied / first-run claim states, and calls
     onAdmin only for accounts with administrator permissions. */
  function guardAdmin(onAdmin) {
    var panel = document.getElementById("admin-panel");
    var denied = document.getElementById("admin-denied");
    var deniedText = document.getElementById("denied-text");
    var claim = document.getElementById("admin-claim");
    var claimBtn = document.getElementById("claim-admin");
    if (!panel) return;

    claimBtn.addEventListener("click", function () {
      claimBtn.disabled = true;
      window.VolmerraAuth.setAdmin(true).then(run);
    });

    function run() {
      var user = window.VolmerraAuth.currentUser();
      panel.hidden = true;
      denied.hidden = true;
      claim.hidden = true;

      if (!user) {
        deniedText.textContent =
          "Administrator access requires signing in with an administrator account.";
        denied.hidden = false;
        return;
      }
      if (window.VolmerraAuth.isAdmin()) {
        panel.hidden = false;
        onAdmin();
        return;
      }
      window.VolmerraAuth.adminExists().then(function (exists) {
        if (exists) {
          deniedText.textContent =
            "This account does not have administrator permissions.";
          denied.hidden = false;
        } else {
          claim.hidden = false;
        }
      });
    }

    run();
    /* On the real backend the session (and the cached admin role)
       is restored asynchronously — re-run the guard when it lands.
       The localStorage flow never fires this event. */
    document.addEventListener("volmerra:auth-ready", function () {
      run();
    });
  }

  /* ---------- shared chapter helpers ---------- */

  function thumb(src) {
    if (src) {
      var img = el("img", "chapter-thumb");
      img.src = src;
      img.alt = "";
      return img;
    }
    return el("div", "chapter-thumb");
  }

  function actionBtn(label, cls, action, c) {
    var btn = el("button", cls, label);
    btn.type = "button";
    btn.dataset.action = action;
    btn.dataset.id = c.id;
    btn.dataset.number = c.number;
    btn.dataset.status = c.status;
    return btn;
  }

  function chapterActions(c) {
    var actions = el("div", "admin-row-actions");

    var edit = el("a", "btn btn--ghost btn--sm", "Edit");
    edit.href = "chapter.html?id=" + encodeURIComponent(c.id);
    actions.appendChild(edit);

    var preview = el("a", "btn btn--ghost btn--sm", "Preview");
    preview.href = "../pages/chapter.html?id=" + encodeURIComponent(c.id);
    actions.appendChild(preview);

    if (c.status === "draft" || c.status === "scheduled") {
      actions.appendChild(actionBtn("Publish", "btn btn--primary btn--sm", "publish", c));
    }
    if (c.status === "scheduled") {
      actions.appendChild(actionBtn("Cancel schedule", "btn btn--ghost btn--sm", "draft", c));
    }
    if (c.status === "published") {
      actions.appendChild(actionBtn("Save as draft", "btn btn--ghost btn--sm", "draft", c));
    }
    actions.appendChild(actionBtn("Delete", "btn btn--ghost btn--sm", "delete", c));
    return actions;
  }

  function bindChapterActions(mountEl, onChange) {
    mountEl.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var action = btn.getAttribute("data-action");
      var label = btn.getAttribute("data-number");
      if (action === "delete") {
        if (
          window.confirm(
            "Delete " + label + "? Its number is never reused, but the chapter cannot be recovered."
          )
        ) {
          window.VolmerraChapters.remove(id).then(function () {
            window.VolmerraCMS.log("Deleted chapter " + label);
            onChange();
          });
        }
      } else if (action === "publish") {
        window.VolmerraChapters.setStatus(id, "published").then(function () {
          window.VolmerraCMS.log("Published chapter " + label);
          onChange();
        });
      } else if (action === "draft") {
        window.VolmerraChapters.setStatus(id, "draft").then(function () {
          window.VolmerraCMS.log(
            btn.getAttribute("data-status") === "scheduled"
              ? "Cancelled the scheduled publication of " + label
              : "Moved chapter " + label + " to draft"
          );
          onChange();
        });
      }
    });
  }

  /* Flash message shown after a redirect (e.g. after scheduling). */
  function showFlashFromUrl() {
    var flash = document.getElementById("admin-flash");
    if (!flash) return;
    var params = new URLSearchParams(window.location.search);
    var msg = params.get("msg");
    if (!msg) return;
    flash.textContent = msg;
    flash.classList.add("is-visible");
    window.history.replaceState({}, "", window.location.pathname);
  }

  /* Auto-updating countdowns + prototype auto-publish. While this page
     is open, countdowns tick on their own and scheduled chapters whose
     time has passed are published. Reliable publication when nobody
     has the site open requires a server-side scheduler. */
  function startTicker(onChange) {
    window.setInterval(function () {
      document
        .querySelectorAll("[data-countdown]")
        .forEach(function (node) {
          node.textContent = countdown(node.getAttribute("data-countdown"));
        });
      window.VolmerraChapters.publishDue().then(function (due) {
        if (!due.length) return;
        due.forEach(function (c) {
          window.VolmerraCMS.log(
            "Published scheduled chapter " +
              c.number +
              " — scheduled time reached"
          );
        });
        if (onChange) onChange();
      });
      window.VolmerraSeasons.releaseDue().then(function (released) {
        if (!released.length) return;
        released.forEach(function (s) {
          window.VolmerraCMS.log(
            "Season " +
              s.id.toUpperCase() +
              " released — scheduled time reached"
          );
        });
        if (onChange) onChange();
      });
    }, 30000);
  }

  /* ---------- page dispatch ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    renderAdminNav();
    var page = document.body.dataset.adminPage;
    if (page === "dashboard") initDashboard();
    else if (page === "chapters") initChapterList();
    else if (page === "chapter-form") initForm();
    else if (page === "collection") initCollectionPage();
    else if (page === "publishing") initPublishing();
    else if (page === "seasons") initSeasons();
    else if (page === "banners") initBanners();
    else if (page === "website") initWebsite();
    else if (page === "community") initCommunity();
  });

  /* ---------- one-time local-data import ----------
     Chapters and CMS entries created before the backend was
     connected live only in this browser's localStorage. This
     pushes them into the backend, merged by id (existing backend
     entries are never overwritten). */

  function initImport(renderAll) {
    var panel = document.getElementById("import-panel");
    if (!panel) return;
    var info = document.getElementById("import-info");
    var btn = document.getElementById("import-local");
    var result = document.getElementById("import-result");

    var counts = { chapters: 0, cmsItems: 0 };
    try {
      var ch = JSON.parse(localStorage.getItem("volmerra:chapters") || "null");
      counts.chapters = ch && ch.chapters ? ch.chapters.length : 0;
      var cms = JSON.parse(localStorage.getItem("volmerra:cms") || "null");
      if (cms) {
        ["characters", "locations", "lore", "gallery", "reports"].forEach(
          function (name) {
            counts.cmsItems += cms[name] ? cms[name].length : 0;
          }
        );
      }
    } catch (e) {}

    if (!counts.chapters && !counts.cmsItems) {
      info.textContent =
        "No local data found in this browser — nothing to import.";
      btn.disabled = true;
      panel.hidden = false;
      return;
    }
    info.textContent =
      "This browser still holds " +
      counts.chapters +
      " chapter(s) and " +
      counts.cmsItems +
      " CMS item(s) from before the backend was connected. Importing " +
      "adds them to the database; entries that already exist there are kept.";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Importing…";
      Promise.all([
        window.VolmerraChapters.importLocalBackup(),
        window.VolmerraCMS.importLocalBackup(),
      ])
        .then(function (results) {
          result.hidden = false;
          result.textContent =
            "Done — " +
            results[0].chapters +
            " chapter(s) and " +
            results[1].items +
            " CMS item(s) were imported. The site now shows them on every device.";
          window.VolmerraCMS.log(
            "Imported local preview data (" +
              results[0].chapters +
              " chapters, " +
              results[1].items +
              " items)"
          );
          renderAll();
        })
        .catch(function (error) {
          result.hidden = false;
          result.textContent =
            error && error.message ? error.message : "Import failed.";
          btn.disabled = false;
          btn.textContent = "Import this browser's data";
        });
    });
    panel.hidden = false;
  }

  /* ================= Dashboard ================= */

  function initDashboard() {
    function renderAll() {
      Promise.all([
        window.VolmerraChapters.list(),
        window.VolmerraCMS.list("characters", { all: true }),
        window.VolmerraCMS.activity(),
        window.VolmerraChapters.scheduled(),
      ]).then(function (results) {
        var chapters = results[0];
        var characters = results[1];
        var activity = results[2];
        var scheduled = results[3];

        document.getElementById("stat-published").textContent =
          chapters.filter(function (c) {
            return c.status === "published";
          }).length;
        document.getElementById("stat-drafts").textContent =
          chapters.filter(function (c) {
            return c.status === "draft" || c.status === "scheduled";
          }).length;
        document.getElementById("stat-characters").textContent =
          characters.length;
        window.VolmerraAuth.listUsers().then(function (users) {
          document.getElementById("stat-users").textContent = users.length;
        });

        var scheduledMount = document.getElementById("scheduled-list");
        scheduledMount.innerHTML = "";
        if (!scheduled.length) {
          scheduledMount.appendChild(
            el(
              "div",
              "empty-state",
              "No scheduled chapters. Schedule one from the publish form or the Publishing section."
            )
          );
        } else {
          scheduled.forEach(function (c) {
            scheduledMount.appendChild(chapterRow(c));
          });
        }

        var activityMount = document.getElementById("activity-list");
        activityMount.innerHTML = "";
        if (!activity.length) {
          activityMount.appendChild(
            el(
              "div",
              "empty-state",
              "No content updates yet. Changes made in the admin panel will be listed here."
            )
          );
        } else {
          activity.slice(0, 8).forEach(function (entry) {
            var row = el("div", "chapter-row");
            var body = el("div");
            body.appendChild(el("p", "row-title", entry.text));
            body.appendChild(
              el(
                "p",
                "row-meta",
                new Date(entry.at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              )
            );
            row.appendChild(body);
            activityMount.appendChild(row);
          });
        }
      });
    }

    guardAdmin(function () {
      renderAll();
      initImport(renderAll);
      startTicker(renderAll);
    });
  }

  /* ================= Chapter management ================= */

  function initChapterList() {
    var listEl = document.getElementById("admin-list");
    var tabsEl = document.getElementById("season-tabs");
    var searchEl = document.getElementById("chapter-search");
    var filter = { season: "all", q: "" };

    var tabs = [["all", "All"]].concat(
      window.VolmerraChapters.seasons.map(function (season) {
        return [season, season.toUpperCase()];
      })
    );
    tabs.forEach(function (pair) {
      var tab = el(
        "button",
        "tab" + (pair[0] === "all" ? " is-active" : ""),
        pair[1]
      );
      tab.type = "button";
      tab.dataset.season = pair[0];
      tabsEl.appendChild(tab);
    });

    tabsEl.addEventListener("click", function (event) {
      var tab = event.target.closest(".tab");
      if (!tab) return;
      filter.season = tab.dataset.season;
      tabsEl.querySelectorAll(".tab").forEach(function (node) {
        node.classList.toggle("is-active", node === tab);
      });
      refresh();
    });

    searchEl.addEventListener("input", function () {
      filter.q = searchEl.value.trim().toLowerCase();
      refresh();
    });

    bindChapterActions(listEl, refresh);

    function refresh() {
      window.VolmerraChapters.list().then(function (chapters) {
        var visible = chapters.filter(function (c) {
          if (filter.season !== "all" && c.season !== filter.season) return false;
          if (filter.q) {
            var haystack = (c.title + " " + c.number).toLowerCase();
            if (haystack.indexOf(filter.q) === -1) return false;
          }
          return true;
        });

        listEl.innerHTML = "";
        if (!visible.length) {
          listEl.appendChild(
            el(
              "div",
              "empty-state",
              chapters.length
                ? "No chapters match this filter."
                : "No chapters yet. Publish the first one to see it on the Story page."
            )
          );
          return;
        }
        visible
          .slice()
          .reverse()
          .forEach(function (c) {
            listEl.appendChild(chapterRow(c));
          });
      });
    }

    showFlashFromUrl();
    guardAdmin(function () {
      refresh();
      startTicker(refresh);
    });
  }

  function chapterRow(c) {
    var row = el("div", "admin-row");
    row.appendChild(thumb(c.cover));

    var body = el("div", "admin-row-body");
    body.appendChild(el("p", "admin-row-title", c.number + " — " + c.title));

    var meta = el(
      "p",
      "admin-row-meta",
      "Season " + c.season.toUpperCase() + " · "
    );
    if (c.status === "published") {
      meta.textContent += "Published " + formatDate(c.publishedAt);
    } else if (c.status === "scheduled") {
      meta.textContent +=
        "Publishes " + formatDateTime(c.scheduledAt) + " · ";
      var cd = el("span", null, countdown(c.scheduledAt));
      cd.setAttribute("data-countdown", c.scheduledAt || "");
      meta.appendChild(cd);
    } else {
      meta.textContent += "Draft";
    }
    body.appendChild(meta);

    body.appendChild(
      el(
        "span",
        "badge" + (c.status === "published" ? " badge--published" : ""),
        statusLabel(c.status)
      )
    );
    row.appendChild(body);
    row.appendChild(chapterActions(c));
    return row;
  }

  /* ================= Publish / edit form ================= */

  function toLocalInput(iso) {
    var d = new Date(iso);
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function initForm() {
    if (!window.VolmerraAuth.isAdmin()) {
      window.location.replace("index.html");
      return;
    }

    var form = document.getElementById("chapter-form");
    var errorBox = form.querySelector(".form-error");
    var heading = document.getElementById("form-heading");
    var titleInput = document.getElementById("form-title");
    var descInput = document.getElementById("form-description");
    var seasonSelect = document.getElementById("form-season");
    var numberInput = document.getElementById("form-number-input");
    var numberEl = document.getElementById("form-number");
    var coverInput = document.getElementById("form-cover-input");
    var coverPreview = document.getElementById("cover-preview");
    var coverEmpty = document.getElementById("cover-empty");
    var coverReplace = document.getElementById("cover-replace");
    var coverRemove = document.getElementById("cover-remove");
    var contentInput = document.getElementById("form-content-input");
    var contentEmpty = document.getElementById("content-empty");
    var contentPreview = document.getElementById("content-preview");
    var contentReplace = document.getElementById("content-replace");
    var scheduleInput = document.getElementById("form-schedule");
    var publishBtn = document.getElementById("publish-btn");
    var scheduleBtn = document.getElementById("schedule-btn");
    var draftBtn = document.getElementById("draft-btn");

    var chapterId = null;
    var coverData = null;
    var contentText = "";

    window.VolmerraChapters.seasons.forEach(function (season) {
      var option = document.createElement("option");
      option.value = season;
      option.textContent = season.toUpperCase();
      seasonSelect.appendChild(option);
    });

    function showError(message) {
      errorBox.textContent = message;
      errorBox.classList.add("is-visible");
    }

    function clearError() {
      errorBox.textContent = "";
      errorBox.classList.remove("is-visible");
    }

    function setBusy(busy) {
      publishBtn.disabled = busy;
      scheduleBtn.disabled = busy;
      draftBtn.disabled = busy;
    }

    /* --- cover upload ---
       Phone photos are far larger than the storage budget, and large
       base64 covers are what previously filled localStorage and made
       Publish fail with a quota error. Every cover is now downscaled
       through a canvas (max 1600px, JPEG) before it is stored, the
       button shows a loading state while processing, and storage
       failures surface a clear message instead of failing silently. */
    function showCover(src) {
      if (src) {
        coverPreview.src = src;
        coverPreview.hidden = false;
        coverEmpty.hidden = true;
        coverReplace.hidden = false;
        coverRemove.hidden = false;
      } else {
        coverPreview.hidden = true;
        coverPreview.removeAttribute("src");
        coverEmpty.hidden = false;
        coverReplace.hidden = true;
        coverRemove.hidden = true;
      }
    }

    function setCoverLoading(loading) {
      coverReplace.disabled = loading;
      coverRemove.disabled = loading;
      coverInput.disabled = loading;
      if (loading) {
        coverEmpty.textContent = "Processing image…";
        coverEmpty.hidden = false;
        coverPreview.hidden = true;
      }
    }

    coverInput.addEventListener("change", function () {
      var file = coverInput.files && coverInput.files[0];
      coverInput.value = "";
      if (!file) return;
      if (!file.type || file.type.indexOf("image/") !== 0) {
        showError("Please choose an image file for the cover.");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        showError("Please choose a cover image smaller than 20 MB.");
        return;
      }
      setCoverLoading(true);
      window.VolmerraAdminImages.process(
        file,
        1600,
        function (error, dataUrl) {
          setCoverLoading(false);
          coverEmpty.textContent = "No cover uploaded";
          if (error) {
            coverEmpty.hidden = false;
            showError(error.message);
            return;
          }
          clearError();
          coverData = dataUrl;
          showCover(coverData);
        }
      );
    });

    coverReplace.addEventListener("click", function () {
      coverInput.click();
    });

    coverRemove.addEventListener("click", function () {
      coverData = null;
      showCover(null);
    });

    /* --- .txt content upload --- */

    function showContent(text) {
      window.VolmerraChapters.appendContent(contentPreview, text);
      if (text) {
        contentPreview.hidden = false;
        contentEmpty.hidden = true;
        contentReplace.hidden = false;
      } else {
        contentPreview.hidden = true;
        contentEmpty.hidden = false;
        contentReplace.hidden = true;
      }
    }

    contentInput.addEventListener("change", function () {
      var file = contentInput.files && contentInput.files[0];
      contentInput.value = "";
      if (!file) return;
      if (!/\.txt$/i.test(file.name) && file.type !== "text/plain") {
        showError("Please choose a .txt file.");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        showError("Please choose a .txt file smaller than 2 MB.");
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        clearError();
        contentText = String(reader.result || "");
        showContent(contentText);
      };
      reader.readAsText(file);
    });

    contentReplace.addEventListener("click", function () {
      contentInput.click();
    });

    /* --- create vs edit mode --- */

    var params = new URLSearchParams(window.location.search);
    chapterId = params.get("id");

    if (chapterId) {
      heading.textContent = "Edit chapter";
      window.VolmerraChapters
        .get(chapterId, { includeDrafts: true })
        .then(function (c) {
          if (!c) {
            form.hidden = true;
            showError("Chapter not found.");
            return;
          }
          titleInput.value = c.title;
          descInput.value = c.description || "";
          seasonSelect.value = c.season;
          seasonSelect.disabled = true;
          numberInput.value = c.numberInSeason;
          numberEl.textContent = c.number;
          coverData = c.cover || null;
          contentText = c.content || "";
          showCover(coverData);
          showContent(contentText);
          if (c.scheduledAt) {
            scheduleInput.value = toLocalInput(c.scheduledAt);
          }
          if (c.status === "published") {
            /* Published chapters cannot be scheduled again. */
            scheduleBtn.disabled = true;
            scheduleInput.disabled = true;
          }

          /* Live code preview while the admin edits the number. */
          numberInput.addEventListener("input", function () {
            var v = parseInt(numberInput.value, 10);
            numberEl.textContent =
              Number.isInteger(v) && v >= 1
                ? c.season.toUpperCase() + "B" + v
                : c.number;
          });
        });
    } else {
      /* Suggest the next free number for the selected season — the
         admin can override it with any free whole number. */
      function updateSuggestion() {
        if (!seasonSelect.value) {
          numberInput.value = "";
          numberEl.textContent = "—";
          return;
        }
        window.VolmerraChapters
          .nextNumberIn(seasonSelect.value)
          .then(function (next) {
            if (document.activeElement !== numberInput) {
              numberInput.value = next;
            }
            numberEl.textContent =
              seasonSelect.value.toUpperCase() + "B" + next;
          });
      }
      seasonSelect.addEventListener("change", updateSuggestion);
      updateSuggestion();
      numberInput.addEventListener("input", function () {
        var v = parseInt(numberInput.value, 10);
        numberEl.textContent =
          seasonSelect.value && Number.isInteger(v) && v >= 1
            ? seasonSelect.value.toUpperCase() + "B" + v
            : "—";
      });
    }

    /* --- submit --- */

    function submit(status, scheduledAt) {
      clearError();
      var title = titleInput.value.trim();
      if (!title) {
        showError("Please enter a chapter title.");
        return;
      }
      if (!chapterId && !seasonSelect.value) {
        showError("Please select a season.");
        return;
      }
      var numberValue = parseInt(numberInput.value, 10);
      if (!Number.isInteger(numberValue) || numberValue < 1) {
        showError("The chapter number must be a whole number of at least 1.");
        return;
      }

      setBusy(true);
      var data = {
        title: title,
        description: descInput.value.trim(),
        cover: coverData,
        content: contentText,
        status: status,
        scheduledAt: scheduledAt || null,
        numberInSeason: numberValue,
      };
      var operation = chapterId
        ? window.VolmerraChapters.update(chapterId, data)
        : window.VolmerraChapters.create(
            Object.assign({ season: seasonSelect.value }, data)
          );
      operation
        .then(function (chapter) {
          var message = null;
          if (chapter) {
            var verb = chapterId ? "Updated" : "Created";
            var state =
              status === "published"
                ? "published chapter "
                : status === "scheduled"
                ? "scheduled chapter "
                : "draft of chapter ";
            window.VolmerraCMS.log(verb + state + chapter.number);
            if (status === "scheduled") {
              message =
                "Scheduled " +
                chapter.number +
                " for " +
                formatDateTime(chapter.scheduledAt) +
                ".";
            } else if (status === "published") {
              message =
                (chapterId ? "Updated" : "Published") +
                " chapter " +
                chapter.number +
                ".";
              /* Notify signed-in readers who see the site while the
                 chapter goes live. Real delivery to offline users
                 requires the backend. */
              if (window.VolmerraNotifications) {
                window.VolmerraNotifications.add({
                  title: "New chapter published",
                  body: chapter.number + " — " + chapter.title,
                  href: "pages/chapter.html?id=" + chapter.id,
                });
              }
            }
          }
          window.location.href =
            "chapters.html" +
            (message ? "?msg=" + encodeURIComponent(message) : "");
        })
        .catch(function (error) {
          setBusy(false);
          showError(
            error && error.message
              ? error.message
              : "Something went wrong. Please try again."
          );
        });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submit("published");
    });

    scheduleBtn.addEventListener("click", function () {
      var value = scheduleInput.value;
      if (!value) {
        showError("Please choose a date and time to schedule.");
        return;
      }
      var time = new Date(value);
      if (isNaN(time.getTime())) {
        showError("The scheduled date is invalid.");
        return;
      }
      if (time.getTime() <= Date.now()) {
        showError("The scheduled date must be in the future.");
        return;
      }
      submit("scheduled", time.toISOString());
    });

    draftBtn.addEventListener("click", function () {
      submit("draft");
    });
  }

  /* ================= Generic collections ================= */

  var COLLECTIONS = {
    characters: {
      itemLabel: "character",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "season", label: "Primary season", type: "season" },
        { key: "age", label: "Age", type: "text" },
        { key: "affiliations", label: "Affiliations", type: "text" },
        { key: "image", label: "Default portrait (fallback)", type: "image" },
        { key: "description", label: "Biography", type: "textarea" },
        {
          key: "other",
          label: "Other information",
          type: "textarea",
        },
        {
          key: "portraits",
          label: "Character gallery — seasonal portraits",
          type: "portraits",
        },
      ],
      primary: "name",
      meta: function (item) {
        var base = item.season
          ? "Season " + item.season.toUpperCase()
          : "No season";
        var seasons = window.VolmerraCMS.portraitSeasons(item, { all: true });
        return (
          base +
          (seasons.length
            ? " · Portraits: " +
              seasons
                .map(function (s) {
                  return s.toUpperCase();
                })
                .join(", ")
            : " · No seasonal portraits")
        );
      },
    },
    locations: {
      itemLabel: "location",
      /* Public Places page groups by the exact region string; entries
         with no region are shown under "Unassigned Locations" here so
         they never silently disappear. */
      groupBy: "region",
      fields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "region", label: "Region", type: "text" },
        { key: "image", label: "Image", type: "image" },
        { key: "description", label: "Description", type: "textarea" },
      ],
      primary: "name",
      meta: function (item) {
        return item.region || "No region";
      },
    },
    lore: {
      itemLabel: "entry",
      fields: [
        { key: "title", label: "Title", type: "text", required: true },
        {
          key: "category",
          label: "Category",
          type: "select",
          options: [
            "history",
            "mythology",
            "powers",
            "stones",
            "magical systems",
            "other",
          ],
        },
        { key: "season", label: "Season", type: "season" },
        { key: "content", label: "Content", type: "textarea" },
      ],
      primary: "title",
      meta: function (item) {
        return item.category || "Uncategorized";
      },
    },
    gallery: {
      itemLabel: "image",
      fields: [
        { key: "image", label: "Image", type: "image", required: true },
        { key: "title", label: "Title", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
      ],
      primary: "title",
      meta: function (item) {
        return item.category || "Uncategorized";
      },
    },
  };

  function initCollectionPage() {
    var store = document.body.dataset.collection;
    var config = COLLECTIONS[store];
    if (!config) return;

    var formWrap = document.getElementById("collection-form");
    var listEl = document.getElementById("collection-list");
    var newBtn = document.getElementById("new-item");
    var editingId = null;
    var values = {};

    newBtn.addEventListener("click", function () {
      openForm(null);
    });

    guardAdmin(refresh);

    function refresh() {
      window.VolmerraCMS.list(store, { all: true }).then(function (items) {
        listEl.innerHTML = "";
        if (!items.length) {
          listEl.appendChild(
            el(
              "div",
              "empty-state",
              "No " + config.itemLabel + "s yet. Add the first one to get started."
            )
          );
          return;
        }
        var ordered = items.slice().reverse();
        if (config.groupBy) {
          /* Group by the exact canonical field value (e.g. a location's
             region); entries without a value get their own group so they
             never silently disappear. */
          var groups = {};
          var order = [];
          ordered.forEach(function (item) {
            var key = (item[config.groupBy] || "").trim();
            if (!groups[key]) {
              groups[key] = [];
              order.push(key);
            }
            groups[key].push(item);
          });
          order.sort(function (a, b) {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b);
          });
          order.forEach(function (key) {
            listEl.appendChild(
              el(
                "p",
                "collection-group-head",
                key || "Unassigned Locations"
              )
            );
            groups[key].forEach(function (item) {
              listEl.appendChild(rowFor(item));
            });
          });
        } else {
          ordered.forEach(function (item) {
            listEl.appendChild(rowFor(item));
          });
        }
      });
    }

    function rowFor(item) {
      var row = el("div", "admin-row");
      row.appendChild(
        thumb(window.VolmerraCMS.portraitFor(item, window.VolmerraSeason.current()))
      );

      var body = el("div", "admin-row-body");
      body.appendChild(
        el(
          "p",
          "admin-row-title",
          (config.primary && item[config.primary]) || "(untitled)"
        )
      );
      body.appendChild(el("p", "admin-row-meta", config.meta(item)));
      row.appendChild(body);

      var actions = el("div", "admin-row-actions");

      var edit = el("button", "btn btn--ghost btn--sm", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () {
        openForm(item);
      });
      actions.appendChild(edit);

      var del = el("button", "btn btn--ghost btn--sm", "Delete");
      del.type = "button";
      del.addEventListener("click", function () {
        var label = item[config.primary] || config.itemLabel;
        if (
          window.confirm(
            "Delete this " + config.itemLabel + " (" + label + ")? This cannot be undone."
          )
        ) {
          window.VolmerraCMS.remove(store, item.id).then(function () {
            window.VolmerraCMS.log(
              "Deleted " + config.itemLabel + " " + label
            );
            refresh();
          });
        }
      });
      actions.appendChild(del);

      row.appendChild(actions);
      return row;
    }

    function imageFieldNode(f) {
      var wrap = el("div");

      var preview = el("img", "cover-preview");
      preview.alt = "";
      var empty = el("div", "cover-preview placeholder", "No image uploaded");
      var row = el("div", "avatar-row");

      var label = el("label", "btn btn--ghost btn--sm", "Upload image");
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      label.appendChild(input);

      var remove = el("button", "btn btn--ghost btn--sm", "Remove");
      remove.type = "button";

      row.appendChild(label);
      row.appendChild(remove);
      wrap.appendChild(preview);
      wrap.appendChild(empty);
      wrap.appendChild(row);

      function sync() {
        if (values[f.key]) {
          preview.src = values[f.key];
          preview.hidden = false;
          empty.hidden = true;
          remove.hidden = false;
        } else {
          preview.hidden = true;
          preview.removeAttribute("src");
          empty.hidden = false;
          remove.hidden = true;
        }
      }

      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        if (!file.type || file.type.indexOf("image/") !== 0) {
          window.alert("Please choose an image file.");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          window.alert("Please choose an image smaller than 20 MB.");
          return;
        }
        window.VolmerraAdminImages.process(file, 1600, function (
          error,
          dataUrl
        ) {
          if (error) {
            window.alert(error.message);
            return;
          }
          values[f.key] = dataUrl;
          sync();
        });
      });

      remove.addEventListener("click", function () {
        values[f.key] = null;
        sync();
      });

      sync();
      return wrap;
    }

    /* The seasonal character gallery: eight independent portrait slots
       (S1–S8). Uploading one slot never touches the others, so a
       character keeps every season's portrait in a single profile. */
    function portraitGalleryNode(f) {
      var wrap = el("div", "portrait-gallery");
      window.VolmerraChapters.seasons.forEach(function (season) {
        wrap.appendChild(portraitSlot(f, season));
      });
      return wrap;
    }

    function portraitSlot(f, season) {
      var row = el("div", "admin-row");

      var preview = el("img", "portrait-thumb");
      preview.alt = season.toUpperCase() + " portrait";
      var empty = el("div", "portrait-thumb");
      row.appendChild(preview);
      row.appendChild(empty);

      var body = el("div", "admin-row-body");
      body.appendChild(
        el("p", "admin-row-title", season.toUpperCase() + " portrait")
      );
      var status = el("p", "admin-row-meta");
      body.appendChild(status);
      row.appendChild(body);

      var actions = el("div", "admin-row-actions");
      var label = el("label", "btn btn--ghost btn--sm", "Upload");
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      label.appendChild(input);
      var remove = el("button", "btn btn--ghost btn--sm", "Remove");
      remove.type = "button";
      actions.appendChild(label);
      actions.appendChild(remove);
      row.appendChild(actions);

      function sync() {
        if (values[f.key] && values[f.key][season]) {
          preview.src = values[f.key][season];
          preview.hidden = false;
          empty.hidden = true;
          remove.hidden = false;
          status.textContent = "Uploaded — shown in " + season.toUpperCase() + " content";
          label.childNodes[0].nodeValue = "Replace";
        } else {
          preview.hidden = true;
          preview.removeAttribute("src");
          empty.hidden = false;
          remove.hidden = true;
          status.textContent = "Not uploaded";
          label.childNodes[0].nodeValue = "Upload";
        }
      }

      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        if (!file.type || file.type.indexOf("image/") !== 0) {
          window.alert("Please choose an image file.");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          window.alert("Please choose an image smaller than 20 MB.");
          return;
        }
        window.VolmerraAdminImages.process(file, 1600, function (
          error,
          dataUrl
        ) {
          if (error) {
            window.alert(error.message);
            return;
          }
          values[f.key][season] = dataUrl;
          sync();
        });
      });

      remove.addEventListener("click", function () {
        delete values[f.key][season];
        sync();
      });

      sync();
      return row;
    }

    function buildField(f) {
      var wrap = el("div", "field");

      var label = el("label", null, f.label);
      wrap.appendChild(label);

      if (f.type === "image") {
        wrap.appendChild(imageFieldNode(f));
        return wrap;
      }

      if (f.type === "portraits") {
        wrap.appendChild(portraitGalleryNode(f));
        return wrap;
      }

      label.htmlFor = "f-" + f.key;

      if (f.type === "textarea") {
        var t = document.createElement("textarea");
        t.id = "f-" + f.key;
        t.value = values[f.key] || "";
        wrap.appendChild(t);
      } else if (f.type === "select" || f.type === "season") {
        var s = document.createElement("select");
        s.id = "f-" + f.key;
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent =
          f.type === "season" ? "Unassigned" : "Select…";
        s.appendChild(placeholder);
        var options =
          f.type === "season"
            ? window.VolmerraChapters.seasons
            : f.options;
        options.forEach(function (opt) {
          var o = document.createElement("option");
          o.value = opt;
          o.textContent =
            f.type === "season"
              ? opt.toUpperCase()
              : opt.charAt(0).toUpperCase() + opt.slice(1);
          if (values[f.key] === opt) o.selected = true;
          s.appendChild(o);
        });
        wrap.appendChild(s);
      } else {
        var input = document.createElement("input");
        input.type = "text";
        input.id = "f-" + f.key;
        input.value = values[f.key] || "";
        wrap.appendChild(input);
      }
      return wrap;
    }

    function closeForm() {
      formWrap.hidden = true;
      formWrap.innerHTML = "";
      editingId = null;
    }

    function openForm(item) {
      editingId = item ? item.id : null;
      values = {};
      config.fields.forEach(function (f) {
        if (f.type === "portraits") {
          values[f.key] = Object.assign({}, (item && item[f.key]) || {});
        } else if (f.type === "image") {
          values[f.key] = item && item[f.key] ? item[f.key] : null;
        } else {
          values[f.key] = item && item[f.key] != null ? item[f.key] : "";
        }
      });

      formWrap.innerHTML = "";
      var head = el("div", "member-panel-head");
      head.appendChild(
        el(
          "h2",
          null,
          item ? "Edit " + config.itemLabel : "New " + config.itemLabel
        )
      );
      formWrap.appendChild(head);

      var errorBox = el("p", "form-error");
      errorBox.setAttribute("role", "alert");
      formWrap.appendChild(errorBox);

      config.fields.forEach(function (f) {
        formWrap.appendChild(buildField(f));
      });

      var actions = el("div", "avatar-row");
      var save = el("button", "btn btn--primary", "Save");
      save.type = "button";
      var cancel = el("button", "btn btn--ghost", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", closeForm);
      actions.appendChild(save);
      actions.appendChild(cancel);
      formWrap.appendChild(actions);
      formWrap.hidden = false;

      function saveItem() {
        var data = {};
        var missing = null;
        config.fields.forEach(function (f) {
          if (f.type === "image") {
            data[f.key] = values[f.key] || null;
            if (f.required && !data[f.key]) missing = f.label;
            return;
          }
          if (f.type === "portraits") {
            data[f.key] = Object.assign({}, values[f.key] || {});
            return;
          }
          var node = document.getElementById("f-" + f.key);
          var val = node ? node.value : "";
          if (f.required && !val.trim()) missing = f.label;
          data[f.key] = val.trim();
        });

        errorBox.textContent = "";
        errorBox.classList.remove("is-visible");
        if (missing) {
          errorBox.textContent = "Please fill in: " + missing + ".";
          errorBox.classList.add("is-visible");
          return;
        }

        save.disabled = true;
        cancel.disabled = true;
        var operation = editingId
          ? window.VolmerraCMS.update(store, editingId, data)
          : window.VolmerraCMS.create(store, data);
        operation
          .then(function () {
            var label = data[config.primary] || config.itemLabel;
            window.VolmerraCMS.log(
              (editingId ? "Updated " : "Added ") +
                config.itemLabel +
                " " +
                label
            );
            closeForm();
            refresh();
          })
          .catch(function (error) {
            save.disabled = false;
            cancel.disabled = false;
            errorBox.textContent =
              error && error.message
                ? error.message
                : "Something went wrong. Please try again.";
            errorBox.classList.add("is-visible");
          });
      }

      save.addEventListener("click", saveItem);
    }
  }

  /* ================= Publishing ================= */

  function initPublishing() {
    var draftsMount = document.getElementById("drafts-list");
    var scheduledMount = document.getElementById("scheduled-list");
    var publishedMount = document.getElementById("published-list");

    bindChapterActions(draftsMount, renderAll);
    bindChapterActions(scheduledMount, renderAll);
    bindChapterActions(publishedMount, renderAll);

    showFlashFromUrl();
    guardAdmin(function () {
      renderAll();
      startTicker(renderAll);
    });

    function renderAll() {
      window.VolmerraChapters.list().then(function (chapters) {
        renderInto(
          draftsMount,
          chapters
            .filter(function (c) {
              return c.status === "draft";
            })
            .reverse(),
          "No draft chapters."
        );
        renderInto(
          scheduledMount,
          chapters
            .filter(function (c) {
              return c.status === "scheduled";
            })
            .sort(function (a, b) {
              return new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0);
            }),
          "No scheduled chapters. Schedule one from the publish form."
        );
        renderInto(
          publishedMount,
          chapters
            .filter(function (c) {
              return c.status === "published";
            })
            .sort(function (a, b) {
              return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
            }),
          "No published chapters yet."
        );
      });
    }

    function renderInto(mount, items, emptyText) {
      mount.innerHTML = "";
      if (!items.length) {
        mount.appendChild(el("div", "empty-state", emptyText));
        return;
      }
      items.forEach(function (c) {
        mount.appendChild(chapterRow(c));
      });
    }
  }

  /* ================= Website settings ================= */

  function initWebsite() {
    var form = document.getElementById("website-form");
    var savedNote = document.getElementById("website-saved");
    var featuredChapter = document.getElementById("featured-chapter");
    var featuredCharacter = document.getElementById("featured-character");
    var announcementText = document.getElementById("announcement-text");
    var announcementVisible = document.getElementById("announcement-visible");
    var sectionsMount = document.getElementById("sections-list");
    var seasonSelect = document.getElementById("default-season");

    function note(text) {
      savedNote.textContent = text;
      savedNote.hidden = false;
    }

    var autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "Follow website (latest published)";
    seasonSelect.appendChild(autoOption);
    window.VolmerraSeason.list().forEach(function (season) {
      var option = document.createElement("option");
      option.value = season;
      option.textContent = season.toUpperCase() + " (preview)";
      seasonSelect.appendChild(option);
    });
    seasonSelect.value = window.VolmerraSeasons.isPreview()
      ? window.VolmerraSeasons.getPreview()
      : "";
    seasonSelect.addEventListener("change", function () {
      if (!seasonSelect.value) {
        window.VolmerraSeasons.clearPreview();
        window.VolmerraSeason.applyPublic();
        note(
          "Theme preview cleared: the website follows the latest published season again."
        );
      } else {
        window.VolmerraSeason.set(seasonSelect.value);
        note(
          "Previewing " +
            seasonSelect.value.toUpperCase() +
            ". This affects only your admin view — never the public website."
        );
      }
    });

    guardAdmin(function () {
      Promise.all([
        window.VolmerraChapters.list(),
        window.VolmerraCMS.list("characters", { all: true }),
        window.VolmerraCMS.settings(),
      ]).then(function (results) {
        var chapters = results[0];
        var characters = results[1];
        var settings = results[2];

        var noneOpt = document.createElement("option");
        noneOpt.value = "";
        noneOpt.textContent = "None";
        featuredChapter.appendChild(noneOpt);
        chapters.forEach(function (c) {
          var o = document.createElement("option");
          o.value = c.id;
          o.textContent = c.number + " — " + c.title;
          if (settings.featuredChapterId === c.id) o.selected = true;
          featuredChapter.appendChild(o);
        });

        var noneChar = document.createElement("option");
        noneChar.value = "";
        noneChar.textContent = "None";
        featuredCharacter.appendChild(noneChar);
        characters.forEach(function (ch) {
          var o = document.createElement("option");
          o.value = ch.id;
          o.textContent = ch.name || "(unnamed)";
          if (settings.featuredCharacterId === ch.id) o.selected = true;
          featuredCharacter.appendChild(o);
        });

        announcementText.value = settings.announcement.text || "";
        announcementVisible.checked = !!settings.announcement.visible;

        var announcementSeason = document.getElementById(
          "announcement-season"
        );
        var noneAnn = document.createElement("option");
        noneAnn.value = "";
        noneAnn.textContent = "None (all seasons)";
        announcementSeason.appendChild(noneAnn);
        window.VolmerraSeason.list().forEach(function (season) {
          var o = document.createElement("option");
          o.value = season;
          o.textContent = season.toUpperCase();
          if (settings.announcement.season === season) o.selected = true;
          announcementSeason.appendChild(o);
        });

        renderSections(settings.sections);
      });
    });

    function renderSections(sections) {
      sectionsMount.innerHTML = "";
      sections.forEach(function (s, i) {
        var row = el("div", "admin-row");
        var body = el("div", "admin-row-body");
        body.appendChild(el("p", "admin-row-title", s.label));
        body.appendChild(
          el(
            "p",
            "admin-row-meta",
            s.visible ? "Visible on the homepage" : "Hidden"
          )
        );
        row.appendChild(body);

        var actions = el("div", "admin-row-actions");
        var up = el("button", "btn btn--ghost btn--sm", "Up");
        up.type = "button";
        up.disabled = i === 0;
        up.addEventListener("click", function () {
          move(i, -1);
        });
        var down = el("button", "btn btn--ghost btn--sm", "Down");
        down.type = "button";
        down.disabled = i === sections.length - 1;
        down.addEventListener("click", function () {
          move(i, 1);
        });
        var vis = el(
          "button",
          "btn btn--ghost btn--sm",
          s.visible ? "Hide" : "Show"
        );
        vis.type = "button";
        vis.addEventListener("click", function () {
          toggleVisible(s.id);
        });
        actions.appendChild(up);
        actions.appendChild(down);
        actions.appendChild(vis);
        row.appendChild(actions);
        sectionsMount.appendChild(row);
      });
    }

    function move(index, delta) {
      window.VolmerraCMS.settings().then(function (settings) {
        var sections = settings.sections.slice();
        var target = index + delta;
        if (target < 0 || target >= sections.length) return;
        var tmp = sections[index];
        sections[index] = sections[target];
        sections[target] = tmp;
        window.VolmerraCMS.saveSettings({ sections: sections }).then(
          function () {
            window.VolmerraCMS.log("Reordered homepage sections");
            renderSections(sections);
          }
        );
      });
    }

    function toggleVisible(id) {
      window.VolmerraCMS.settings().then(function (settings) {
        var sections = settings.sections.map(function (s) {
          return s.id === id
            ? Object.assign({}, s, { visible: !s.visible })
            : s;
        });
        window.VolmerraCMS.saveSettings({ sections: sections }).then(
          function () {
            window.VolmerraCMS.log("Updated homepage section visibility");
            renderSections(sections);
          }
        );
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      window.VolmerraCMS
        .saveSettings({
          featuredChapterId: featuredChapter.value || null,
          featuredCharacterId: featuredCharacter.value || null,
          announcement: {
            text: announcementText.value.trim(),
            visible: announcementVisible.checked,
            season: (document.getElementById("announcement-season") || {})
              .value || null,
          },
        })
        .then(function () {
          window.VolmerraCMS.log("Updated website settings");
          note(
            "Saved. Prototype note: the public homepage will consume these settings when it is wired to the data layer — public pages are not modified in this task."
          );
        });
    });
  }

  /* ================= Season management ================= */

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

  var STATUS_LABELS = {
    "unreleased": "Unreleased",
    "coming-soon": "Coming soon",
    "published": "Published",
    "archived": "Archived",
  };

  function initSeasons() {
    var listEl = document.getElementById("seasons-list");
    var flash = document.getElementById("admin-flash");

    function note(text) {
      flash.textContent = text;
      flash.classList.add("is-visible");
    }

    function clearNote() {
      flash.textContent = "";
      flash.classList.remove("is-visible");
    }

    function renderAll() {
      Promise.all([
        window.VolmerraChapters.list(),
        window.VolmerraCMS.list("characters", { all: true }),
        window.VolmerraCMS.list("locations", { all: true }),
        window.VolmerraCMS.list("lore", { all: true }),
        window.VolmerraCMS.list("gallery", { all: true }),
      ]).then(function (results) {
        var chapters = results[0];
        var characters = results[1];
        var locations = results[2];
        var lore = results[3];
        var gallery = results[4];
        var season = function (item) {
          return item.season;
        };

        listEl.innerHTML = "";
        window.VolmerraSeasons.list().forEach(function (record) {
          listEl.appendChild(
            rowFor(record, {
              chapters: chapters.filter(function (c) {
                return c.season === record.id;
              }).length,
              characters: characters.filter(function (c) {
                return c.season === record.id;
              }).length,
              entries:
                locations.filter(function (l) {
                  return l.season === record.id;
                }).length +
                lore.filter(function (l) {
                  return l.season === record.id;
                }).length +
                gallery.filter(function (g) {
                  return g.season === record.id;
                }).length,
            })
          );
        });
      });
    }

    function rowFor(record, counts) {
      var season = record.id;
      var row = el("div", "admin-row admin-row--stacked");

      var swatch = el("span", "swatch");
      var color = el("span", "swatch-color");
      color.style.background = SEASON_ACCENTS[season] || "#6d7178";
      swatch.appendChild(color);
      swatch.appendChild(el("span", null, season.toUpperCase()));
      row.appendChild(swatch);

      var body = el("div", "admin-row-body");
      body.appendChild(
        el("p", "admin-row-title", season.toUpperCase() + " — " + STATUS_LABELS[record.status])
      );

      var meta = el("p", "admin-row-meta");
      meta.appendChild(
        document.createTextNode(
          "Published " +
            (record.publishedAt ? formatDate(record.publishedAt) : "—") +
            " · " +
            counts.chapters +
            " chapters · " +
            counts.characters +
            " characters · " +
            counts.entries +
            " related entries"
        )
      );
      if (record.status === "coming-soon" && record.releaseAt) {
        meta.appendChild(
          document.createTextNode(
            " · Releases " + formatDateTime(record.releaseAt) + " · "
          )
        );
        var cd = el("span", null, countdown(record.releaseAt));
        cd.setAttribute("data-countdown", record.releaseAt);
        meta.appendChild(cd);
      }
      body.appendChild(meta);
      row.appendChild(body);

      var actions = el("div", "admin-row-actions");

      var select = document.createElement("select");
      select.className = "season-status";
      [
        ["unreleased", "Unreleased"],
        ["coming-soon", "Coming soon"],
        ["published", "Published"],
        ["archived", "Archived"],
      ].forEach(function (pair) {
        var o = document.createElement("option");
        o.value = pair[0];
        o.textContent = pair[1];
        select.appendChild(o);
      });
      select.value = record.status;
      select.addEventListener("change", function () {
        if (
          select.value === "coming-soon" &&
          record.status !== "coming-soon" &&
          !record.releaseAt
        ) {
          note(
            "Choose a release date and time, then press Schedule release."
          );
          select.value = record.status;
          return;
        }
        window.VolmerraSeasons
          .setStatus(season, { status: select.value })
          .then(function () {
            clearNote();
            renderAll();
          })
          .catch(function (err) {
            note(err && err.message ? err.message : "Something went wrong.");
            select.value = record.status;
          });
      });
      actions.appendChild(select);

      var releaseInput = document.createElement("input");
      releaseInput.type = "datetime-local";
      if (record.releaseAt) releaseInput.value = toLocalInput(record.releaseAt);
      actions.appendChild(releaseInput);

      var scheduleBtn = el(
        "button",
        "btn btn--ghost btn--sm",
        record.status === "coming-soon" ? "Change date" : "Schedule release"
      );
      scheduleBtn.type = "button";
      scheduleBtn.addEventListener("click", function () {
        var value = releaseInput.value;
        if (!value) {
          note("Choose a release date and time first.");
          return;
        }
        var t = new Date(value);
        if (isNaN(t.getTime())) {
          note("The release date is invalid.");
          return;
        }
        if (t.getTime() <= Date.now()) {
          note("The release date must be in the future.");
          return;
        }
        clearNote();
        window.VolmerraSeasons
          .setStatus(season, {
            status: "coming-soon",
            releaseAt: t.toISOString(),
          })
          .then(function () {
            note(
              "Scheduled " +
                season.toUpperCase() +
                " for " +
                formatDateTime(t.toISOString()) +
                ". It will release automatically while the website is open — reliable release needs the server-side scheduler."
            );
            renderAll();
          })
          .catch(function (err) {
            note(err && err.message ? err.message : "Something went wrong.");
          });
      });
      actions.appendChild(scheduleBtn);

      if (record.status !== "published") {
        var publishBtn = el(
          "button",
          "btn btn--primary btn--sm",
          "Publish now"
        );
        publishBtn.type = "button";
        publishBtn.addEventListener("click", function () {
          window.VolmerraSeasons
            .setStatus(season, { status: "published" })
            .then(function () {
              clearNote();
              note(
                season.toUpperCase() +
                  " is now published. Its content is public and its theme is active."
              );
              renderAll();
            })
            .catch(function (err) {
              note(err && err.message ? err.message : "Something went wrong.");
            });
        });
        actions.appendChild(publishBtn);
      }

      if (record.status !== "archived") {
        var archiveBtn = el("button", "btn btn--ghost btn--sm", "Archive");
        archiveBtn.type = "button";
        archiveBtn.addEventListener("click", function () {
          window.VolmerraSeasons
            .setStatus(season, { status: "archived" })
            .then(function () {
              clearNote();
              note(season.toUpperCase() + " archived.");
              renderAll();
            })
            .catch(function (err) {
              note(err && err.message ? err.message : "Something went wrong.");
            });
        });
        actions.appendChild(archiveBtn);
      }

      var previewBtn = el("button", "btn btn--ghost btn--sm", "Preview theme");
      previewBtn.type = "button";
      previewBtn.addEventListener("click", function () {
        window.VolmerraSeason.set(season);
        note(
          "Previewing the " +
            season.toUpperCase() +
            " theme. This applies only to your admin view — never to the public website."
        );
      });
      actions.appendChild(previewBtn);

      row.appendChild(actions);
      return row;
    }

    guardAdmin(function () {
      renderAll();
      startTicker(renderAll);
    });
  }

  /* ================= Page banners ================= */

  var BANNER_PAGES = [
    { key: "story", label: "Story" },
    { key: "characters", label: "Characters" },
    { key: "places", label: "Places" },
    { key: "universe", label: "Universe" },
    { key: "gallery", label: "Gallery" },
    { key: "about", label: "About" },
  ];

  function initBanners() {
    var listEl = document.getElementById("banners-list");
    var flash = document.getElementById("admin-flash");

    function note(text) {
      flash.textContent = text;
      flash.classList.add("is-visible");
      window.setTimeout(function () {
        flash.classList.remove("is-visible");
      }, 2500);
    }

    guardAdmin(function () {
      window.VolmerraCMS.settings().then(function (settings) {
        var banners = settings.banners || {};
        listEl.innerHTML = "";
        BANNER_PAGES.forEach(function (page) {
          listEl.appendChild(
            rowFor(page, banners[page.key] || { image: null, focus: 50, gradient: false })
          );
        });
      });
    });

    function rowFor(page, banner) {
      var row = el("div", "admin-row admin-row--stacked");

      var media = el("div", "banner-preview");
      if (banner.image) {
        var img = el("img");
        img.src = banner.image;
        img.alt = "";
        img.style.objectPosition = "50% " + banner.focus + "%";
        media.appendChild(img);
        media.classList.add("has-image");
      } else {
        media.appendChild(el("span", null, "No banner uploaded"));
      }
      row.appendChild(media);

      var body = el("div", "admin-row-body");
      body.appendChild(el("p", "admin-row-title", page.label));
      row.appendChild(body);

      var actions = el("div", "admin-row-actions");

      var label = el("label", "btn btn--ghost btn--sm", banner.image ? "Replace" : "Upload");
      var input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      label.appendChild(input);
      actions.appendChild(label);

      var remove = el("button", "btn btn--ghost btn--sm", "Remove");
      remove.type = "button";
      remove.hidden = !banner.image;
      actions.appendChild(remove);

      var focusSelect = document.createElement("select");
      focusSelect.className = "season-status";
      [
        [25, "Focus: top"],
        [50, "Focus: center"],
        [75, "Focus: bottom"],
      ].forEach(function (pair) {
        var o = document.createElement("option");
        o.value = pair[0];
        o.textContent = pair[1];
        focusSelect.appendChild(o);
      });
      focusSelect.value = String(banner.focus || 50);
      actions.appendChild(focusSelect);

      var gradientLabel = el(
        "label",
        "btn btn--ghost btn--sm" + (banner.gradient ? " is-active" : ""),
        banner.gradient ? "Gradient: on" : "Gradient: off"
      );
      gradientLabel.style.display = "inline-flex";
      var gradientBox = document.createElement("input");
      gradientBox.type = "checkbox";
      gradientBox.checked = !!banner.gradient;
      gradientBox.hidden = true;
      gradientLabel.appendChild(gradientBox);
      actions.appendChild(gradientLabel);

      function saveBanner(data) {
        window.VolmerraCMS.settings().then(function (settings) {
          var banners = Object.assign({}, settings.banners || {});
          banners[page.key] = Object.assign(
            { image: null, focus: 50, gradient: false },
            banners[page.key] || {},
            data
          );
          window.VolmerraCMS
            .saveSettings({ banners: banners })
            .then(function () {
              window.VolmerraCMS.log("Updated the " + page.label + " page banner");
              note(page.label + " banner saved.");
              renderAll();
            });
        });
      }

      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        window.VolmerraAdminImages.process(file, 2000, function (
          error,
          dataUrl
        ) {
          if (error) {
            note(error.message);
            return;
          }
          saveBanner({ image: dataUrl });
        });
      });

      remove.addEventListener("click", function () {
        saveBanner({ image: null });
      });

      focusSelect.addEventListener("change", function () {
        saveBanner({ focus: parseInt(focusSelect.value, 10) });
      });

      gradientBox.addEventListener("change", function () {
        saveBanner({ gradient: gradientBox.checked });
      });

      return row;
    }
  }

  /* ================= Community ================= */

  function initCommunity() {
    guardAdmin(function () {
      var usersMount = document.getElementById("users-list");
      window.VolmerraAuth.listUsers().then(function (users) {
        usersMount.innerHTML = "";
        if (!users.length) {
          usersMount.appendChild(
            el("div", "empty-state", "No registered users yet.")
          );
        }
        users.forEach(function (u) {
          var row = el("div", "admin-row");
          var body = el("div", "admin-row-body");
          body.appendChild(el("p", "admin-row-title", u.displayName));
          body.appendChild(
            el(
              "p",
              "admin-row-meta",
              u.email + " · Joined " + formatDate(u.createdAt)
            )
          );
          row.appendChild(body);
          if (u.isAdmin) {
            row.appendChild(el("span", "badge badge--published", "Admin"));
          }
          usersMount.appendChild(row);
        });
      });

      renderModeration(
        "comments",
        document.getElementById("comments-list"),
        "No comments yet. Comment management activates when public commenting launches with the backend."
      );
      renderModeration(
        "reports",
        document.getElementById("reports-list"),
        "No reported content."
      );
    });
  }

  function renderModeration(name, mount, emptyText) {
    window.VolmerraCMS.list(name).then(function (items) {
      mount.innerHTML = "";
      if (!items.length) {
        mount.appendChild(el("div", "empty-state", emptyText));
        return;
      }
      items
        .slice()
        .reverse()
        .forEach(function (item) {
          var row = el("div", "admin-row");
          var body = el("div", "admin-row-body");
          body.appendChild(
            el("p", "admin-row-title", item.text || "(no text)")
          );
          body.appendChild(el("p", "admin-row-meta", formatDate(item.createdAt)));
          row.appendChild(body);

          var actions = el("div", "admin-row-actions");
          var del = el("button", "btn btn--ghost btn--sm", "Remove");
          del.type = "button";
          del.addEventListener("click", function () {
            window.VolmerraCMS.remove(name, item.id).then(function () {
              window.VolmerraCMS.log("Removed a " + name.slice(0, -1));
              renderModeration(name, mount, emptyText);
            });
          });
          actions.appendChild(del);
          row.appendChild(actions);
          mount.appendChild(row);
        });
    });
  }
})();
