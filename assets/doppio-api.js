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

  // Run initial recompute synchronously
  recomputeConfig();

  // SECURITY: the demo/mock fallback below can fabricate a full session for ANY
  // slug/role (including superadmin) when Supabase is misconfigured or unreachable.
  // In production this is an auth bypass -- a transient /api/config failure would
  // silently log any visitor in as admin. Demo mode must ONLY be available on a
  // local developer machine. Never enable it for a real hostname (incl. Vercel
  // previews, custom domains, or the Android WebView which uses file:// origins).
  const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // Android WebView injects window.ENV_SUPABASE_URL, so CONFIGURED is true there.
  // An explicit opt-in flag (window.RS_ALLOW_DEMO = true) can still enable demo
  // mode locally without spinning up Supabase.
  const ALLOW_DEMO = IS_LOCALHOST && (window.RS_ALLOW_DEMO === true);

  const SS = window.sessionStorage;
  const LS_SESS = window.localStorage; // persistent session storage
  const K = { token:'tenant_session_token', tid:'tenant_id', slug:'tenant_slug', name:'tenant_name',
              tabs:'allowed_tabs', user:'logged_in_user', role:'logged_in_role', display:'logged_in_display',
              persist:'rs_session_persistent' };
  const SESSION_KEYS = [K.token,K.tid,K.slug,K.name,K.tabs,K.user,K.role,K.display,K.persist,'superadmin_admin_token'];
  const IMP_ORIGIN_KEY = 'rs_superadmin_impersonation_origin';
  const IMP_TARGET_KEY = 'rs_superadmin_impersonation_target';

  if (!cfg.url || !cfg.anonKey) {
    const configSource = window.__configReady || Promise.resolve();
    configSource.then(() => {
      if (window.__SUPABASE_URL__ && window.__SUPABASE_ANON_KEY__) {
        cfg = { url: window.__SUPABASE_URL__, anonKey: window.__SUPABASE_ANON_KEY__ };
        if (window.CONFIG) {
          enableDemoTools = !!window.CONFIG.enableDemoTools;
          zeroCostLaunchMode = !!window.CONFIG.zeroCostLaunchMode;
        } else {
          enableDemoTools = !!window.__enableDemoTools;
          zeroCostLaunchMode = !!window.__zeroCostLaunchMode;
        }
        recomputeConfig();
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

  // Helper: read from localStorage first (persistent), then sessionStorage (tab-only)
  function ssGet(k){ return LS_SESS.getItem(k) || SS.getItem(k); }
  function ssSet(k, v, persist){
    if(persist){
      LS_SESS.setItem(k, v);
      SS.removeItem(k); // clear session copy if upgrading to persistent
    } else {
      SS.setItem(k, v);
      LS_SESS.removeItem(k);
    }
  }
  function ssClear(){
    SESSION_KEYS
      .forEach(k=>{ SS.removeItem(k); LS_SESS.removeItem(k); });
    SS.removeItem(IMP_ORIGIN_KEY);
    SS.removeItem(IMP_TARGET_KEY);
  }
  function clearActiveSession(){
    SESSION_KEYS.forEach(k=>{ SS.removeItem(k); LS_SESS.removeItem(k); });
  }
  function readSessionSnapshot(){
    const snapshot = {};
    SESSION_KEYS.forEach(k => {
      if (LS_SESS.getItem(k) !== null) snapshot[k] = { storage:'local', value:LS_SESS.getItem(k) };
      else if (SS.getItem(k) !== null) snapshot[k] = { storage:'session', value:SS.getItem(k) };
    });
    return snapshot;
  }
  function restoreSessionSnapshot(snapshot){
    clearActiveSession();
    Object.keys(snapshot || {}).forEach(k => {
      const entry = snapshot[k] || {};
      if (typeof entry.value !== 'string') return;
      if (entry.storage === 'local') LS_SESS.setItem(k, entry.value);
      else SS.setItem(k, entry.value);
    });
  }

  function storeSession(s, remember){
    // If remember is not provided, check existing preference or default to true
    const persist = (remember !== false);
    const store = (k, v) => ssSet(k, v, persist);
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
    store(K.persist, persist ? '1' : '0');
    if(s.admin_token) ssSet('superadmin_admin_token', s.admin_token, persist);
    else { SS.removeItem('superadmin_admin_token'); LS_SESS.removeItem('superadmin_admin_token'); }
  }

  async function post(fn, body, token, fallbackMsg){
    try {
      const res = await fetch(`${BASE}/functions/v1/${fn}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':ANON, 'Authorization':`Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const out = await res.json().catch(()=>({}));
      if(!res.ok){ const e=new Error(out.error||fallbackMsg||'Request failed'); e.status=res.status; throw e; }
      return out;
    } catch(err) {
      if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
        const e = new Error('Connection failed: Failed to fetch. Ensure Vercel environment variables are correct, the Supabase project is active, and ALLOWED_ORIGINS includes https://restrosuite.codearc.co.in');
        e.status = 0;
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

    async checkSlug(slug){ const r = await post('tenant-access', { action:'check_slug', slug }, ANON, 'Could not check availability'); return r.available === true; },

    async login({ slug, username, password, remember }){
      if(!CONFIGURED) {
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

        if (slug === 'superadmin') {
          role = 'superadmin';
          tenantId = 'superadmin';
          tenantSlug = 'superadmin';
          tenantName = 'SaaS Platform Owner';
          allowedTabs = ['super-admin-tab', 'gateway-monitor-tab'];
        } else if (slug === 'brand-admin' || slug === 'brandadmin') {
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
          session_token: role === 'superadmin' ? '' : 'demo-session-token',
          admin_token: role === 'superadmin' ? 'demo-admin-token' : ''
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

    async requestRecovery({ slug, email }){ return post('tenant-access', { action:'request_recovery', slug, email }, ANON, 'Recovery request failed'); },
    async resetPassword({ token, password }){ return post('tenant-access', { action:'reset_password', token, password }, ANON, 'Password reset failed'); },

    async validateSession(){
      if(!CONFIGURED) {
        if (!enableDemoTools) return null;
        return api.session();
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
        }
        return r.session || null;
      } catch (err) {
        // If the server explicitly rejected it with 401 or 403, bounce to login (sess = null)
        if (err.status === 401 || err.status === 403) {
          return null;
        }
        // Network error or offline -- keep the local session alive
        throw err;
      }
    },

    session(){ const t = ssGet(K.token); if(!t) return null;
      return { token:t, tenant_id:ssGet(K.tid), tenant_slug:ssGet(K.slug), tenant_name:ssGet(K.name),
               username:ssGet(K.user), role:ssGet(K.role), display_name:ssGet(K.display),
               allowed_tabs: JSON.parse(ssGet(K.tabs)||'[]') }; },

    logout(){ ssClear(); },

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
    select(table, { columns='*', filters=[], order=null, limit=null, single=false, maybeSingle=false }={}){
      return api.data({ table, operation:'select', columns, filters, order, limit, single, maybeSingle });
    },
    insert(table, data, { returning=true, columns='*' }={}){ return api.data({ table, operation:'insert', data, returning, columns }); },
    update(table, data, filters, { returning=true, columns='*' }={}){ return api.data({ table, operation:'update', data, filters, returning, columns }); },
    upsert(table, data, onConflict, { returning=true, columns='*' }={}){ return api.data({ table, operation:'upsert', data, options:{ onConflict }, returning, columns }); },
    remove(table, filters){ return api.data({ table, operation:'delete', filters }); },

    /* ---------------- SUPER-ADMIN (tenant-admin) ---------------- */
    async admin({ action, ...payload }){
      if(!CONFIGURED) {
        if (!enableDemoTools) throw new Error('Application is not configured.');
        await new Promise(r=>setTimeout(r,300));
        if (action === 'list_tenants') {
          let list = sessionStorage.getItem('mock_tenants_v2');
          if (!list) {
            const defaults = [];
            sessionStorage.setItem('mock_tenants_v2', JSON.stringify(defaults));
            list = JSON.stringify(defaults);
          }
          return { tenants: JSON.parse(list) };
        }
        if (action === 'update_tenant') {
          let list = JSON.parse(sessionStorage.getItem('mock_tenants_v2') || '[]');
          const idx = list.findIndex(t => String(t.id) === String(payload.tenant_id));
          if (idx !== -1) {
            const planNames = { free: 'Free / Demo', starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };
            const mrrValues = { free: 0, starter: 1499, growth: 2999, enterprise: 9999 };
            list[idx] = {
              ...list[idx],
              username: payload.username,
              status: payload.status,
              plan_code: payload.plan_code,
              plan_name: planNames[payload.plan_code] || 'Starter',
              mrr: mrrValues[payload.plan_code] || 1499,
              subscription_status: payload.subscription_status,
              allowed_tabs: payload.allowed_tabs,
              phone: payload.phone,
              email: payload.email
            };
            sessionStorage.setItem('mock_tenants_v2', JSON.stringify(list));
          }
          return { message: 'Tenant updated successfully' };
        }
        if (action === 'delete_tenant') {
          let list = JSON.parse(sessionStorage.getItem('mock_tenants_v2') || '[]');
          list = list.filter(t => String(t.id) !== String(payload.tenant_id));
          sessionStorage.setItem('mock_tenants_v2', JSON.stringify(list));
          return { message: 'Tenant deleted successfully' };
        }
        if (action === 'bulk_delete') {
          let list = JSON.parse(sessionStorage.getItem('mock_tenants_v2') || '[]');
          const idsToDelete = (payload.tenant_ids || []).map(id => String(id));
          list = list.filter(t => !idsToDelete.includes(String(t.id)));
          sessionStorage.setItem('mock_tenants_v2', JSON.stringify(list));
          return { message: 'Tenants bulk deleted successfully' };
        }
        if (action === 'reset_tenant_data' || action === 'seed_tenant_data' || action === 'purge_demo_data') {
          return { message: 'Action mock-executed successfully', errors: [] };
        }
        if (action === 'create_impersonation_session') {
          let list = JSON.parse(sessionStorage.getItem('mock_tenants_v2') || '[]');
          const tenant = list.find(t => String(t.id) === String(payload.tenant_id));
          if (!tenant) throw new Error('Client workspace was not found.');
          if ((tenant.status || 'approved') !== 'approved') throw new Error('Only active workspaces can be opened.');
          return {
            session: {
              tenant_id: tenant.id,
              tenant_slug: tenant.slug || tenant.tenant_slug || '',
              tenant_name: tenant.name || tenant.tenant_name || 'Client Workspace',
              username: 'superadmin:support',
              display_name: 'Support Access',
              role: 'admin',
              allowed_tabs: tenant.allowed_tabs || ['pos-tab','qr-orders-tab','bills-tab','inventory-tab','editor-tab','reports-tab','kds-tab','employees-tab','growth-hub-tab'],
              session_token: 'demo-impersonation-token'
            }
          };
        }
        if (action === 'list_error_reports') {
          let reports = sessionStorage.getItem('mock_incidents_v2');
          if (!reports) {
            const defaults = [];
            sessionStorage.setItem('mock_incidents_v2', JSON.stringify(defaults));
            reports = JSON.stringify(defaults);
          }
          let parsed = JSON.parse(reports);
          if (payload.status) {
            parsed = parsed.filter(r => r.status === payload.status);
          }
          return { reports: parsed };
        }
        if (action === 'resolve_error_report') {
          let reports = JSON.parse(sessionStorage.getItem('mock_incidents_v2') || '[]');
          const idx = reports.findIndex(r => r.id === payload.report_id);
          if (idx !== -1) {
            reports[idx].status = 'resolved';
            sessionStorage.setItem('mock_incidents_v2', JSON.stringify(reports));
          }
          return { message: 'Incident resolved' };
        }
        if (action === 'gateway_status') {
          return {
            status: 'ready',
            authenticated: true,
            number: '919983721179',
            qr: '',
            sessionSavedAt: new Date().toISOString(),
            sessionRestoredAt: new Date().toISOString(),
            reconnectAttempts: 0,
            totalMessagesSent: 12408,
            recentHealthEvents: []
          };
        }
        if (action === 'gateway_logs') {
          return { logs: [] };
        }
        return { error: 'Unknown action' };
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
        if (action === 'audit_logs') return { logs: [] };
        throw new Error('Unknown action');
      }

      return post('tenant-users', { action, ...payload }, token, 'Staff account operation failed');
    },

    async impersonateTenant(tenant){
      const current = api.session();
      if (!current || current.role !== 'superadmin') throw new Error('Superadmin session required.');
      if (!tenant || !tenant.id) throw new Error('Tenant details not found.');
      const origin = readSessionSnapshot();
      const out = await api.admin({ action:'create_impersonation_session', tenant_id: tenant.id });
      if (!out || !out.session || !out.session.session_token) throw new Error('Could not open tenant dashboard.');
      clearActiveSession();
      storeSession(out.session, false);
      SS.setItem(IMP_ORIGIN_KEY, JSON.stringify(origin));
      SS.setItem(IMP_TARGET_KEY, JSON.stringify({
        id: out.session.tenant_id || tenant.id,
        slug: out.session.tenant_slug || tenant.slug || '',
        name: out.session.tenant_name || tenant.name || tenant.tenant_name || 'Client Workspace',
        started_at: new Date().toISOString()
      }));
      try { localStorage.setItem('rs_active_tab', 'pos-tab'); } catch(e) {}
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
    reload.style.cssText = 'padding:4px 12px;border-radius:8px;border:1px solid var(--orange,#fc8019);background:transparent;color:var(--orange,#fc8019);cursor:pointer;font-size:12px;white-space:nowrap';
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
