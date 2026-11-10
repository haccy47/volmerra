/* ============================================================
   VOLMERRA — Account forms
   Wires the login, signup and profile pages to the auth
   scaffold. Each form is optional: the script no-ops on pages
   that do not contain the matching element.
   ============================================================ */

(function () {
  "use strict";

  var ROOT = document.documentElement.getAttribute("data-root") || "";

  function showError(form, message) {
    var box = form.querySelector(".form-error");
    if (box) {
      box.textContent = message;
      box.classList.add("is-visible");
    }
  }

  function clearError(form) {
    var box = form.querySelector(".form-error");
    if (box) {
      box.textContent = "";
      box.classList.remove("is-visible");
    }
  }

  function bindForm(formId, onSubmit) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearError(form);
      var button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      Promise.resolve()
        .then(function () {
          return onSubmit(form);
        })
        .catch(function (error) {
          showError(form, error && error.message ? error.message : "Something went wrong. Please try again.");
        })
        .then(function () {
          if (button) button.disabled = false;
        });
    });
  }

  bindForm("login-form", function (form) {
    var email = form.querySelector("#login-email").value;
    var password = form.querySelector("#login-password").value;
    return window.VolmerraAuth.login({ email: email, password: password }).then(function () {
      window.location.href = ROOT + "index.html";
    });
  });

  bindForm("signup-form", function (form) {
    var displayName = form.querySelector("#signup-name").value;
    var email = form.querySelector("#signup-email").value;
    var password = form.querySelector("#signup-password").value;
    return window.VolmerraAuth
      .register({ displayName: displayName, email: email, password: password })
      .then(function () {
        window.location.href = ROOT + "index.html";
      });
  });

  bindForm("account-bio-form", function (form) {
    var user = window.VolmerraAuth.currentUser();
    if (!user) {
      window.location.replace(ROOT + "pages/login.html");
      return Promise.resolve();
    }
    var bio = form.querySelector("#account-bio").value;
    return window.VolmerraAuth.updateProfile({ bio: bio }).then(function () {
      window.location.reload();
    });
  });

  bindForm("profile-form", function (form) {
    var user = window.VolmerraAuth.currentUser();
    if (!user) {
      window.location.replace(ROOT + "pages/login.html");
      return Promise.resolve();
    }
    var displayName = form.querySelector("#profile-name").value;
    return window.VolmerraAuth.updateProfile({ displayName: displayName }).then(function () {
      window.location.reload();
    });
  });

  /* Sign out button on the profile page (also handled globally in ui.js). */

  document.addEventListener("DOMContentLoaded", function () {
    /* whenReady: on the real backend the session is restored
       asynchronously — the account guards below must not redirect
       to the login page before the profile has arrived. */
    window.VolmerraAuth.whenReady(function () {
    var user = window.VolmerraAuth.currentUser();

    /* Your Account page: guard + bio + reading statistics */
    var accountSection = document.getElementById("account-section");
    if (accountSection) {
      if (!user) {
        window.location.replace(ROOT + "pages/login.html");
        return;
      }
      accountSection.hidden = false;
      document.getElementById("account-name").textContent = user.displayName;
      document.getElementById("account-email").textContent = user.email;
      var bioField = document.getElementById("account-bio");
      if (bioField) bioField.value = user.bio || "";

      function renderAccountStats() {
        window.VolmerraChapters.published().then(function (published) {
          var lib = window.VolmerraLibrary.get(user.id);
          var valid = {};
          published.forEach(function (c) {
            valid[c.id] = c;
          });
          var stats = {
            "stat-chapters-read": 0,
            "stat-completed": 0,
            "stat-favorites": 0,
            "stat-saved": 0,
          };
          lib.history.forEach(function (h) {
            if (valid[h.id]) {
              stats["stat-chapters-read"]++;
              if (h.completed) stats["stat-completed"]++;
            }
          });
          lib.favorites.forEach(function (f) {
            if (valid[f.id]) stats["stat-favorites"]++;
          });
          lib.saved.forEach(function (s) {
            if (valid[s.id]) stats["stat-saved"]++;
          });
          Object.keys(stats).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.textContent = stats[id];
          });
        });
      }
      renderAccountStats();
      /* On the real backend the library row arrives asynchronously —
         re-render the statistics when it lands. */
      document.addEventListener("volmerra:library-loaded", renderAccountStats);
      return;
    }

    /* Account Settings page: guard + populate + avatar + notification pref */
    var settingsSection = document.getElementById("settings-section");
    if (!settingsSection) return;

    if (!user) {
      window.location.replace(ROOT + "pages/login.html");
      return;
    }

    settingsSection.hidden = false;

    var emailEl = document.getElementById("profile-email");
    var nameInput = document.getElementById("profile-name");
    if (emailEl) emailEl.textContent = user.email;
    if (nameInput) nameInput.value = user.displayName;

    var avatarMount = document.getElementById("profile-avatar");
    function renderAvatar(src) {
      if (!avatarMount) return;
      if (src) {
        avatarMount.innerHTML = '<img class="avatar avatar--lg" src="' + src + '" alt="Profile picture">';
      } else {
        var initial = (user.displayName || "?").trim().charAt(0).toUpperCase();
        avatarMount.innerHTML = '<span class="avatar avatar--fallback avatar--lg">' + initial + "</span>";
      }
    }
    renderAvatar(user.avatar);

    var avatarInput = document.getElementById("profile-avatar-input");
    if (avatarInput) {
      avatarInput.addEventListener("change", function () {
        var file = avatarInput.files && avatarInput.files[0];
        if (!file) return;
        if (!file.type || file.type.indexOf("image/") !== 0) {
          window.alert("Please choose an image file.");
          return;
        }
        if (file.size > 512 * 1024) {
          window.alert("Please choose an image smaller than 512 KB.");
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          window.VolmerraAuth.updateProfile({ avatar: reader.result }).then(function () {
            renderAvatar(reader.result);
            /* Header avatar refresh */
            if (window.location) window.location.reload();
          });
        };
        reader.readAsDataURL(file);
      });
    }

    var removeAvatarBtn = document.getElementById("profile-avatar-remove");
    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener("click", function () {
        window.VolmerraAuth.updateProfile({ avatar: null }).then(function () {
          window.location.reload();
        });
      });
    }

    /* Notification preference (real, stored per account locally).
       Delivery to offline users requires the backend. */
    var notifPref = document.getElementById("settings-notifications");
    if (notifPref) {
      var pref;
      try {
        pref = localStorage.getItem("volmerra:pref:notify:" + user.id);
      } catch (e) {}
      notifPref.checked = pref !== "off";
      notifPref.addEventListener("change", function () {
        try {
          localStorage.setItem(
            "volmerra:pref:notify:" + user.id,
            notifPref.checked ? "on" : "off"
          );
        } catch (e) {}
      });
    }
    });
  });
})();
