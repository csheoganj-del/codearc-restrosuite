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
      console.warn('[doppio-api] Synchronous fetch /api/config failed:', e.message);
    }
  }
  // Normalise: accept either the bare project URL or one with a /rest/v1 or /functions/v1 suffix.
  const BASE = String(cfg.url || '').trim().replace(/\/+$/, '').replace(/\/(rest|functions)\/v1$/, '');
  const ANON = String(cfg.anonKey || '').trim();
  const CONFIGURED = !!(BASE && ANON);

  const SS = window.sessionStorage;
  const K = { token:'tenant_session_token', tid:'tenant_id', slug:'tenant_slug', name:'tenant_name',
              tabs:'allowed_tabs', user:'logged_in_user', role:'logged_in_role', display:'logged_in_display' };

  const supabaseClient = (window.supabase && CONFIGURED) ? window.supabase.createClient(BASE, ANON) : null;

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
  function storeSession(s){
    // For superadmin, admin_token is the primary token (no session_token)
    const primaryToken = s.session_token || s.admin_token || '';
    SS.setItem(K.token, primaryToken);
    SS.setItem(K.tid, s.tenant_id || '');
    SS.setItem(K.slug, s.tenant_slug || '');
    SS.setItem(K.name, s.tenant_name || 'Restaurant');
    SS.setItem(K.tabs, JSON.stringify(s.allowed_tabs || []));
    SS.setItem(K.user, s.username || '');
    SS.setItem(K.role, s.role || 'admin');
    SS.setItem(K.display, s.display_name || s.username || '');
    if(s.admin_token) SS.setItem('superadmin_admin_token', s.admin_token);
  }

  const api = {
    configured: CONFIGURED,
    baseUrl: BASE,
    supabaseClient: supabaseClient,
    enableDemoTools: enableDemoTools,
    zeroCostLaunchMode: zeroCostLaunchMode,

    async checkSlug(slug){ const r = await post('tenant-access', { action:'check_slug', slug }, ANON, 'Could not check availability'); return r.available === true; },

    async login({ slug, username, password }){
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
        storeSession(mockSession);
        return mockSession;
      }
      const r = await post('tenant-access', { action:'login', slug, username, password }, ANON, 'Login failed');
      if(!r.session) throw new Error('Login failed');
      storeSession(r.session);
      return r.session;
    },

    async register(payload){
      // payload: { name, slug, outlet_type, email, phone, username, password }
      if(!CONFIGURED) {
        const mockSession = {
          tenant_id: payload.slug || 'demo-tenant',
          tenant_slug: payload.slug || 'demo-tenant',
          tenant_name: payload.name || 'Demo Restaurant',
          username: payload.username || 'demo',
          role: 'admin',
          allowed_tabs: ['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'editor-tab', 'reports-tab', 'kds-tab', 'growth-hub-tab', 'employees-tab'],
          session_token: 'demo-session-token',
          admin_token: ''
        };
        storeSession(mockSession);
        return { message: 'Outlet created' };
      }
      return post('tenant-access', { action:'register', ...payload }, ANON, 'Registration failed');
    },

    async requestRecovery({ slug, email }){ return post('tenant-access', { action:'request_recovery', slug, email }, ANON, 'Recovery request failed'); },
    async resetPassword({ token, password }){ return post('tenant-access', { action:'reset_password', token, password }, ANON, 'Password reset failed'); },

    async validateSession(){
      if(!CONFIGURED) {
        return api.session();
      }
      const token = SS.getItem(K.token);
      if(!token) return null;
      const r = await post('tenant-access', { action:'validate_session', session_token: token }, ANON, 'Session validation failed');
      if(r.session) {
        // Preserve admin_token for superadmin: the validate response doesn't echo it back
        const existingAdminToken = SS.getItem('superadmin_admin_token');
        if(r.session.role === 'superadmin' && existingAdminToken) {
          r.session.admin_token = existingAdminToken;
        }
        storeSession(r.session);
      }
      return r.session || null;
    },

    session(){ const t = SS.getItem(K.token); if(!t) return null;
      return { token:t, tenant_id:SS.getItem(K.tid), tenant_slug:SS.getItem(K.slug), tenant_name:SS.getItem(K.name),
               username:SS.getItem(K.user), role:SS.getItem(K.role), display_name:SS.getItem(K.display),
               allowed_tabs: JSON.parse(SS.getItem(K.tabs)||'[]') }; },

    logout(){ [K.token,K.tid,K.slug,K.name,K.tabs,K.user,K.role,K.display,'superadmin_admin_token'].forEach(k=>SS.removeItem(k)); },

    /* ---------------- DATA (tenant-data) ---------------- */
    async data(payload){
      const token = SS.getItem(K.token);
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
            const planNames = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };
            const mrrValues = { starter: 1499, growth: 2999, enterprise: 9999 };
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
        return { error: 'Unknown action' };
      }
      
      const adminToken = sessionStorage.getItem('superadmin_admin_token');
      if(!adminToken) throw new Error("Superadmin session expired. Please log in again.");
      return post('tenant-admin', { action, ...payload }, adminToken, 'Superadmin request failed');
    }
  };

  window.RS_API = api;
})();
