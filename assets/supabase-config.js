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

(function() {
  const originalGetItem = localStorage.getItem || Storage.prototype.getItem;
  const originalSetItem = localStorage.setItem || Storage.prototype.setItem;
  const originalRemoveItem = localStorage.removeItem || Storage.prototype.removeItem;

  function getActiveTenantId() {
    try {
      // Check session storage first (fastest/most reliable if signed in)
      const tid = sessionStorage.getItem('rs_api:tid');
      if (tid) return tid;
      
      const sLocalStr = originalGetItem.call(localStorage, 'rs:session');
      if (sLocalStr) {
        const sLocal = JSON.parse(sLocalStr);
        if (sLocal && sLocal.tenant_id) return sLocal.tenant_id;
        if (sLocal && sLocal.user && sLocal.user.id) return sLocal.user.id;
      }
    } catch(e) {}
    return 'local-demo';
  }

  function scopeKey(key) {
    if (typeof key === 'string' && (key.startsWith('rs_') || key.startsWith('rs-')) && key !== 'rs:session' && key !== 'rs_last_tenant_id') {
      const tenantId = getActiveTenantId();
      return 'rs_t:' + tenantId + ':' + key;
    }
    return key;
  }

  localStorage.getItem = function(key) {
    const scoped = scopeKey(key);
    const val = originalGetItem.call(this, scoped);
    if (val !== null) return val;
    
    // Migration: if the scoped key doesn't exist, check the old un-scoped key
    if (scoped !== key) {
      const oldVal = originalGetItem.call(this, key);
      if (oldVal !== null) {
        originalSetItem.call(this, scoped, oldVal);
        originalRemoveItem.call(this, key);
        return oldVal;
      }
    }
    return null;
  };

  localStorage.setItem = function(key, value) {
    const scoped = scopeKey(key);
    originalSetItem.call(this, scoped, value);

    // If writing session, check for tenant change and perform cleanup
    if (key === 'rs:session' && value) {
      try {
        const sLocal = JSON.parse(value);
        const currentTenantId = (sLocal && sLocal.tenant_id) || (sLocal && sLocal.user && sLocal.user.id) || 'local-demo';
        const lastTenantId = originalGetItem.call(localStorage, 'rs_last_tenant_id');
        if (lastTenantId && currentTenantId && currentTenantId !== lastTenantId && currentTenantId !== 'local-demo' && lastTenantId !== 'local-demo') {
          const prefixToDelete = 'rs_t:' + lastTenantId + ':';
          const keysToDelete = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefixToDelete)) {
              keysToDelete.push(k);
            }
          }
          keysToDelete.forEach(k => originalRemoveItem.call(localStorage, k));
          console.log('[Security] Session transition cleanup: erased local cache of previous user session:', lastTenantId);
        }
        if (currentTenantId && currentTenantId !== 'local-demo') {
          originalSetItem.call(localStorage, 'rs_last_tenant_id', currentTenantId);
        }
      } catch(e) {}
    }
  };

  localStorage.removeItem = function(key) {
    const scoped = scopeKey(key);
    originalRemoveItem.call(this, scoped);
  };

  // Run startup clean up if tenant ID has changed
  try {
    const currentTenantId = getActiveTenantId();
    const lastTenantId = originalGetItem.call(localStorage, 'rs_last_tenant_id');
    if (lastTenantId && currentTenantId && currentTenantId !== lastTenantId && currentTenantId !== 'local-demo' && lastTenantId !== 'local-demo') {
      const prefixToDelete = 'rs_t:' + lastTenantId + ':';
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefixToDelete)) {
          keysToDelete.push(k);
        }
      }
      keysToDelete.forEach(k => originalRemoveItem.call(localStorage, k));
      console.log('[Security] Automatically erased local cache of previous user session:', lastTenantId);
    }
    if (currentTenantId && currentTenantId !== 'local-demo') {
      originalSetItem.call(localStorage, 'rs_last_tenant_id', currentTenantId);
    }
  } catch(e) {
    console.error('[Security] Tenant cleanup failed:', e);
  }
})();

window.RS_SUPABASE = {
  url:     "https://htkauiibuejetimfiavs.supabase.co/rest/v1/",   // your Supabase Project URL (e.g. "https://abcdxyz.supabase.co")
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk"    // your Supabase anon public key
};
