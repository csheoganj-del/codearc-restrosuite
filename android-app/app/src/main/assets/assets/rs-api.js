/* ============================================================
   RestroSuite — Doppio backend API client
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
  if (!cfg.url || !cfg.anonKey) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/config', false);
      xhr.send(null);
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        if (res.supabaseUrl && res.supabaseAnonKey) {
          cfg = { url: res.supabaseUrl, anonKey: res.supabaseAnonKey };
          enableDemoTools = res.enableDemoTools === true;
          zeroCostLaunchMode = res.zeroCostLaunchMode === true;
        }
      }
    } catch(e) {
      console.warn('[rs-api] Synchronous fetch /api/config failed:', e.message);
    }
  }
  // Normalise: accept either the bare project URL or one with a /rest/v1 or /functions/v1 suffix.
  const REMOTE_BASE = String(cfg.url || '').trim().replace(/\/+$/, '').replace(/\/(rest|functions)\/v1$/, '');
  const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : REMOTE_BASE;
  const ANON = String(cfg.anonKey || '').trim();
  const CONFIGURED = !!(REMOTE_BASE && ANON);

  const SS = window.sessionStorage;
  const LS_SESS = window.localStorage; // persistent session storage
  const K = { token:'tenant_session_token', tid:'tenant_id', slug:'tenant_slug', name:'tenant_name',
              tabs:'allowed_tabs', user:'logged_in_user', role:'logged_in_role', display:'logged_in_display',
              persist:'rs_session_persistent' };

  const supabaseClient = (window.supabase && CONFIGURED) ? window.supabase.createClient(REMOTE_BASE, ANON) : null;

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
    [K.token,K.tid,K.slug,K.name,K.tabs,K.user,K.role,K.display,K.persist,'superadmin_admin_token']
      .forEach(k=>{ SS.removeItem(k); LS_SESS.removeItem(k); });
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
        await new Promise(r=>setTimeout(r,600));
        const mockSession = {
          tenant_id: slug === 'superadmin' ? 'superadmin' : (slug || 'demo-tenant'),
          tenant_slug: slug === 'superadmin' ? 'superadmin' : (slug || 'demo-tenant'),
          tenant_name: slug === 'superadmin' ? 'SaaS Platform Owner' : 'Demo Restaurant',
          username: username || 'demo',
          role: slug === 'superadmin' ? 'superadmin' : 'admin',
          allowed_tabs: slug === 'superadmin' ? ['super-admin-tab', 'gateway-monitor-tab'] : ['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'editor-tab', 'reports-tab', 'kds-tab', 'growth-hub-tab', 'employees-tab'],
          session_token: slug === 'superadmin' ? '' : 'demo-session-token',
          admin_token: slug === 'superadmin' ? 'demo-admin-token' : ''
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
        // Demo/unconfigured mode: do NOT store a session — registration creates a PENDING
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
        // Network error or offline — keep the local session alive
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
      if(!token) throw new Error('Not signed in');
      const r = await post('tenant-data', payload, token, 'Data request failed');
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
        if (action === 'gateway_reset') {
          return { status: 'success' };
        }
        return { error: 'Unknown action' };
      }
      
      const adminToken = ssGet('superadmin_admin_token');
      if(!adminToken) throw new Error("Superadmin session expired. Please log in again.");
      return post('tenant-admin', { action, ...payload }, adminToken, 'Superadmin request failed');
    }
  };

  window.RS_API = api;
})();
