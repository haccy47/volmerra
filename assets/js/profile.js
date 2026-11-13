/* ============================================================
   VOLMERRA — Reader profile page
   ------------------------------------------------------------
   Başka bir okuyucunun herkese açık profilini gösterir:
   görünen ad, avatar, admin etiketi, katılım tarihi ve bio.
   E-posta gibi özel bilgi ASLA gösterilmez — veri sunucu
   tarafında public_profile() RPC'si ile filtrelenir.
   ============================================================ */

(function () {
  "use strict";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function showError(message) {
    var card = document.getElementById("reader-profile");
    var error = document.getElementById("profile-error");
    if (card) card.hidden = true;
    if (error) {
      error.hidden = false;
      var text = document.getElementById("profile-error-text");
      if (text) text.textContent = message;
    }
  }

  function render(profile) {
    var card = document.getElementById("reader-profile");
    if (!card) return;

    var avatarMount = document.getElementById("profile-avatar");
    avatarMount.innerHTML = "";
    if (profile.avatar) {
      var img = document.createElement("img");
      img.src = profile.avatar;
      img.alt = "";
      avatarMount.appendChild(img);
    } else {
      var initial = (profile.displayName || "?").trim().charAt(0).toUpperCase();
      avatarMount.appendChild(el("span", null, initial));
    }

    var name = document.getElementById("profile-name");
    if (name) name.textContent = profile.displayName || "Reader";

    var badge = document.getElementById("profile-badge");
    if (badge) badge.hidden = !profile.isAdmin;

    var joined = document.getElementById("profile-joined");
    if (joined && profile.joinedAt) {
      joined.textContent =
        "Volmerra'ya katıldı — " +
        new Date(profile.joinedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
    }

    var bio = document.getElementById("profile-bio");
    if (bio) {
      bio.textContent = profile.bio
        ? profile.bio
        : "Bu okuyucu henüz kendini tanıtmış değil.";
    }

    card.hidden = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    if (!id) {
      showError("Profil bulunamadı.");
      return;
    }

    /* Profil gerçek backend'den gelir — yüklenmesini bekleriz. */
    window.VolmerraAuth.whenReady(function () {
      window.VolmerraAuth.profileOf(id)
        .then(function (profile) {
          if (!profile) {
            showError("Bu profil bulunamadı veya kaldırılmış.");
            return;
          }
          render(profile);
        })
        .catch(function () {
          showError("Profil yüklenirken bir sorun oldu. Sayfayı yenileyip tekrar dene.");
        });
    });
  });
})();
