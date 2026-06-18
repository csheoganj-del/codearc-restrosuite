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

window.RS_SUPABASE = {
  url:     "https://htkauiibuejetimfiavs.supabase.co/rest/v1/",   // your Supabase Project URL (e.g. "https://abcdxyz.supabase.co")
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk"    // your Supabase anon public key
};
