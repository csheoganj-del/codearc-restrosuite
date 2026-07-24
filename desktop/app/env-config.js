/**
 * Optional early bootstrap for native shells (Android offline, desktop).
 * Web/Vercel: usually empty — /api/config fills window.__SUPABASE_* later.
 * Safe to load on all platforms: only sets ENV_* when missing.
 */
(function () {
  'use strict';
  // Public project (anon key is designed for browser use; RLS/Edge enforce auth).
  if (!window.ENV_SUPABASE_URL) {
    window.ENV_SUPABASE_URL = 'https://htkauiibuejetimfiavs.supabase.co';
  }
  if (!window.ENV_SUPABASE_ANON_KEY) {
    window.ENV_SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk';
  }
})();
