/* ============================================================
   VOLMERRA — Story page
   Renders all published chapters, grouped by season, in
   numerical order. Draft chapters never appear here.
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
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function rowFor(c) {
    var link = el("a", "chapter-row");
    link.href = "chapter.html?id=" + encodeURIComponent(c.id);

    var body = el("div");
    body.appendChild(
      el("p", "row-title", c.number + " — " + c.title)
    );
    body.appendChild(el("p", "row-meta", formatDate(c.publishedAt)));
    link.appendChild(body);

    link.appendChild(el("span", "row-meta", "Read →"));
    return link;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mount = document.getElementById("chapters-mount");
    if (!mount) return;

    function loadChapters() {
      window.VolmerraChapters.publishedBySeason().then(function (groups) {
        mount.innerHTML = "";
        if (!groups.length) {
          mount.appendChild(
            el(
              "div",
              "empty-state",
              "No chapters have been published yet. When chapters are released they will be listed here by season, and readers with an account can save progress, mark favorites and keep a reading history."
            )
          );
          return;
        }

        groups.forEach(function (group) {
          var head = el("div", "section-head");
          var titles = el("div");
          titles.appendChild(
            el("p", "eyebrow", "Season " + group.season.toUpperCase())
          );
          titles.appendChild(
            el("h2", null, "Season " + group.season.toUpperCase() + " chapters")
          );
          head.appendChild(titles);
          mount.appendChild(head);

          group.chapters.forEach(function (c) {
            mount.appendChild(rowFor(c));
          });
        });
      });
    }

    /* Scheduled publishing (prototype): while the website is open,
       chapters whose scheduled time has passed are published here and
       immediately appear on this page. Reliable publication when
       nobody has the website open requires a server-side scheduler. */
    function publishDue() {
      window.VolmerraChapters.publishDue().then(function (due) {
        if (!due.length) return;
        due.forEach(function (c) {
          window.VolmerraCMS.log(
            "Published scheduled chapter " +
              c.number +
              " — scheduled time reached"
          );
          if (
            window.VolmerraNotifications &&
            !window.VolmerraNotifications.prefOff()
          ) {
            window.VolmerraNotifications.add({
              title: "New chapter published",
              body: c.number + " — " + c.title,
              href: "pages/chapter.html?id=" + c.id,
            });
          }
        });
        loadChapters();
      });
    }

    publishDue();
    loadChapters();
    window.setInterval(publishDue, 60000);
  });
})();
