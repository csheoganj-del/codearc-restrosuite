/* ============================================================
   RestroSuite -- Doppio backend API client
   Talks to the existing Supabase Edge Functions:
     • tenant-access  (login / register / session / recovery)
     • tenant-data    (tenant-scoped CRUD on doppio_* tables)
   Mirrors the original app's request contract exactly.
   ============================================================ */
(function(){
  'use strict';
  let cfg = window.RS_SUPABASE || { url:'', anonKey:'' };
  let enableDemoTools = false;
  let zeroCostLaunchMode = false;

  let REMOTE_BASE = '';
  let BASE = '';
  let ANON = '';
  let CONFIGURED = false;
  let supabaseClient = null;

  function recomputeConfig() {
    REMOTE_BASE = String(cfg.url || '').trim().replace(/\/+$/, '').replace(/\/(rest|functions)\/v1$/, '');
    BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : REMOTE_BASE;
    ANON = String(cfg.anonKey || '').trim();
    CONFIGURED = !!(REMOTE_BASE && ANON);

    // Sync to window globals so config.js consumers (realtime, supabaseClient) see the URL
    if (CONFIGURED && !window.__SUPABASE_URL__) {
      window.__SUPABASE_URL__ = REMOTE_BASE;
      window.__SUPABASE_ANON_KEY__ = ANON;
    }

    if (window.supabase && CONFIGURED && !supabaseClient) {
      supabaseClient = window.supabase.createClient(REMOTE_BASE, ANON);
    }

    if (window.RS_API) {
      window.RS_API.configured = CONFIGURED;
      window.RS_API.baseUrl = BASE;
      window.RS_API.supabaseClient = supabaseClient;
      window.RS_API.enableDemoTools = enableDemoTools;
      window.RS_API.zeroCostLaunchMode = zeroCostLaunchMode;
    }
  }

  function absorbRuntimeConfig() {
    if (!window.__SUPABASE_URL__ || !window.__SUPABASE_ANON_KEY__) return false;
    cfg = { url: window.__SUPABASE_URL__, anonKey: window.__SUPABASE_ANON_KEY__ };
    if (window.CONFIG) {
      enableDemoTools = !!window.CONFIG.enableDemoTools;
      zeroCostLaunchMode = !!window.CONFIG.zeroCostLaunchMode;
    } else {
      enableDemoTools = !!window.__enableDemoTools;
      zeroCostLaunchMode = !!window.__zeroCostLaunchMode;
    }
    recomputeConfig();
    return CONFIGURED;
  }

  // Run initial recompute synchronously
  recomputeConfig();

  // SECURITY: the demo/mock fallback below can fabricate local tenant sessions
  // when Supabase is misconfigured or unreachable. Demo mode must ONLY be
  // available on a local developer machine. Super-Admin is never mocked.
  const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // Android WebView injects window.ENV_SUPABASE_URL, so CONFIGURED is true there.
  // An explicit opt-in flag (window.RS_ALLOW_DEMO = true) can still enable demo
  // mode locally without spinning up Supabase.
  const ALLOW_DEMO = IS_LOCALHOST && (window.RS_ALLOW_DEMO === true);

  const SS = window.sessionStorage;
  const LS_SESS = window.localStorage; // ONLY for "remember me" restore blob + non-auth prefs
  const K = { token:'tenant_session_token', tid:'tenant_id', slug:'tenant_slug', name:'tenant_name',
              tabs:'allowed_tabs', user:'logged_in_user', role:'logged_in_role', display:'logged_in_display',
              uid:'tenant_user_id',
              persist:'rs_session_persistent',
              planCode:'rs_plan_code', planName:'rs_plan_name', subStatus:'rs_subscription_status',
              subEnd:'rs_subscription_period_end', planLimits:'rs_plan_limits' };
  const SESSION_KEYS = [K.token,K.tid,K.slug,K.name,K.tabs,K.user,K.role,K.display,K.uid,K.persist,
    K.planCode,K.planName,K.subStatus,K.subEnd,K.planLimits,'superadmin_admin_token'];
  // Single-blob remember key. Live auth keys must NEVER be flat localStorage entries
  // shared across tabs — that caused multi-outlet session swaps (tab A silently
  // became tab B when a second login wrote the same keys).
  const REMEMBER_BLOB_KEY = 'rs_remembered_session_v1';
  const IMP_ORIGIN_KEY = 'rs_superadmin_impersonation_origin';
  const IMP_TARGET_KEY = 'rs_superadmin_impersonation_target';

  if (!cfg.url || !cfg.anonKey) {
    const configSource = window.__configReady || Promise.resolve();
    configSource.then(() => {
      if (window.__SUPABASE_URL__ && window.__SUPABASE_ANON_KEY__) {
        absorbRuntimeConfig();
      } else if (!cfg.url || !cfg.anonKey) {
        fetch('/api/config')
          .then(r => r.ok ? r.json() : null)
          .then(res => {
            if (res && res.supabaseUrl && res.supabaseAnonKey) {
              cfg = { url: res.supabaseUrl, anonKey: res.supabaseAnonKey };
              enableDemoTools = res.enableDemoTools === true;
              zeroCostLaunchMode = res.zeroCostLaunchMode === true;
              recomputeConfig();
              // Sync to window globals so config.js consumers (realtime, supabaseClient) see the URL
              if (!window.__SUPABASE_URL__) {
                window.__SUPABASE_URL__ = cfg.url;
                window.__SUPABASE_ANON_KEY__ = cfg.anonKey;
              }
            }
          })
          .catch(e => console.warn('[doppio-api] Async /api/config failed:', e.message));
      }
    });
  }

  // Active session is ALWAYS tab-scoped (sessionStorage only).
  // localStorage holds at most one opaque "remember me" blob used to hydrate a
  // brand-new tab that has no session yet — never the live auth keys.
  function purgeLegacyFlatSessionKeys(){
    SESSION_KEYS.forEach(k => {
      try { LS_SESS.removeItem(k); } catch (_) {}
    });
  }
  function ssGet(k){ return SS.getItem(k); }
  function rawLocalGet(key) {
    try {
      return Storage.prototype.getItem.call(localStorage, key);
    } catch (_) {
      return null;
    }
  }
  function rawLocalSet(key, value) {
    try {
      Storage.prototype.setItem.call(localStorage, key, value);
    } catch (_) {}
  }
  function rawLocalRemove(key) {
    try {
      Storage.prototype.removeItem.call(localStorage, key);
    } catch (_) {}
  }
  /** Read remember blob even if an older build tenant-scoped the key. */
  function readRememberBlobRaw() {
    try {
      // Patched localStorage (after GLOBAL_UNSCOPED fix) or direct
      let raw = null;
      try { raw = LS_SESS.getItem(REMEMBER_BLOB_KEY); } catch (_) {}
      if (!raw) raw = rawLocalGet(REMEMBER_BLOB_KEY);
      if (raw) return raw;
      // Scan physical keys for pre-fix tenant-scoped copies
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === REMEMBER_BLOB_KEY || k.indexOf(':' + REMEMBER_BLOB_KEY) !== -1 || k.endsWith(REMEMBER_BLOB_KEY)) {
          const v = rawLocalGet(k);
          if (v) {
            // Promote to the global unscoped key for next cold start
            rawLocalSet(REMEMBER_BLOB_KEY, v);
            if (k !== REMEMBER_BLOB_KEY) rawLocalRemove(k);
            return v;
          }
        }
      }
    } catch (_) {}
    return null;
  }
  function writeRememberBlobFromSession(){
    try {
      const blob = {};
      SESSION_KEYS.forEach(k => {
        const value = SS.getItem(k);
        if (value !== null) blob[k] = value;
      });
      if (!blob[K.token]) {
        try { LS_SESS.removeItem(REMEMBER_BLOB_KEY); } catch (_) {}
        rawLocalRemove(REMEMBER_BLOB_KEY);
        return;
      }
      const json = JSON.stringify(blob);
      // Write both ways so monkey-patched + raw storage stay consistent
      try { LS_SESS.setItem(REMEMBER_BLOB_KEY, json); } catch (_) {}
      rawLocalSet(REMEMBER_BLOB_KEY, json);
    } catch (_) {}
  }
  /**
   * Hydrate sessionStorage from the keep-me-signed-in / offline blob.
   * @param {{ force?: boolean }} [opts] force=true used by "Continue offline"
   *   after an intentional Sign out is NOT allowed unless a blob still exists
   *   (normally Sign out clears the blob). force does not re-enable auto-jump.
   */
  function hydrateRememberedSessionOnce(opts){
    if (SS.getItem(K.token)) return true;
    const force = !!(opts && opts.force);
    // After intentional Sign out, block silent hydrate (prevents instant re-login).
    // "Continue offline" can force-read only if a blob was kept (should be rare).
    if (!force && wasExplicitLogout()) return false;
    try {
      // Prefer the new blob; fall back once to legacy flat keys then migrate.
      let blob = null;
      const raw = readRememberBlobRaw();
      if (raw) {
        blob = JSON.parse(raw);
      } else {
        // Legacy flat localStorage keys (pre-blob era)
        const legacyTok = rawLocalGet(K.token) || (function () {
          try { return LS_SESS.getItem(K.token); } catch (_) { return null; }
        })();
        if (legacyTok) {
          blob = {};
          SESSION_KEYS.forEach(k => {
            let value = null;
            try { value = LS_SESS.getItem(k); } catch (_) {}
            if (value == null) value = rawLocalGet(k);
            if (value !== null) blob[k] = value;
          });
        }
      }
      if (!blob || typeof blob !== 'object' || !blob[K.token]) return false;
      SESSION_KEYS.forEach(k => {
        if (blob[k] != null && SS.getItem(k) === null) SS.setItem(k, String(blob[k]));
      });
      // Re-save as global blob and strip shared flat keys so other open tabs cannot
      // accidentally read a swapped identity from localStorage.
      writeRememberBlobFromSession();
      purgeLegacyFlatSessionKeys();
      return true;
    } catch (_) {
      return false;
    }
  }
  function restorePersistentSessionToTab(){
    hydrateRememberedSessionOnce();
  }
  /** True when a keep-me-signed-in blob exists on this device (offline-capable). */
  function hasRememberBlob(){
    try {
      const raw = readRememberBlobRaw();
      if (!raw) return false;
      const blob = JSON.parse(raw);
      return !!(blob && blob[K.token]);
    } catch (_) {
      return false;
    }
  }
  function ssSet(k, v, persist){
    SS.setItem(k, v);
    // Never mirror live keys into localStorage. Remember-me is handled as a
    // single blob at the end of storeSession / logout.
    if (!persist) {
      try { LS_SESS.removeItem(k); } catch (_) {}
    }
  }
  const EXPLICIT_LOGOUT_KEY = 'rs_explicit_logout_v1';
  function markExplicitLogout(){
    try {
      // Always unscoped — never tenant-prefix (blocks resume incorrectly).
      rawLocalSet(EXPLICIT_LOGOUT_KEY, String(Date.now()));
      try { LS_SESS.setItem(EXPLICIT_LOGOUT_KEY, String(Date.now())); } catch (_) {}
    } catch (_) {}
  }
  function clearExplicitLogout(){
    try { LS_SESS.removeItem(EXPLICIT_LOGOUT_KEY); } catch (_) {}
    rawLocalRemove(EXPLICIT_LOGOUT_KEY);
    // Wipe any legacy tenant-scoped copies (rs_t:…:rs_explicit_logout_v1)
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === EXPLICIT_LOGOUT_KEY || k.indexOf(':' + EXPLICIT_LOGOUT_KEY) !== -1 || k.endsWith(EXPLICIT_LOGOUT_KEY)) {
          doomed.push(k);
        }
      }
      doomed.forEach((k) => rawLocalRemove(k));
    } catch (_) {}
  }
  function wasExplicitLogout(){
    try {
      // If a keep-me-signed-in blob exists, a leftover logout flag is stale
      // (often left by older tenant-scoped keys after a successful login).
      if (hasRememberBlob()) {
        clearExplicitLogout();
        return false;
      }
      let v = rawLocalGet(EXPLICIT_LOGOUT_KEY);
      if (!v) {
        try { v = LS_SESS.getItem(EXPLICIT_LOGOUT_KEY); } catch (_) {}
      }
      if (!v) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k === EXPLICIT_LOGOUT_KEY || k.endsWith(EXPLICIT_LOGOUT_KEY))) {
              v = rawLocalGet(k);
              if (v) break;
            }
          }
        } catch (_) {}
      }
      return !!v;
    } catch (_) {
      return false;
    }
  }
  function clearAllRememberBlobs(){
    try { LS_SESS.removeItem(REMEMBER_BLOB_KEY); } catch (_) {}
    rawLocalRemove(REMEMBER_BLOB_KEY);
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k === REMEMBER_BLOB_KEY ||
          k.indexOf(':' + REMEMBER_BLOB_KEY) !== -1 ||
          k.endsWith(REMEMBER_BLOB_KEY) ||
          k === 'rs:session' ||
          k.indexOf(':rs:session') !== -1 ||
          k.endsWith('rs:session')
        ) doomed.push(k);
      }
      doomed.forEach((k) => rawLocalRemove(k));
    } catch (_) {}
    try { LS_SESS.removeItem('rs:session'); } catch (_) {}
    rawLocalRemove('rs:session');
  }
  /**
   * @param {{ intentional?: boolean, clearRemember?: boolean }} [opts]
   * intentional (default true) = user clicked Sign out → wipe keep-me-signed-in + block auto-resume.
   * intentional false = cloud rejected token → clear live tab only by default.
   * clearRemember true = also wipe offline resume (use for revoke / suspended / password reset).
   */
  function ssClear(opts){
    const intentional = !(opts && opts.intentional === false);
    const wipeRemember = intentional || !!(opts && opts.clearRemember);
    SESSION_KEYS.forEach(k => { SS.removeItem(k); });
    purgeLegacyFlatSessionKeys();
    if (wipeRemember) {
      clearAllRememberBlobs();
      if (intentional) markExplicitLogout();
      else clearExplicitLogout();
    } else {
      // Soft expire: keep keep-me-signed-in for offline POS
      clearExplicitLogout();
    }
    SS.removeItem(IMP_ORIGIN_KEY);
    SS.removeItem(IMP_TARGET_KEY);
  }
  function clearActiveSession(){
    SESSION_KEYS.forEach(k => { SS.removeItem(k); });
    purgeLegacyFlatSessionKeys();
  }
  function readSessionSnapshot(){
    const snapshot = {};
    SESSION_KEYS.forEach(k => {
      if (SS.getItem(k) !== null) snapshot[k] = { storage:'session', value:SS.getItem(k) };
    });
    return snapshot;
  }
  function restoreSessionSnapshot(snapshot){
    clearActiveSession();
    Object.keys(snapshot || {}).forEach(k => {
      const entry = snapshot[k] || {};
      if (typeof entry.value !== 'string') return;
      // Snapshots are always restored into this tab's sessionStorage only.
      SS.setItem(k, entry.value);
    });
  }
  function isSuperadminSlug(slug){
    return String(slug || '').trim().toLowerCase() === 'superadmin';
  }

  function storeSession(s, remember){
    // Active session is always sessionStorage. "remember" only controls whether
    // a private restore blob is written for future empty tabs — never shared
    // live keys that other open tabs would inherit mid-session.
    const persist = (remember !== false);
    const store = (k, v) => ssSet(k, v, false);
    // For superadmin, admin_token is the primary token (no session_token)
    const primaryToken = s.session_token || s.admin_token || '';
    store(K.token, primaryToken);
    store(K.tid, s.tenant_id || '');
    store(K.slug, s.tenant_slug || '');
    store(K.name, s.tenant_name || 'Restaurant');
    store(K.tabs, JSON.stringify(s.allowed_tabs || []));
    store(K.user, s.username || '');
    store(K.role, s.role || 'admin');
    store(K.display, s.display_name || s.username || '');
    // Staff id is required for live role/tab realtime (tenant_users filter)
    if (s.user_id) store(K.uid, String(s.user_id));
    else if (s.id && s.role !== 'superadmin' && s.role !== 'admin') store(K.uid, String(s.id));
    store(K.persist, persist ? '1' : '0');
    // Plan / billing snapshot (from login + validate_session) for Settings fallback
    if (s.plan_code != null || s.plan_name != null || s.subscription_status != null) {
      store(K.planCode, s.plan_code || 'starter');
      store(K.planName, s.plan_name || '');
      store(K.subStatus, s.subscription_status || 'active');
      store(K.subEnd, s.subscription_current_period_end || '');
      try {
        store(K.planLimits, JSON.stringify(s.plan_limits || {}));
      } catch (_) {
        store(K.planLimits, '{}');
      }
    }
    if (s.admin_token) {
      SS.setItem('superadmin_admin_token', s.admin_token);
    } else {
      SS.removeItem('superadmin_admin_token');
    }
    purgeLegacyFlatSessionKeys();
    // Successful auth always cancels a prior intentional logout block.
    clearExplicitLogout();
    if (persist) writeRememberBlobFromSession();
    else {
      try { LS_SESS.removeItem(REMEMBER_BLOB_KEY); } catch (_) {}
      rawLocalRemove(REMEMBER_BLOB_KEY);
    }
  }

  async function post(fn, body, token, fallbackMsg){
    try {
      const res = await fetch(`${BASE}/functions/v1/${fn}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':ANON, 'Authorization':`Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const out = await res.json().catch(()=>({}));
      if(!res.ok){
        const msg = out.error || fallbackMsg || 'Request failed';
        const e = new Error(msg);
        e.status = res.status;
        if (out.code) e.code = out.code;
        // Classify auth failures for remember-blob policy (revoke vs soft expire)
        if (res.status === 401 || res.status === 403 || res.status === 402) {
          const m = String(msg || '');
          if (
            out.code === 'session_revoked' ||
            /revok|no longer active|was revoked|workspace no longer|not active/i.test(m)
          ) {
            e.authCode = 'revoked';
          } else if (out.code === 'session_expired' || /expired/i.test(m)) {
            e.authCode = 'expired';
          } else if (res.status === 402 || out.code === 'subscription_inactive' || /subscription/i.test(m)) {
            e.authCode = 'subscription';
          } else {
            e.authCode = 'unauthorized';
          }
        }
        // Desktop/local proxy returns 502 when the machine cannot reach Supabase
        // (Wi‑Fi on but no internet, airplane mode, DNS down). Treat as network —
        // never as auth failure — so offline-first login/session resume still works.
        if (
          res.status === 502 || res.status === 503 || res.status === 504 ||
          /could not reach|reach supabase|fetch failed|failed to fetch|econnrefused|enotfound|etimedout|network|offline|socket/i.test(String(msg))
        ) {
          e.network = true;
          if (res.status >= 500) e.status = 0;
        }
        throw e;
      }
      return out;
    } catch(err) {
      if (err.name === 'TypeError' || err.message === 'Failed to fetch' || err.network) {
        if (err.network && err.status === 0) throw err;
        const isAndroid = !!(window.RS_ANDROID || window.RS_NATIVE_APP || /RestroSuiteAndroid/i.test(navigator.userAgent || ''));
        const isLocalShell = /appassets\.androidplatform\.net/i.test(location.origin || '');
        let hint = 'Connection failed: could not reach the cloud. Check internet, then retry.';
        if (isAndroid || isLocalShell) {
          hint = 'No internet on this device — offline mode still works after first login. Turn on Wi‑Fi and retry for cloud sync.';
        } else {
          hint = 'No internet — using offline mode when available. Check Wi‑Fi, then retry for cloud sync.';
        }
        const e = new Error(hint);
        e.status = 0;
        e.network = true;
        throw e;
      }
      throw err;
    }
  }


  /* ---------------- AUTH ---------------- */

  const api = {
    configured: CONFIGURED,
    baseUrl: BASE,
    supabaseClient: supabaseClient,
    enableDemoTools: enableDemoTools,
    zeroCostLaunchMode: zeroCostLaunchMode,
    refreshConfig: absorbRuntimeConfig,

    async checkSlug(slug){ const r = await post('tenant-access', { action:'check_slug', slug }, ANON, 'Could not check availability'); return r.available === true; },

    async login({ slug, username, password, remember }){
      if (!CONFIGURED) absorbRuntimeConfig();
      if(!CONFIGURED) {
        if (isSuperadminSlug(slug)) {
          throw new Error('Super-Admin is cloud-only. Connect Supabase and sign in through the cloud backend.');
        }
        // SECURITY: Demo/mock auth is only permitted when enableDemoTools is explicitly
        // set to true (controlled by the server-side /api/config endpoint). In production
        // this flag is always false; the unconfigured path is a fatal misconfiguration.
        if (!enableDemoTools) {
          throw new Error('Application is not configured. Please check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
        }
        await new Promise(r=>setTimeout(r,600));
        let role = 'admin';
        let tenantId = slug || 'demo-tenant';
        let tenantSlug = slug || 'demo-tenant';
        let tenantName = 'Demo Restaurant';
        let allowedTabs = ['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'editor-tab', 'reports-tab', 'kds-tab', 'growth-hub-tab', 'employees-tab'];

        if (slug === 'brand-admin' || slug === 'brandadmin') {
          role = 'brand_admin';
          tenantId = 'brand-admin';
          tenantSlug = 'brand-admin';
          tenantName = 'Corporate Brand HQ';
          allowedTabs = ['chain-dashboard-tab'];
        }

        const mockSession = {
          tenant_id: tenantId,
          tenant_slug: tenantSlug,
          tenant_name: tenantName,
          username: username || 'demo',
          role: role,
          allowed_tabs: allowedTabs,
          session_token: 'demo-session-token'
        };
        storeSession(mockSession, remember !== false);
        return mockSession;
      }
      const r = await post('tenant-access', { action:'login', slug, username, password }, ANON, 'Login failed');
      if(!r.session) throw new Error('Login failed');
      storeSession(r.session, remember !== false);
      return r.session;
    },

    async register(payload){
      // payload: { name, slug, outlet_type, email, phone, username, password }
      if(!CONFIGURED) {
        // Demo/unconfigured mode: do NOT store a session -- registration creates a PENDING
        // outlet that must be approved before login. Storing a session here would bypass
        // the approval gate and auto-redirect to dashboard.
        await new Promise(r => setTimeout(r, 600));
        return { message: 'Registration submitted! Once CodeArc approves your outlet you can sign in.' };
      }
      return post('tenant-access', { action:'register', ...payload }, ANON, 'Registration failed');
    },

    async requestRecovery({ slug, email, phone }){ return post('tenant-access', { action:'request_recovery', slug, email, phone }, ANON, 'Recovery request failed'); },
    async verifyRecoveryOtp({ challenge_id, otp_code, code }){ return post('tenant-access', { action:'verify_recovery_otp', challenge_id, otp_code: otp_code || code }, ANON, 'OTP verification failed'); },
    async resetPassword({ token, password }){ return post('tenant-access', { action:'reset_password', token, password }, ANON, 'Password reset failed'); },

    /** Last validateSession auth failure: { authCode, message, status } or null */
    lastValidateError: null,

    async validateSession(){
      // Never treat "config still loading" as logged-out — that caused:
      // homepage → dashboard flash → login (wiping keep-me-signed-in).
      api.lastValidateError = null;
      if(!CONFIGURED) {
        try { absorbRuntimeConfig(); } catch (_) {}
        if (!CONFIGURED) {
          const localSession = api.session();
          if (localSession && localSession.role === 'superadmin' && !enableDemoTools) return localSession;
          return localSession;
        }
      }
      const token = ssGet(K.token);
      if(!token) return null;
      try {
        const r = await post('tenant-access', { action:'validate_session', session_token: token }, ANON, 'Session validation failed');
        if(r.session) {
          // Preserve session_token if validate response doesn't return it
          if(!r.session.session_token) {
            r.session.session_token = token;
          }
          // Preserve admin_token for superadmin: the validate response doesn't echo it back
          const existingAdminToken = ssGet('superadmin_admin_token');
          if(r.session.role === 'superadmin' && existingAdminToken) {
            r.session.admin_token = existingAdminToken;
          }
          // keep same persistence preference
          const persist = ssGet(K.persist) !== '0';
          storeSession(r.session, persist);
          return r.session;
        }
        // 200 but no session object — keep local tab session (do not wipe offline save)
        return api.session();
      } catch (err) {
        // If the server explicitly rejected it with 401 or 403, bounce to login (sess = null)
        if (err.status === 401 || err.status === 403 || err.status === 402) {
          api.lastValidateError = {
            authCode: err.authCode || 'unauthorized',
            message: err.message || '',
            status: err.status,
          };
          return null;
        }
        // Network error or offline -- keep the local session alive
        throw err;
      }
    },

    session(opts){
      // opts.force → hydrate even after intentional logout (manual offline continue)
      if (opts && opts.force) hydrateRememberedSessionOnce({ force: true });
      else restorePersistentSessionToTab();
      const t = ssGet(K.token); if(!t) return null;
      const role = ssGet(K.role);
      if (role === 'superadmin' && !CONFIGURED) {
        absorbRuntimeConfig();
        if (!CONFIGURED && !ssGet('superadmin_admin_token')) return null;
      }
      let planLimits = {};
      try { planLimits = JSON.parse(ssGet(K.planLimits) || '{}') || {}; } catch (_) { planLimits = {}; }
      return {
        token: t,
        tenant_id: ssGet(K.tid),
        tenant_slug: ssGet(K.slug),
        tenant_name: ssGet(K.name),
        username: ssGet(K.user),
        role,
        display_name: ssGet(K.display),
        user_id: ssGet(K.uid) || '',
        allowed_tabs: JSON.parse(ssGet(K.tabs) || '[]'),
        plan_code: ssGet(K.planCode) || '',
        plan_name: ssGet(K.planName) || '',
        subscription_status: ssGet(K.subStatus) || '',
        subscription_current_period_end: ssGet(K.subEnd) || '',
        plan_limits: planLimits,
      };
    },

    /**
     * Apply live role/tab changes without re-login (admin updated permissions).
     * Updates sessionStorage + keep-me-signed-in blob.
     */
    applyLocalRoleTabs({ role, allowed_tabs, user_id } = {}){
      if (role != null && role !== '') ssSet(K.role, String(role), false);
      if (allowed_tabs != null) {
        try { ssSet(K.tabs, JSON.stringify(Array.isArray(allowed_tabs) ? allowed_tabs : []), false); }
        catch (_) { ssSet(K.tabs, '[]', false); }
      }
      if (user_id) ssSet(K.uid, String(user_id), false);
      if (ssGet(K.persist) !== '0') writeRememberBlobFromSession();
      return api.session();
    },

    /**
     * @param {{ intentional?: boolean }} [opts] intentional:false = session expired (no "you signed out" hint)
     */
    logout(opts){ ssClear(opts); },
    /** True after intentional Sign out — login page must not auto-jump to dashboard. */
    wasExplicitLogout(){ return wasExplicitLogout(); },
    clearExplicitLogout(){ clearExplicitLogout(); },
    /** Offline / keep-me-signed-in blob present on this device. */
    hasRememberBlob(){ return hasRememberBlob(); },
    /** Manual offline resume (Continue button) — force-hydrate saved blob if any. */
    resumeRememberedSession(){
      return hydrateRememberedSessionOnce({ force: true });
    },

    /* ---------------- DATA (tenant-data) ---------------- */
    async data(payload){
      const token = ssGet(K.token);
      // Gateway operations (send/status/logs/reset) don't require a Supabase session
      // when running on localhost -- the local dev server authenticates with the gateway directly.
      const GATEWAY_OPS = ['gateway_status','gateway_send','gateway_logs','gateway_reset','gateway_logout'];
      const isGatewayOp = payload && GATEWAY_OPS.includes(payload.operation);
      
      if (isGatewayOp && payload && !payload.tenantId) {
        const tid = ssGet(K.tid);
        if (tid) {
          payload.tenantId = tid;
        }
      }

      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!token && !(isGatewayOp && isLocalhost)) throw new Error('Not signed in');
      const r = await post('tenant-data', payload, token || 'local-dev-gateway', 'Data request failed');
      return r.data;
    },
    select(table, { columns='*', filters=[], order=null, limit=null, offset=null, single=false, maybeSingle=false }={}){
      return api.data({ table, operation:'select', columns, filters, order, limit, offset, single, maybeSingle });
    },
    insert(table, data, { returning=true, columns='*' }={}){ return api.data({ table, operation:'insert', data, returning, columns }); },
    update(table, data, filters, { returning=true, columns='*' }={}){ return api.data({ table, operation:'update', data, filters, returning, columns }); },
    upsert(table, data, onConflict, { returning=true, columns='*' }={}){ return api.data({ table, operation:'upsert', data, options:{ onConflict }, returning, columns }); },
    remove(table, filters){ return api.data({ table, operation:'delete', filters }); },

    /* ---------------- LICENSE (license-lease) ---------------- */
    async lease(deviceId){
      const token = ssGet(K.token);
      if (!token) { const e = new Error('Not signed in'); e.status = 401; throw e; }
      if (!CONFIGURED) absorbRuntimeConfig();
      return post('license-lease', { device_id: deviceId }, token, 'License refresh failed');
    },

    /* ---------------- BILLING / PLANS (razorpay-route, tenant session) ------ */
    async getPlans(){
      const token = ssGet(K.token);
      if (!token) { const e = new Error('Not signed in'); e.status = 401; throw e; }
      if (!CONFIGURED) absorbRuntimeConfig();
      return post('razorpay-route', { action: 'get_plans' }, token, 'Could not load plans');
    },
    async subscribe(planCode){
      const token = ssGet(K.token);
      if (!token) { const e = new Error('Not signed in'); e.status = 401; throw e; }
      if (!CONFIGURED) absorbRuntimeConfig();
      return post('razorpay-route', { action: 'create_subscription', plan_code: planCode }, token, 'Could not start checkout');
    },

    /* ---------------- SUPER-ADMIN (tenant-admin) ---------------- */
    async admin({ action, ...payload }){
      if(!CONFIGURED) {
        throw new Error('Super-Admin is cloud-only. Connect Supabase before using platform controls.');
      }
      const adminToken = ssGet('superadmin_admin_token');
      if(!adminToken) throw new Error("Superadmin session expired. Please log in again.");
      return post('tenant-admin', { action, ...payload }, adminToken, 'Superadmin request failed');
    },

    // -- Staff account management (tenant-users edge function) -------------
    // Requires an active admin/owner session token.
    async staffUsers({ action, ...payload }) {
      const token = ssGet(K.token);
      if (!token) throw new Error('Not signed in.');

      if (!CONFIGURED) {
        // Mock mode -- use sessionStorage as a fake DB
        await new Promise(r => setTimeout(r, 300));
        const store = () => JSON.parse(sessionStorage.getItem('mock_staff_users') || '[]');
        const save  = (d) => sessionStorage.setItem('mock_staff_users', JSON.stringify(d));

        if (action === 'list_users') {
          return { users: store(), usage: { active_staff: store().length, max_staff: 15 }, plan: { code: 'growth', name: 'Growth' } };
        }
        if (action === 'create_user') {
          const users = store();
          if (users.find(u => u.username === payload.username)) throw new Error('That username already exists in this workspace.');
          const user = { id: 'mock-' + Date.now(), username: payload.username, display_name: payload.display_name, role: payload.role, status: 'active', allowed_tabs: [], created_at: new Date().toISOString() };
          users.push(user); save(users);
          return { user };
        }
        if (action === 'update_user') {
          const users = store();
          const idx = users.findIndex(u => u.id === payload.user_id);
          if (idx === -1) throw new Error('Staff account was not found.');
          users[idx] = { ...users[idx], ...( payload.role !== undefined ? { role: payload.role } : {} ), ...( payload.status !== undefined ? { status: payload.status } : {} ), ...( payload.display_name !== undefined ? { display_name: payload.display_name } : {} ) };
          save(users); return { user: users[idx] };
        }
        if (action === 'reset_password') return { success: true };
        if (action === 'revoke_user_sessions') return { success: true };
        if (action === 'delete_user') {
          const users = store();
          const next = users.filter(u => u.id !== payload.user_id);
          if (next.length === users.length) throw new Error('Staff account was not found.');
          save(next); return { success: true };
        }
        if (action === 'audit_logs') return { logs: [] };
        throw new Error('Unknown action');
      }

      return post('tenant-users', { action, ...payload }, token, 'Staff account operation failed');
    },

    async impersonateTenant(tenant){
      const current = api.session();
      if (!current || current.role !== 'superadmin') throw new Error('Superadmin session required. Sign in again as super-admin.');
      if (!tenant || !tenant.id) throw new Error('Tenant details not found.');
      // Snapshot uses flat sessionStorage keys (tenant_session_token, superadmin_admin_token, …)
      const origin = readSessionSnapshot();
      const hasOriginTok = !!(origin && (
        (origin[K.token] && origin[K.token].value) ||
        (origin.superadmin_admin_token && origin.superadmin_admin_token.value)
      ));
      if (!hasOriginTok) throw new Error('Could not snapshot super-admin session. Sign out and sign back in.');
      const out = await api.admin({ action:'create_impersonation_session', tenant_id: tenant.id });
      if (out && out.error) throw new Error(out.error);
      if (!out || !out.session || !out.session.session_token) {
        throw new Error((out && out.error) || 'Could not open tenant dashboard (no session returned).');
      }
      clearActiveSession();
      storeSession(out.session, false);
      SS.setItem(IMP_ORIGIN_KEY, JSON.stringify(origin));
      SS.setItem(IMP_TARGET_KEY, JSON.stringify({
        id: out.session.tenant_id || tenant.id,
        slug: out.session.tenant_slug || tenant.slug || '',
        name: out.session.tenant_name || tenant.name || tenant.tenant_name || 'Client Workspace',
        started_at: new Date().toISOString()
      }));
      try {
        localStorage.setItem('rs_active_tab', 'pos-tab');
        // Ensure early shell does not keep platform mode after reload
        sessionStorage.setItem('logged_in_role', out.session.role || 'admin');
      } catch(e) {}
      return out.session;
    },

    exitTenantImpersonation(){
      const raw = SS.getItem(IMP_ORIGIN_KEY);
      if (!raw) return false;
      const snapshot = JSON.parse(raw);
      restoreSessionSnapshot(snapshot);
      SS.removeItem(IMP_ORIGIN_KEY);
      SS.removeItem(IMP_TARGET_KEY);
      try { localStorage.setItem('rs_active_tab', 'super-admin-tab'); } catch(e) {}
      return true;
    },

    impersonation(){
      try { return JSON.parse(SS.getItem(IMP_TARGET_KEY) || 'null'); }
      catch(e) { return null; }
    },
  };

  window.RS_API = api;

  /* ---------------- GLOBAL ERROR BOUNDARY ---------------- */
  // Catches any unhandled promise rejection across the whole app and surfaces
  // a non-blocking "Something went wrong -- reload?" banner. This prevents the
  // dashboard from silently half-rendering on network errors or unexpected
  // exceptions (e.g. JSON parse failures on non-200 responses).
  window.addEventListener('unhandledrejection', function(event) {
    const err = event.reason;
    // Ignore deliberate AbortController cancellations
    if (err && err.name === 'AbortError') return;
    const msg = (err && (err.message || String(err))) || 'An unexpected error occurred.';
    // Don't spam the banner for benign network blips during auth check
    if (msg === 'Failed to fetch' && document.visibilityState === 'hidden') return;
    // Surface a dismissible banner if the dashboard shell is present
    const existing = document.getElementById('rs-global-error-banner');
    if (existing) return; // already showing
    const banner = document.createElement('div');
    banner.id = 'rs-global-error-banner';
    banner.style.cssText = [
      'position:fixed','bottom:20px','left:50%','transform:translateX(-50%)',
      'background:var(--glass-2,rgba(30,30,30,.95))','color:var(--text,#fff)',
      'border:1px solid var(--red,#ef4444)','border-radius:12px',
      'padding:12px 18px','z-index:99999','font-size:13px',
      'display:flex','align-items:center','gap:12px','max-width:90vw',
      'box-shadow:0 4px 24px rgba(0,0,0,.4)','backdrop-filter:blur(8px)'
    ].join(';');
    const errText = document.createTextNode('⚠️ ' + msg.slice(0, 120));
    const reload = document.createElement('button');
    reload.textContent = 'Reload';
    reload.style.cssText = 'padding:4px 12px;border-radius:8px;border:1px solid var(--orange,#FF4F00);background:transparent;color:var(--orange,#FF4F00);cursor:pointer;font-size:12px;white-space:nowrap';
    reload.onclick = function() { location.reload(); };
    const dismiss = document.createElement('button');
    dismiss.textContent = '×';
    dismiss.style.cssText = 'padding:4px 8px;border-radius:8px;border:none;background:transparent;color:var(--text-mute,#888);cursor:pointer;font-size:16px';
    dismiss.onclick = function() { banner.remove(); };
    banner.appendChild(errText);
    banner.appendChild(reload);
    banner.appendChild(dismiss);
    document.body ? document.body.appendChild(banner) : document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(banner); });
    // Auto-dismiss after 12 seconds
    setTimeout(function() { if (banner.parentNode) banner.remove(); }, 12000);
  });
})();
