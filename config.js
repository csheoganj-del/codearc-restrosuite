/**
 * config.js — RestroSuite runtime configuration loader
 *
 * Loaded via <script src="/config.js"> BEFORE any inline scripts.
 * Sets window.__configReady (a Promise) that resolves once /api/config has
 * been fetched. dashboard.js awaits this promise before initialising — this
 * replaces the deprecated synchronous XHR and keeps the main thread free.
 *
 * Android WebView can inject window.ENV_SUPABASE_URL / window.ENV_SUPABASE_ANON_KEY
 * directly — those values take precedence and the fetch is skipped entirely.
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

  // ── Android WebView path ─────────────────────────────────────────────────────
  // Values injected by the native app before page load take precedence.
  if (window.ENV_SUPABASE_URL && window.ENV_SUPABASE_ANON_KEY) {
    var nativeUrl = normalizeSupabaseUrl(window.ENV_SUPABASE_URL);
    applyConfig(nativeUrl, window.ENV_SUPABASE_ANON_KEY);
    // Resolve immediately — no network fetch needed.
    window.__configReady = Promise.resolve();
    return;
  }

  // ── Vercel / web path ────────────────────────────────────────────────────────
  // Async fetch — does NOT block the main thread. dashboard.js awaits
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
    })
    .catch(function (err) {
      console.error('[config.js] Failed to load runtime config:', err.message);
      window.__CONFIG_ERROR__ = err.message;
      // Apply empty config so the app can still render an error state
      // rather than hanging indefinitely.
      applyConfig('', '');
    });
})();
