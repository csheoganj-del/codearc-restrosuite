/**
 * config.js — RestoSuite runtime configuration loader
 *
 * Loaded via <script src="/config.js"> BEFORE any inline scripts.
 * Performs a synchronous XHR to /api/config so that window.__SUPABASE_URL__
 * and window.__SUPABASE_ANON_KEY__ are set before the rest of the page runs.
 *
 * Android WebView can inject window.ENV_SUPABASE_URL / window.ENV_SUPABASE_ANON_KEY
 * directly — those values take precedence over the /api/config fetch.
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

  // ── Android WebView path ─────────────────────────────────────────────────────
  // Values injected by the native app before page load take precedence.
  if (window.ENV_SUPABASE_URL && window.ENV_SUPABASE_ANON_KEY) {
    var nativeUrl = normalizeSupabaseUrl(window.ENV_SUPABASE_URL);
    window.__SUPABASE_URL__ = nativeUrl;
    window.__SUPABASE_ANON_KEY__ = window.ENV_SUPABASE_ANON_KEY;
    window.CONFIG = {
      supabase: { url: nativeUrl, anonKey: window.ENV_SUPABASE_ANON_KEY },
      functions: {
        tenantAccess: nativeUrl + '/functions/v1/tenant-access',
        tenantPublic: nativeUrl + '/functions/v1/tenant-public',
      }
    };
    return;
  }

  // ── Vercel / web path ────────────────────────────────────────────────────────
  // Synchronous XHR so values are available before DOMContentLoaded.
  var url = '';
  var key = '';

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/config', false); // synchronous — intentional
    xhr.send(null);

    if (xhr.status === 200) {
      var cfg = JSON.parse(xhr.responseText);
      url = normalizeSupabaseUrl(cfg.supabaseUrl);
      key = cfg.supabaseAnonKey || '';
    } else {
      console.error('[config.js] /api/config returned HTTP ' + xhr.status + '. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel environment variables.');
      window.__CONFIG_ERROR__ = 'Config endpoint returned HTTP ' + xhr.status;
    }
  } catch (err) {
    console.error('[config.js] Failed to load runtime config:', err.message);
    window.__CONFIG_ERROR__ = err.message;
  }

  window.__SUPABASE_URL__   = url;
  window.__SUPABASE_ANON_KEY__ = key;

  // Backward-compatible CONFIG object
  window.CONFIG = {
    supabase: { url: url, anonKey: key },
    functions: {
      tenantAccess: url + '/functions/v1/tenant-access',
      tenantPublic: url + '/functions/v1/tenant-public',
    }
  };
})();
