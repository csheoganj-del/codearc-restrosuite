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
  //
  // Loop fix: previously sessionStorage kept the OLD version forever after
  // "Reload now", so every poll re-showed the banner. We now:
  //  1) Compare remote version to what THIS page is running (not only lastSeen)
  //  2) Mark the remote version as applied when user reloads
  //  3) Only show SW-waiting banner once per waiting worker lifecycle
  // ---------------------------------------------------------------------
  var RELOAD_GUARD_KEY = "__rsSwReloadedOnce";
  var WEB_VER_SEEN_KEY = "__rsWebVerSeen";
  var WEB_VER_APPLIED_KEY = "__rsWebVerApplied";
  var BANNER_SHOWN_KEY = "__rsUpdateBannerShown";

  function pageRunningVersion() {
    try {
      if (window.__RESTROSUITE_ASSET_VERSION__) {
        return String(window.__RESTROSUITE_ASSET_VERSION__).trim();
      }
    } catch (_) {}
    try {
      var m = document.querySelector('meta[name="rs-app-version"]');
      if (m && m.content) return String(m.content).trim();
    } catch (_) {}
    try {
      var u = new URL(location.href);
      var appv = u.searchParams.get("appv");
      if (appv) return String(appv).trim();
    } catch (_) {}
    return "";
  }

  function versionRank(v) {
    var m = String(v || "").match(/v(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  /** True when remote is newer than the version baked into this page. */
  function remoteIsNewer(remoteVer, pageVer) {
    var r = String(remoteVer || "").trim();
    var p = String(pageVer || "").trim();
    if (!r) return false;
    if (!p) return true;
    if (r === p) return false;
    var rr = versionRank(r);
    var pr = versionRank(p);
    if (rr && pr) return rr > pr;
    return r !== p;
  }

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

  function markVersionApplied(ver) {
    if (!ver) return;
    try {
      sessionStorage.setItem(WEB_VER_SEEN_KEY, String(ver));
      sessionStorage.setItem(WEB_VER_APPLIED_KEY, String(ver));
      sessionStorage.removeItem(BANNER_SHOWN_KEY);
      sessionStorage.removeItem(RELOAD_GUARD_KEY);
    } catch (_) {}
  }

  function hardReload(appliedVer) {
    markVersionApplied(appliedVer || pageRunningVersion());
    // Prefer controller swap when a waiting worker exists
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.waiting) {
            try {
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            } catch (_) {}
          }
          // Cache-bust so we don't land on a stale HTML shell
          var url = new URL(location.href);
          url.searchParams.set("_rs_reload", String(Date.now()));
          location.replace(url.pathname + url.search + url.hash);
        }).catch(function () {
          location.reload();
        });
        return;
      }
    } catch (_) {}
    location.reload();
  }

  function showUpdateBanner(opts) {
    opts = opts || {};
    if (document.getElementById("rs-update-banner")) return;

    // Don't nag again for the same applied version in this tab session
    try {
      var applied = sessionStorage.getItem(WEB_VER_APPLIED_KEY) || "";
      var remote = opts.remoteVersion || "";
      if (remote && applied && String(remote) === String(applied)) return;
      if (opts.onceKey) {
        if (sessionStorage.getItem(BANNER_SHOWN_KEY) === opts.onceKey) return;
        sessionStorage.setItem(BANNER_SHOWN_KEY, opts.onceKey);
      }
    } catch (_) {}

    injectBannerStyles();
    var bar = document.createElement("div");
    bar.id = "rs-update-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span><i class="fa-solid fa-rotate" style="margin-right:8px"></i>A new version of RestroSuite is available</span>' +
      '<button type="button" id="rs-update-reload-btn">Reload now</button>';
    document.body.appendChild(bar);
    document.getElementById("rs-update-reload-btn").addEventListener("click", function () {
      hardReload(opts.remoteVersion || pageRunningVersion());
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

  // On load: if this page already matches applied/remote, clear reload guard
  try {
    var running = pageRunningVersion();
    if (running) {
      var applied0 = sessionStorage.getItem(WEB_VER_APPLIED_KEY) || "";
      if (applied0 && versionRank(running) >= versionRank(applied0)) {
        sessionStorage.removeItem(RELOAD_GUARD_KEY);
        sessionStorage.removeItem(BANNER_SHOWN_KEY);
      }
      // Sync "seen" to what this document is actually running
      sessionStorage.setItem(WEB_VER_SEEN_KEY, running);
    }
  } catch (_) {}

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").then(function (registration) {
      if (!registration) return;

      // Case 1: a worker is already waiting to activate when we register
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner({ onceKey: "sw-waiting", remoteVersion: pageRunningVersion() });
      }

      // Case 2: a new worker starts installing while this tab is open.
      registration.addEventListener("updatefound", function () {
        var installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", function () {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner({ onceKey: "sw-installed-" + Date.now().toString(36).slice(-4) });
          }
        });
      });

      // Periodically ask the browser to check for a fresh service-worker.js
      setInterval(function () {
        registration.update().catch(function () {});
      }, 15 * 60 * 1000);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          registration.update().catch(function () {});
        }
      });

      // Poll app-update.json — only banner if REMOTE is newer than THIS page
      var lastSeenWebVersion = null;
      try {
        lastSeenWebVersion = sessionStorage.getItem(WEB_VER_SEEN_KEY);
      } catch (_) {}

      function pollAppUpdateJson() {
        fetch("/app-update.json?v=" + Date.now(), { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (info) {
            if (!info || !info.version) return;
            var remote = String(info.version);
            var pageVer = pageRunningVersion();

            // First observation: remember, do not nag if page already matches
            if (lastSeenWebVersion == null) {
              lastSeenWebVersion = remote;
              try { sessionStorage.setItem(WEB_VER_SEEN_KEY, remote); } catch (_) {}
              if (remoteIsNewer(remote, pageVer)) {
                showUpdateBanner({ remoteVersion: remote, onceKey: "ver-" + remote });
              } else {
                markVersionApplied(remote);
              }
              return;
            }

            // Page already on remote (or newer) — silence + sync storage
            if (!remoteIsNewer(remote, pageVer)) {
              lastSeenWebVersion = remote;
              markVersionApplied(remote);
              return;
            }

            // Remote actually newer than what this tab is running
            if (remote !== lastSeenWebVersion || remoteIsNewer(remote, pageVer)) {
              lastSeenWebVersion = remote;
              try { sessionStorage.setItem(WEB_VER_SEEN_KEY, remote); } catch (_) {}
              showUpdateBanner({ remoteVersion: remote, onceKey: "ver-" + remote });
            }
          })
          .catch(function () {});
      }
      setTimeout(pollAppUpdateJson, 8000);
      setInterval(pollAppUpdateJson, 10 * 60 * 1000);
    }).catch(function (error) {
      console.warn("PWA registration failed:", error);
    });

    // Case 3: controller changed (new SW claimed). Reload once only — never loop.
    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
      reloading = true;
      try {
        sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      } catch (_) {}
      // Soft path: show banner; user can reload. Auto-reload only once.
      showUpdateBanner({ onceKey: "controllerchange" });
      setTimeout(function () {
        hardReload(pageRunningVersion());
      }, 900);
    });
  });
})();
