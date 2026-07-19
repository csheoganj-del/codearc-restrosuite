/**
 * config.js -- RestroSuite runtime configuration loader
 *
 * Loaded via <script src="/config.js"> BEFORE any inline scripts.
 * Sets window.__configReady (a Promise) that resolves once /api/config has
 * been fetched. dashboard.js awaits this promise before initialising -- this
 * replaces the deprecated synchronous XHR and keeps the main thread free.
 *
 * Android WebView can inject window.ENV_SUPABASE_URL / window.ENV_SUPABASE_ANON_KEY
 * directly -- those values take precedence and the fetch is skipped entirely.
 *
 * The old CONFIG object (used by android-app/assets/config.js) is also re-exported
 * here for backward compatibility with any existing references.
 */
(function () {
  'use strict';

  // Normalize a Supabase project URL: the app appends "/functions/v1/..." to it,
  // so trailing slashes or an accidental "/rest/v1" suffix must be stripped.
  function normalizeSupabaseUrl(value) {
    return String(value || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/(rest|auth|storage|functions)\/v1$/, '')
      .replace(/\/+$/, '');
  }

  function applyConfig(url, key, extra) {
    window.__SUPABASE_URL__    = url;
    window.__SUPABASE_ANON_KEY__ = key;
    window.CONFIG = Object.assign({
      supabase: { url: url, anonKey: key },
      functions: {
        tenantAccess: url + '/functions/v1/tenant-access',
        tenantPublic:  url + '/functions/v1/tenant-public',
      }
    }, extra || {});
  }

  // -- Android WebView path -----------------------------------------------------
  // Values injected by the native app before page load take precedence.
  if (window.ENV_SUPABASE_URL && window.ENV_SUPABASE_ANON_KEY) {
    var nativeUrl = normalizeSupabaseUrl(window.ENV_SUPABASE_URL);
    applyConfig(nativeUrl, window.ENV_SUPABASE_ANON_KEY);
    // Resolve immediately -- no network fetch needed.
    window.__configReady = Promise.resolve();
    return;
  }

  // -- Offline fallback ----------------------------------------------------------
  // /api/config is a serverless function, not a static file, so the service
  // worker never intercepts or caches it (see service-worker.js -- it explicitly
  // skips /api/*). Without this, going offline would always wipe the Supabase
  // URL/anon key and silently disable every feature that checks RS_API.configured,
  // even after a successful sign-in. We stash the last good response ourselves
  // and reuse it whenever the live fetch fails (offline, DNS hiccup, etc).
  var RUNTIME_CONFIG_CACHE_KEY = 'restrosuite_runtime_config_v1';

  function readCachedRuntimeConfig() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(RUNTIME_CONFIG_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeCachedRuntimeConfig(cfg) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(RUNTIME_CONFIG_CACHE_KEY, JSON.stringify(cfg));
      }
    } catch (e) {
      // Storage full or disabled -- non-fatal, just skip the offline cache.
    }
  }

  // -- Vercel / web path --------------------------------------------------------
  // Async fetch -- does NOT block the main thread. dashboard.js awaits
  // window.__configReady before using window.__SUPABASE_URL__ or window.CONFIG.
  window.__configReady = fetch('/api/config')
    .then(function (response) {
      if (!response.ok) {
        throw new Error('/api/config returned HTTP ' + response.status + '. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel environment variables.');
      }
      return response.json();
    })
    .then(function (cfg) {
      var url = normalizeSupabaseUrl(cfg.supabaseUrl);
      var key = cfg.supabaseAnonKey || '';
      applyConfig(url, key, {
        enableDemoTools:    cfg.enableDemoTools    || false,
        zeroCostLaunchMode: cfg.zeroCostLaunchMode || false,
      });
      // Remember this good config so we can survive the next offline load.
      writeCachedRuntimeConfig({
        supabaseUrl: url,
        supabaseAnonKey: key,
        enableDemoTools: cfg.enableDemoTools || false,
        zeroCostLaunchMode: cfg.zeroCostLaunchMode || false,
      });
    })
    .catch(function (err) {
      console.warn('[config.js] Live /api/config fetch failed, checking offline cache:', err.message);
      var cached = readCachedRuntimeConfig();
      if (cached && cached.supabaseUrl && cached.supabaseAnonKey) {
        console.info('[config.js] Using last known-good config (offline mode).');
        applyConfig(cached.supabaseUrl, cached.supabaseAnonKey, {
          enableDemoTools:    cached.enableDemoTools    || false,
          zeroCostLaunchMode: cached.zeroCostLaunchMode || false,
        });
        window.__OFFLINE_CONFIG__ = true;
        return;
      }
      // Public anon fallback (same project as production). Keeps login working when
      // a host (e.g. slim Vercel project / Cloudflare) has no SUPABASE_* env vars.
      // Anon key is designed to be public; RLS / Edge Functions enforce security.
      console.warn('[config.js] Using public production Supabase fallback.');
      applyConfig(
        'https://htkauiibuejetimfiavs.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk',
        { enableDemoTools: false, zeroCostLaunchMode: false }
      );
      writeCachedRuntimeConfig({
        supabaseUrl: 'https://htkauiibuejetimfiavs.supabase.co',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk',
        enableDemoTools: false,
        zeroCostLaunchMode: false,
      });
    });
})();
