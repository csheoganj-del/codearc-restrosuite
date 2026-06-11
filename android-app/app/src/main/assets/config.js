/**
 * config.js — Android WebView version
 *
 * The native Android wrapper injects window.ENV_SUPABASE_URL and
 * window.ENV_SUPABASE_ANON_KEY before the WebView loads any page.
 * See MainActivity.java / WebViewActivity.java where evaluateJavascript() is called.
 *
 * IMPORTANT: Credentials must NEVER be hardcoded here.
 * Store them in the Android app's BuildConfig or encrypted SharedPreferences,
 * then inject via evaluateJavascript("window.ENV_SUPABASE_URL='...'") before loadUrl().
 */
(function () {
  'use strict';

  var url = window.ENV_SUPABASE_URL || '';
  var key = window.ENV_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    console.error('[config.js] ENV_SUPABASE_URL or ENV_SUPABASE_ANON_KEY not injected by native wrapper.');
  }

  window.__SUPABASE_URL__      = url;
  window.__SUPABASE_ANON_KEY__ = key;

  window.CONFIG = {
    supabase: { url: url, anonKey: key },
    functions: {
      tenantAccess: url + '/functions/v1/tenant-access',
      tenantPublic: url + '/functions/v1/tenant-public',
    }
  };
})();
