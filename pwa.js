(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  // Disable service worker on localhost/127.0.0.1 for local development
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return;
  }

  if (location.protocol !== "https:") {
    return;
  }

  // ---------------------------------------------------------------------
  // Update banner: self-contained (no dependency on dashboard-styles.css or
  // dashboard.js's toast()), so it works on every page that loads pwa.js.
  // Fixes: PWA/browser silently staying on an old version after a deploy --
  // the service worker already auto-activates new versions (skipWaiting +
  // clients.claim in service-worker.js), but nothing ever told an *already
  // open* tab that its in-memory JS/HTML is now stale. This does.
  // ---------------------------------------------------------------------
  var RELOAD_GUARD_KEY = "__rsSwReloadedOnce";

  function injectBannerStyles() {
    if (document.getElementById("rs-update-banner-style")) return;
    var style = document.createElement("style");
    style.id = "rs-update-banner-style";
    style.textContent =
      "#rs-update-banner{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
      "z-index:2147483000;display:flex;align-items:center;gap:12px;background:#141210;" +
      "color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);" +
      "font:600 13.5px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:92vw;" +
      "animation:rsUpdateBlink 1.1s ease-in-out infinite;}" +
      "@keyframes rsUpdateBlink{0%,100%{opacity:1}50%{opacity:.55}}" +
      "@media (prefers-reduced-motion: reduce){#rs-update-banner{animation:none}}" +
      "#rs-update-banner button{background:#FF4F00;color:#fff;border:none;border-radius:8px;" +
      "padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;}" +
      "#rs-update-banner button:active{transform:scale(.96);}";
    document.head.appendChild(style);
  }

  function showUpdateBanner() {
    if (document.getElementById("rs-update-banner")) return;
    injectBannerStyles();
    var bar = document.createElement("div");
    bar.id = "rs-update-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span><i class="fa-solid fa-rotate" style="margin-right:8px"></i>A new version of RestroSuite is available</span>' +
      '<button type="button" id="rs-update-reload-btn">Reload now</button>';
    document.body.appendChild(bar);
    document.getElementById("rs-update-reload-btn").addEventListener("click", function () {
      window.location.reload();
    });
  }

  // ── Install prompt (Add to Home Screen) ──────────────────────────────
  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstall = e;
    if (document.getElementById("rs-install-banner")) return;
    var bar = document.createElement("div");
    bar.id = "rs-install-banner";
    bar.setAttribute("role", "status");
    bar.style.cssText =
      "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147482999;" +
      "display:flex;align-items:center;gap:12px;background:#141210;color:#fff;padding:12px 16px;" +
      "border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 13.5px/1.3 system-ui,sans-serif;max-width:92vw";
    bar.innerHTML =
      '<span>Install RestroSuite for faster offline use</span>' +
      '<button type="button" id="rs-install-btn" style="background:#FF4F00;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">Install</button>' +
      '<button type="button" id="rs-install-dismiss" style="background:transparent;color:#ccc;border:none;font-size:18px;cursor:pointer;padding:0 4px" aria-label="Dismiss">×</button>';
    document.body.appendChild(bar);
    document.getElementById("rs-install-btn").onclick = function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.finally(function () {
        deferredInstall = null;
        try { bar.remove(); } catch (_) {}
      });
    };
    document.getElementById("rs-install-dismiss").onclick = function () {
      try { bar.remove(); } catch (_) {}
    };
  });

  // Offline status chip on dashboard pages
  function paintOfflineChip() {
    var id = "rs-offline-chip";
    var el = document.getElementById(id);
    if (navigator.onLine) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.cssText =
        "position:fixed;top:10px;right:10px;z-index:2147483001;background:#b45309;color:#fff;" +
        "padding:6px 12px;border-radius:999px;font:700 12px/1.2 system-ui,sans-serif;" +
        "box-shadow:0 4px 14px rgba(0,0,0,.25)";
      el.innerHTML = '<i class="fa-solid fa-wifi" style="margin-right:6px;opacity:.85"></i>Offline mode';
      document.body.appendChild(el);
    }
  }
  window.addEventListener("online", paintOfflineChip);
  window.addEventListener("offline", paintOfflineChip);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintOfflineChip);
  } else {
    paintOfflineChip();
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").then(function (registration) {
      if (!registration) return;

      // Case 1: a worker is already waiting to activate when we register
      // (e.g. tab was open across a deploy). Surface it immediately.
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }

      // Case 2: a new worker starts installing while this tab is open.
      registration.addEventListener("updatefound", function () {
        var installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", function () {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            // "installed" + an existing controller means this is an update,
            // not the very first install -- safe to prompt for reload.
            showUpdateBanner();
          }
        });
      });

      // Periodically ask the browser to check for a fresh service-worker.js
      // so long-lived open tabs (e.g. an all-day POS screen) still notice
      // new deploys without needing a manual refresh.
      setInterval(function () {
        registration.update().catch(function () {});
      }, 15 * 60 * 1000);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          registration.update().catch(function () {});
        }
      });

      // Extra safety: poll app-update.json so even if SW install is delayed
      // (aggressive cache, odd browser), the banner still appears after deploy.
      var lastSeenWebVersion = null;
      function pollAppUpdateJson() {
        fetch("/app-update.json?v=" + Date.now(), { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (info) {
            if (!info || !info.version) return;
            if (lastSeenWebVersion == null) {
              lastSeenWebVersion = String(info.version);
              try { sessionStorage.setItem("__rsWebVerSeen", lastSeenWebVersion); } catch (_) {}
              return;
            }
            if (String(info.version) !== String(lastSeenWebVersion)) {
              showUpdateBanner();
            }
          })
          .catch(function () {});
      }
      try {
        lastSeenWebVersion = sessionStorage.getItem("__rsWebVerSeen");
      } catch (_) {}
      setTimeout(pollAppUpdateJson, 8000);
      setInterval(pollAppUpdateJson, 10 * 60 * 1000);
    }).catch(function (error) {
      console.warn("PWA registration failed:", error);
    });

    // Case 3: the active controller actually changed (new SW claimed this
    // page via clients.claim()). The banner above is the polite path; this
    // is the guaranteed one -- reload once so the tab is never silently
    // left running stale JS against a newer cached shell.
    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      // Avoid a reload loop if something goes wrong repeatedly.
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
      reloading = true;
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      showUpdateBanner();
      setTimeout(function () {
        window.location.reload();
      }, 1200);
    });
  });
})();
