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
  // Loop fix (2026-08): continuous "Reload now" was caused by:
  //  1) controllerchange auto-reloaded, then hardReload cleared RELOAD_GUARD,
  //     so the next claim re-triggered the same path forever
  //  2) hardReload both postMessage(SKIP_WAITING) AND location.replace, while
  //     controllerchange also reloaded → double/triple reload
  //  3) login / non-dashboard pages had no page version, so remoteIsNewer()
  //     always returned true and re-showed the banner after every poll
  //  4) updatefound onceKey used Date.now() so it never de-duplicated
  // ---------------------------------------------------------------------
  var RELOAD_GUARD_KEY = "__rsSwReloadedOnce";
  var WEB_VER_SEEN_KEY = "__rsWebVerSeen";
  var WEB_VER_APPLIED_KEY = "__rsWebVerApplied";
  var BANNER_SHOWN_KEY = "__rsUpdateBannerShown";
  var PENDING_SKIP_KEY = "__rsSwPendingSkip";

  // In-page flags (survive only this document lifecycle)
  var reloading = false;
  var bannerShownThisPage = false;

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
    } catch (_) {
      return "";
    }
  }

  function storageSet(key, val) {
    try {
      sessionStorage.setItem(key, val);
    } catch (_) {}
    try {
      localStorage.setItem(key, val);
    } catch (_) {}
  }

  function storageRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

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

  /**
   * True when remote is newer than the version baked into this page.
   * If the page has no version stamp, fall back to last applied / seen —
   * never treat "unknown page version" as always-outdated (that caused
   * endless banners on login.html and other unstamped pages).
   */
  function remoteIsNewer(remoteVer, pageVer) {
    var r = String(remoteVer || "").trim();
    var p = String(pageVer || "").trim();
    if (!r) return false;

    if (p) {
      if (r === p) return false;
      var rr = versionRank(r);
      var pr = versionRank(p);
      if (rr && pr) return rr > pr;
      return r !== p;
    }

    // No page stamp: only nag if remote is newer than last applied/seen
    var applied = storageGet(WEB_VER_APPLIED_KEY);
    var seen = storageGet(WEB_VER_SEEN_KEY);
    var baseline = applied || seen || "";
    if (!baseline) return true; // first ever observation — allow one prompt
    if (r === baseline) return false;
    var rRank = versionRank(r);
    var bRank = versionRank(baseline);
    if (rRank && bRank) return rRank > bRank;
    return r !== baseline;
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
    var v = String(ver || "").trim();
    if (!v) {
      // Still record a stable "user already reloaded" marker so empty-version
      // pages (login) stop re-prompting for the same remote poll result.
      v = storageGet(WEB_VER_SEEN_KEY) || "reloaded";
    }
    storageSet(WEB_VER_SEEN_KEY, v);
    storageSet(WEB_VER_APPLIED_KEY, v);
    // Do NOT clear RELOAD_GUARD here — that was half the reload loop.
    try {
      sessionStorage.removeItem(BANNER_SHOWN_KEY);
    } catch (_) {}
  }

  /**
   * Activate waiting SW (if any) and reload the page once.
   * Guard is set FIRST so controllerchange cannot start a second reload.
   */
  function hardReload(appliedVer) {
    if (reloading) return;
    reloading = true;

    markVersionApplied(appliedVer || pageRunningVersion());

    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      sessionStorage.setItem(PENDING_SKIP_KEY, "1");
    } catch (_) {}

    function doReplace() {
      try {
        var url = new URL(location.href);
        // Drop previous bust token so we don't stack _rs_reload forever
        url.searchParams.delete("_rs_reload");
        url.searchParams.set("_rs_reload", String(Date.now()));
        location.replace(url.pathname + url.search + url.hash);
      } catch (_) {
        location.reload();
      }
    }

    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.waiting) {
            try {
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            } catch (_) {}
            // Give the new worker a moment to claim, then navigate once.
            // controllerchange will NOT reload again (guard is set).
            setTimeout(doReplace, 400);
            return;
          }
          doReplace();
        }).catch(function () {
          doReplace();
        });
        return;
      }
    } catch (_) {}
    doReplace();
  }

  function versionAlreadyApplied(remote) {
    if (!remote) return false;
    var applied = storageGet(WEB_VER_APPLIED_KEY);
    if (applied && String(applied) === String(remote)) return true;
    // Major match: v234-... applied covers remote v234-...
    var aRank = versionRank(applied);
    var rRank = versionRank(remote);
    if (aRank && rRank && aRank >= rRank) return true;
    return false;
  }

  function showUpdateBanner(opts) {
    opts = opts || {};
    if (bannerShownThisPage) return;
    if (document.getElementById("rs-update-banner")) return;
    if (reloading) return;
    // Never nag while a reload is already in flight
    try {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") return;
    } catch (_) {}

    var remote = opts.remoteVersion || "";
    if (remote && versionAlreadyApplied(remote)) return;

    // Don't nag again for the same onceKey in this tab session
    try {
      if (opts.onceKey) {
        if (sessionStorage.getItem(BANNER_SHOWN_KEY) === opts.onceKey) return;
        sessionStorage.setItem(BANNER_SHOWN_KEY, opts.onceKey);
      }
    } catch (_) {}

    bannerShownThisPage = true;
    injectBannerStyles();
    var bar = document.createElement("div");
    bar.id = "rs-update-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span><i class="fa-solid fa-rotate" style="margin-right:8px"></i>A new version of RestroSuite is available</span>' +
      '<button type="button" id="rs-update-reload-btn">Reload now</button>';
    document.body.appendChild(bar);
    document.getElementById("rs-update-reload-btn").addEventListener("click", function () {
      hardReload(opts.remoteVersion || pageRunningVersion() || storageGet(WEB_VER_SEEN_KEY));
    });
  }

  // ── Install prompt (Add to Home Screen) ──────────────────────────────
  // Super-Admin platform console is not an outlet POS — skip install nag there.
  function isSuperAdminPage() {
    try {
      if (document.documentElement.classList.contains("rs-role-superadmin")) return true;
      if (document.body && document.body.classList.contains("rs-role-superadmin")) return true;
      var role =
        (window.RS_API && RS_API.session && RS_API.session() && RS_API.session().role) ||
        sessionStorage.getItem("logged_in_role") ||
        "";
      role = String(role).toLowerCase();
      return role === "superadmin" || role === "super_admin" || role === "brand_admin";
    } catch (_) {
      return false;
    }
  }

  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredInstall = e;
    if (isSuperAdminPage()) return;
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

  // On load: sync version state. Clear one-shot reload guard after a successful load
  // so a *future* real update can still prompt — but only after a short quiet period
  // so we don't immediately re-enter the loop if the SW claims again.
  try {
    var running = pageRunningVersion();
    if (running) {
      storageSet(WEB_VER_SEEN_KEY, running);
      var applied0 = storageGet(WEB_VER_APPLIED_KEY);
      if (!applied0 || versionRank(running) >= versionRank(applied0)) {
        storageSet(WEB_VER_APPLIED_KEY, running);
      }
    }
    // Clear reload guard after page has stably loaded (not mid-loop)
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") {
      setTimeout(function () {
        try {
          sessionStorage.removeItem(RELOAD_GUARD_KEY);
          sessionStorage.removeItem(PENDING_SKIP_KEY);
        } catch (_) {}
      }, 5000);
    }
  } catch (_) {}

  // Strip _rs_reload from the visible URL after load (keep history clean)
  try {
    var cleanUrl = new URL(location.href);
    if (cleanUrl.searchParams.has("_rs_reload")) {
      cleanUrl.searchParams.delete("_rs_reload");
      history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }
  } catch (_) {}

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").then(function (registration) {
      if (!registration) return;

      // Case 1: a worker is already waiting — prompt once (do not auto-reload)
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner({ onceKey: "sw-waiting", remoteVersion: pageRunningVersion() || storageGet(WEB_VER_SEEN_KEY) });
      }

      // Case 2: a new worker starts installing while this tab is open.
      registration.addEventListener("updatefound", function () {
        var installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", function () {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            // Stable onceKey — NOT Date.now() (that bypassed de-dupe every time)
            showUpdateBanner({ onceKey: "sw-installed" });
          }
        });
      });

      // Periodically ask the browser to check for a fresh service-worker.js
      setInterval(function () {
        if (document.visibilityState === "visible") {
          registration.update().catch(function () {});
        }
      }, 15 * 60 * 1000);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
          registration.update().catch(function () {});
        }
      });

      // Poll app-update.json — only banner if REMOTE is newer than THIS page
      var lastSeenWebVersion = null;
      try {
        lastSeenWebVersion = storageGet(WEB_VER_SEEN_KEY) || null;
      } catch (_) {}

      function pollAppUpdateJson() {
        if (reloading) return;
        fetch("/app-update.json?v=" + Date.now(), { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (info) {
            if (!info || !info.version) return;
            var remote = String(info.version);
            var pageVer = pageRunningVersion();

            // Already applied this remote (or same major) — stay silent
            if (versionAlreadyApplied(remote)) {
              lastSeenWebVersion = remote;
              storageSet(WEB_VER_SEEN_KEY, remote);
              return;
            }

            // First observation: remember, do not nag if page already matches
            if (lastSeenWebVersion == null || lastSeenWebVersion === "") {
              lastSeenWebVersion = remote;
              storageSet(WEB_VER_SEEN_KEY, remote);
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
              markVersionApplied(pageVer || remote);
              return;
            }

            // Remote actually newer than what this tab is running
            if (remote !== lastSeenWebVersion || remoteIsNewer(remote, pageVer)) {
              lastSeenWebVersion = remote;
              storageSet(WEB_VER_SEEN_KEY, remote);
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

    // Case 3: controller changed (new SW claimed).
    // Only auto-reload if WE requested skipWaiting (PENDING_SKIP). Otherwise
    // just show the banner once — never loop-reload on every claim.
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;

      var pending = false;
      try {
        pending = sessionStorage.getItem(PENDING_SKIP_KEY) === "1";
      } catch (_) {}

      if (pending) {
        // User (or hardReload) already asked for activate — finish with one navigation.
        // Guard prevents any further controllerchange from stacking reloads.
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === "1" && reloading) return;
        reloading = true;
        try {
          sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
          sessionStorage.removeItem(PENDING_SKIP_KEY);
        } catch (_) {}
        // hardReload already schedules navigation when it posts SKIP_WAITING;
        // only navigate here if that path didn't (e.g. external skipWaiting).
        setTimeout(function () {
          if (document.getElementById("rs-update-banner")) return;
          try {
            var url = new URL(location.href);
            url.searchParams.delete("_rs_reload");
            url.searchParams.set("_rs_reload", String(Date.now()));
            location.replace(url.pathname + url.search + url.hash);
          } catch (_) {
            location.reload();
          }
        }, 200);
        return;
      }

      // SW claimed on its own (skipWaiting in install) — prompt once, do NOT auto-reload.
      // Auto-reload here is what caused the continuous popup loop.
      showUpdateBanner({ onceKey: "controllerchange" });
    });
  });
})();
