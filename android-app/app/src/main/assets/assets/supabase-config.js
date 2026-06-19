/* ============================================================
   RestroSuite — Supabase configuration (Doppio backend)
   ------------------------------------------------------------
   This app talks to YOUR existing Edge Functions (tenant-access,
   tenant-data). It does NOT create tables. See SUPABASE_SETUP.md.

   TO GO LIVE:
   1. url = your bare Project URL (a /rest/v1 suffix is auto-stripped).
      anonKey = your "anon public" key (Settings → API).
   2. CRITICAL — add the web address you open the app from to the
      ALLOWED_ORIGINS secret on your Edge Functions, e.g.:
        ALLOWED_ORIGINS=https://your-app.com,https://<this-preview-origin>
      Without it the browser blocks every call (CORS → "Failed to fetch").
   3. Sign in with your Outlet ID (slug) + username + password.

   Leave blank to run in LOCAL demo mode (data persists in the browser).
   ============================================================ */

// Credentials are intentionally blank here.
// They are served at runtime by /api/config (Vercel serverless function)
// which reads SUPABASE_URL and SUPABASE_ANON_KEY from environment variables.
// rs-api.js fetches /api/config asynchronously on startup and populates
// window.__RS_RUNTIME_CONFIG before initialising the API client.
// To run locally: set SUPABASE_URL and SUPABASE_ANON_KEY in .env.local
// and start with `vercel dev`.  Never hardcode credentials here.
window.RS_SUPABASE = {
  url:     "",   // populated at runtime from /api/config
  anonKey: ""    // populated at runtime from /api/config
};
