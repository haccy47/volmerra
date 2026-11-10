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

    /* ---------- Telefon bildirimleri (Web Push + Ana Ekran) ----------
       Web Push: bölüm yayınlanınca telefon kilit ekranına bildirim
       düşer (iOS 16.4+; iPhone'da siteyi Ana Ekrana eklemek gerekir). */
    var pushPanel = document.getElementById("push-panel");
    if (pushPanel) {
      var pushToggle = document.getElementById("push-toggle");
      var pushStatus = document.getElementById("push-status");
      var sup = window.VolmerraSupabase;
      var pushSupported = !!(
        sup &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
      );
      var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      var isStandalone =
        (window.matchMedia &&
          window.matchMedia("(display-mode: standalone)").matches) ||
        navigator.standalone === true;

      function setPushStatus(text, isOk) {
        pushStatus.textContent = text;
        pushStatus.style.color = isOk ? "" : "#a03434";
      }

      function pushKeyToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var bin = "";
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      }

      function base64UrlToBytes(str) {
        var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }

      function refreshPushState() {
        if (!pushSupported) {
          pushToggle.disabled = true;
          if (isIOS && !isStandalone) {
            setPushStatus(
              "iPhone'da telefon bildirimleri için: Safari'de Paylaş → Ana Ekrana Ekle → siteyi oradan aç ve bu düğmeyi aç.",
              false
            );
          } else {
            setPushStatus("Bu tarayıcı telefon bildirimlerini desteklemiyor.", false);
          }
          return;
        }
        navigator.serviceWorker.ready
          .then(function (reg) {
            return reg.pushManager.getSubscription();
          })
          .then(function (sub) {
            pushToggle.checked = !!sub;
            if (pushToggle.checked) setPushStatus("Telefon bildirimleri açık.", true);
          })
          .catch(function () {});
      }

      pushToggle.addEventListener("change", function () {
        var enable = pushToggle.checked;
        pushToggle.disabled = true;
        var done = function (msg, isOk) {
          pushToggle.disabled = false;
          if (msg) setPushStatus(msg, isOk);
        };
        navigator.serviceWorker.ready
          .then(function (reg) {
            if (!enable) {
              return reg.pushManager
                .getSubscription()
                .then(function (sub) {
                  var endpoint = sub ? sub.endpoint : null;
                  var unsub = sub ? sub.unsubscribe() : Promise.resolve();
                  return unsub.then(function () {
                    if (!endpoint) return null;
                    return sup
                      .from("push_subscriptions")
                      .delete()
                      .eq("endpoint", endpoint);
                  });
                })
                .then(function () {
                  setPushStatus("Telefon bildirimleri kapalı.", true);
                });
            }
            return sup
              .from("push_config")
              .select("public_key")
              .limit(1)
              .maybeSingle()
              .then(function (result) {
                var vapid =
                  result && result.data && result.data.public_key;
                if (!vapid) {
                  throw new Error(
                    "Bildirim anahtarı henüz ayarlanmamış. Yönetici Admin → Website → Telefon bildirimleri bölümünden VAPID anahtarı oluşturmalı."
                  );
                }
                return reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: base64UrlToBytes(vapid),
                });
              })
              .then(function (sub) {
                return sup
                  .from("push_subscriptions")
                  .upsert({
                    user_id: user.id,
                    endpoint: sub.endpoint,
                    p256dh: pushKeyToBase64(sub.getKey("p256dh")),
                    auth: pushKeyToBase64(sub.getKey("auth")),
                    user_agent: navigator.userAgent.slice(0, 200),
                  });
              })
              .then(function () {
                setPushStatus(
                  "Telefon bildirimleri açıldı — yeni bölüm yayınlanınca telefonuna bildirim gelir.",
                  true
                );
              });
          })
          .catch(function (error) {
            pushToggle.checked = false;
            done(
              (error && error.message) ||
                "Bildirim açılamadı — tekrar dene.",
              false
            );
          });
      });

      refreshPushState();
    }
    });
  });
})();
