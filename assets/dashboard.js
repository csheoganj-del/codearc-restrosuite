/* ============================================================
   RestroSuite Console - interactivity & data rendering
   ============================================================ */
(function () {
  'use strict';
  const FAST_INTERACTION_MODE = true;
  const ENABLE_DEMO_TOOLS = !!(window.RS_API && window.RS_API.enableDemoTools);
  const vaultWriteQueue = [];

  function debounce(fn, wait = 120) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function frameTask(fn) {
    return function runInFrame(...args) {
      const run = () => fn.apply(this, args);
      if (FAST_INTERACTION_MODE && window.requestAnimationFrame) window.requestAnimationFrame(run);
      else setTimeout(run, 0);
    };
  }
  
  // Self-Healing Boot Recovery
  (function () {
    try {
      const sigKey = 'rs_update_signature';
      const stableKey = 'rs_last_stable_signature';
      const currentSig = localStorage.getItem(sigKey);
      const stableSig = localStorage.getItem(stableKey);
      
      // If we boot successfully for 10 seconds, mark this version/signature as stable
      window.setTimeout(() => {
        if (currentSig) {
          localStorage.setItem(stableKey, currentSig);
        }
      }, 10000);

      window.addEventListener('error', function (event) {
        if (!event.message || event.message.includes('Extension')) return;
        if (stableSig && currentSig && stableSig !== currentSig) {
          console.error('[Self-Healing] Fatal error detected post-update. Rolling back to stable signature:', stableSig);
          localStorage.setItem(sigKey, stableSig);
          localStorage.removeItem('rs_pre_update_snapshot');
          window.location.reload();
        }
      });
    } catch (e) {
      console.warn('[Self-Healing Setup Failed]:', e);
    }
  })();
  
  // Observability / Incident Reporting
  const observabilityDomain = window.RestroSuite && window.RestroSuite.observability;
  if (observabilityDomain) {
    const appReporter = observabilityDomain.createReporter({
      baseUrl: window.RS_API && window.RS_API.baseUrl || '',
      anonKey: window.RS_SUPABASE && window.RS_SUPABASE.anonKey || '',
      source: 'dashboard',
      appVersion: '2.0'
    });
    appReporter.installGlobalHandlers(() => ({
      tenant_id: (window.RS_API ? RS_API.session()?.tenant_id : null) || sessionStorage.getItem('tenant_id') || '',
      tenant_slug: (window.RS_API ? RS_API.session()?.tenant_slug : null) || sessionStorage.getItem('tenant_slug') || '',
      metadata: {
        role: (window.RS_API ? RS_API.session()?.role : null) || sessionStorage.getItem('logged_in_role') || '',
        active_tab: document.querySelector('.tab-content.active')?.id || ''
      }
    }));
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- HTML ESCAPING (XSS prevention) ---------- */
  // Every value interpolated into innerHTML MUST pass through esc() first.
  // Unescaped user/server data in innerHTML is a stored-XSS vector that
  // enables full account takeover (session tokens live in localStorage).
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  // Alias for readability in templates
  const _e = esc;
  function getCurrencySymbol() {
    try {
      const settings = window.RS_SETTINGS || {};
      const raw = settings.set_currency || '';
      if (raw) {
        const m = raw.match(/\(([^)]+)\)/);
        const sym = m ? m[1].trim() : raw.trim().split(/\s+/).pop();
        if (sym) return sym;
      }
    } catch(e) {}
    return '\u20b9';
  }

  // Returns the RS_COUNTRIES entry for the outlet's selected country.
  // locale and tz fields are now on every entry in country-currency-data.js.
  function getOutletCountryEntry() {
    try {
      const country = (window.RS_SETTINGS || {}).set_country || 'India';
      return (window.RS_getCountryByName && window.RS_getCountryByName(country))
        || { locale: 'en-IN', tz: 'Asia/Kolkata' };
    } catch(e) { return { locale: 'en-IN', tz: 'Asia/Kolkata' }; }
  }

  // BCP 47 locale for the outlet (e.g. 'en-IE' for Ireland, 'de-DE' for Germany)
  window.RS_getOutletLocale = function() {
    return getOutletCountryEntry().locale || 'en-IN';
  };

  // IANA timezone for the outlet (e.g. 'Europe/Dublin' for Ireland)
  window.RS_getOutletTimezone = function() {
    return getOutletCountryEntry().tz || 'Asia/Kolkata';
  };

  // Narrow no-break space (\u202f) gives visible gap without wrapping.
  // Number grouping uses outlet locale so Irish bills show 1,000 not 1,00,000.
  const rs = n => getCurrencySymbol() + '\u202f' + Math.round(n).toLocaleString(window.RS_getOutletLocale());
  const avatarColors = ['#FF4F00','#5B6C8F','#2A9B8F','#1F8A5B','#C47B16'];
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  /* ---------- THEME ---------- */
  const root = document.documentElement;
  function setTheme(t){ root.setAttribute('data-theme', t); const i = $('#theme-toggle-i'); if(i) i.className = t==='dark'?'fa-solid fa-moon':'fa-solid fa-sun'; try{localStorage.setItem('rs-theme',t)}catch(e){} }
  setTheme((()=>{try{return localStorage.getItem('rs-theme')||'light'}catch(e){return 'light'}})());
  $('#theme-toggle')?.addEventListener('click', ()=> setTheme(root.getAttribute('data-theme')==='dark'?'light':'dark'));

  /* ---------- SIDEBAR COLLAPSE ---------- */
  const app = $('#app');
  $('#sb-collapse')?.addEventListener('click', ()=>{ app.classList.toggle('collapsed'); try{localStorage.setItem('rs-collapsed', app.classList.contains('collapsed'))}catch(e){} });
  try{ if(localStorage.getItem('rs-collapsed')==='true') app.classList.add('collapsed'); }catch(e){}

  /* ---------- TAB SWITCHING ---------- */
  const isSuperAdmin = () => {
    const sess = window.RS_API ? RS_API.session() : null;
    return !!(sess && sess.role === 'superadmin');
  };

  function renderImpersonationBanner() {
    const existing = document.getElementById('rs-impersonation-banner');
    const info = window.RS_API && RS_API.impersonation ? RS_API.impersonation() : null;
    if (!info) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'rs-impersonation-banner';
    banner.className = 'rs-impersonation-banner';
    banner.innerHTML = `
      <div>
        <strong><i class="fa-solid fa-user-shield"></i> Viewing as ${_e(info.name || info.slug || 'client workspace')}</strong>
        <span>${_e(info.slug || info.id || '')}</span>
      </div>
      <button type="button" id="rs-exit-impersonation-btn"><i class="fa-solid fa-arrow-left"></i> Exit to Super-Admin</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('rs-exit-impersonation-btn')?.addEventListener('click', () => {
      try {
        if (window.RS_API && RS_API.exitTenantImpersonation && RS_API.exitTenantImpersonation()) {
          location.href = 'dashboard.html#super-admin-tab';
          location.reload();
        }
      } catch (err) {
        toast('Could not return to Super-Admin: ' + (err.message || err), 'fa-circle-exclamation');
      }
    });
  }

  async function openTenantDashboard(tenant, button) {
    if (!tenant) return toast('Tenant details not found.', 'fa-circle-exclamation');
    const previous = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    try {
      if (!window.RS_API || !RS_API.impersonateTenant) throw new Error('Impersonation is not available.');
      const status = String(tenant.status || '').toLowerCase();
      if (status && status !== 'approved' && status !== 'active') {
        throw new Error('Only active workspaces can be opened. Current status: ' + status);
      }
      await RS_API.impersonateTenant(tenant);
      toast(`Opening ${tenant.name || tenant.tenant_name || tenant.slug || 'workspace'} dashboard...`, 'fa-arrow-right-to-bracket');
      // Full navigation (not href+reload race) so the client shell loads cleanly
      location.assign('dashboard.html?appv=' + encodeURIComponent(window.__RESTROSUITE_ASSET_VERSION__ || '') + '#pos-tab');
    } catch (err) {
      console.error('[openTenantDashboard]', err);
      toast('Could not open workspace: ' + (err.message || err), 'fa-circle-exclamation');
      if (button) {
        button.disabled = false;
        button.innerHTML = previous;
      }
    }
  }
  // Super-admin module (separate IIFE) calls this — must be global
  window.openTenantDashboard = openTenantDashboard;

  const titles = {
    'pos-tab':['Point of Sale','Ring up takeaway & dine-in orders'],
    'qr-orders-tab':['QR Orders','Incoming orders from tables & delivery'],
    'bills-tab':['Bill History','Search, filter & refund completed transactions'],
    'inventory-tab':['Inventory','Stock levels, batch expiry & ordering thresholds'],
    'editor-tab':['Menu Editor','Add, modify & organize catalog categories & items'],
    'reports-tab':['Sales Reports','Revenue, payments & tax analytics'],
    'kds-tab':['Kitchen Display','Live cooking queue & prep timers'],
    'growth-hub-tab':['Growth Hub','Reservations, offers, support & more'],
    'employees-tab':['Employee Ledger','Team, roles, shifts & payroll'],
    'super-admin-tab':['SaaS Super-Admin','Platform-wide tenants & metrics'],
    'gateway-monitor-tab':['Gateway Monitor','WhatsApp gateway health & logs'],
    'chain-dashboard-tab':['Chain Dashboard','Consolidated reporting, catalog & logistics']
  };
  const rendered = {};
  function renderRegisteredTab(tabId) {
    if (!renderers[tabId]) return;
    if (tabId === 'growth-hub-tab' && renderers[tabId] !== renderGrowthHub) {
      renderers[tabId]();
    } else if (tabId === 'growth-hub-tab') {
      renderGrowthHub();
    } else {
      renderers[tabId]();
    }
  }

  async function activateTab(id){
    const sess = window.RS_API ? RS_API.session() : null;
    const isSuper = sess && sess.role === 'superadmin';
    const isBrandAdmin = sess && sess.role === 'brand_admin';

    if (isSuper) {
      if (id !== 'super-admin-tab' && id !== 'gateway-monitor-tab') {
        id = 'super-admin-tab';
      }
    } else if (isBrandAdmin) {
      if (id !== 'chain-dashboard-tab') {
        id = 'chain-dashboard-tab';
      }
    } else {
      if (id === 'super-admin-tab' || id === 'gateway-monitor-tab' || id === 'chain-dashboard-tab') {
        id = 'pos-tab';
      }
      // Route-level role enforcement: hiding sidebar links is cosmetic --
      // saved tabs, URL hashes, global search and the mobile "More" sheet
      // could all still open a restricted screen. Block them here so a
      // Kitchen/Cashier/Waiter login can never land on a tab outside its
      // role's allowed list (audit findings #1 and #2).
      const roleInfo = window.RS_ROLE;
      if (roleInfo && Array.isArray(roleInfo.allowedTabs) && roleInfo.allowedTabs.length) {
        const permitted = roleInfo.allowedTabs.slice();
        // Managers may open Settings (Plan & Billing / Danger Zone are
        // additionally gated inside the Settings screen itself).
        if (roleInfo.staffRole === 'manager') permitted.push('settings-tab');
        if (!permitted.includes(id)) id = permitted[0];
      }
    }

    // Wave 2: ensure lazy feature modules for this tab are loaded first
    try {
      if (window.RS_ensureTabModules) await window.RS_ensureTabModules(id);
    } catch (e) {
      console.warn('[activateTab] module load failed', e);
    }

    $$('.tab-content').forEach(t=>t.classList.toggle('active', t.id===id));
    $$('.sidebar-link').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    $$('.mnav-link').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    // Mobile POS checkout bar only belongs to the POS tab
    try {
      updateMobileCartBar();
    } catch(e){}
    document.querySelectorAll('.more-sheet-link[data-tab]').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    try { updateTabAttentionBlinking(); } catch(e){}
    const meta = titles[id]; if(meta){ $('#page-title').textContent = meta[0]; $('#page-sub').textContent = meta[1]; }
    $('.content').scrollTop = 0; window.scrollTo(0,0);
    if(!rendered[id] && renderers[id]){ renderRegisteredTab(id); rendered[id]=true; }
    else if(rendered[id] && id === 'gateway-monitor-tab') { if(typeof startSaaSGatewayPolling === 'function') startSaaSGatewayPolling(); }
    if(id !== 'gateway-monitor-tab') { if(typeof stopSaaSGatewayPolling === 'function') stopSaaSGatewayPolling(); }
    try{ history.replaceState(null,'','#'+id); }catch(e){}
    // Save active tab to localStorage
    try { localStorage.setItem('rs_active_tab', id); } catch(e){}
  }

  // Early role-home map (must exist before hydrate may call loadSavedTab)
  const ROLE_HOME_TAB_EARLY = {
    cashier: 'pos-tab',
    waiter: 'floor-tab',
    captain: 'floor-tab',
    kitchen: 'kds-tab',
    inventory: 'inventory-tab',
    manager: 'pos-tab',
    customer_display: 'tokens-tab',
  };

  // Load saved active tab on startup (hash wins; else role home)
  function loadSavedTab() {
    try {
      const hashTab = window.location.hash.slice(1);
      const role = String(sessionStorage.getItem('logged_in_role') || '').toLowerCase().trim();
      const home = ROLE_HOME_TAB_EARLY[role] || 'pos-tab';
      const initialTab = hashTab || home;
      activateTab(initialTab);
    } catch(e){
      activateTab('pos-tab');
    }
  }
  $$('.sidebar-link, .mnav-link').forEach(l=> l.addEventListener('click', e=>{ e.preventDefault(); activateTab(l.dataset.tab); }));
  document.querySelectorAll('.more-sheet-link[data-tab]').forEach(l=> l.addEventListener('click', e=>{ e.preventDefault(); activateTab(l.dataset.tab); }));

  /* Support is a direct top-bar call button (no ⋯ menu) */

  /* ---------- TOAST ---------- */
  let toastT;
  function toast(msg, icon='fa-circle-check', onClick=null){
    const el=$('#toast');
    el.innerHTML=`<i class="fa-solid ${_e(icon)}"></i> ${_e(msg)}`;
    el.classList.add('show');
    if (onClick) {
      el.style.cursor = 'pointer';
      el.onclick = (e) => {
        e.preventDefault();
        onClick();
        el.classList.remove('show');
      };
    } else {
      el.style.cursor = '';
      el.onclick = null;
    }
    clearTimeout(toastT);
    toastT=setTimeout(()=>{
      el.classList.remove('show');
      if (onClick) el.onclick = null;
    }, onClick ? 8000 : 2600);
  }
  window.__toast = toast;

  // Guarantees a toast only ever fires AFTER the async action it describes has
  // actually resolved: success toast on fulfillment, failure toast on rejection.
  // Use this for any toast tied to a database/cloud write so the UI never claims
  // something is "saved"/"sent"/"updated" before that's actually true.
  //   await withToast(RS_DB.put('bills', id, row), {
  //     success: 'Bill saved', error: 'Could not save bill -- try again'
  //   });
  async function withToast(promise, { success, error, successIcon = 'fa-circle-check', errorIcon = 'fa-circle-exclamation' } = {}) {
    try {
      const result = await promise;
      if (success) toast(typeof success === 'function' ? success(result) : success, successIcon);
      return result;
    } catch (err) {
      console.warn('[withToast] action failed', err);
      if (error) toast(typeof error === 'function' ? error(err) : error, errorIcon);
      throw err;
    }
  }
  window.withToast = withToast;

  const appVersion = window.__RESTROSUITE_ASSET_VERSION__ || 'v36-20260708';
  // Quiet version chip on the top bar
  (function(){
    const el = document.getElementById('app-version-pill');
    if(el) {
      const short = appVersion.split('-')[0];
      el.textContent = short;
      el.classList.add('tb-version');
      el.setAttribute('data-tooltip', 'App version: ' + appVersion);
      el.title = 'App version: ' + appVersion;
    }
  })();
  const updateSignatureKey = 'rs_update_signature';
  const updateSnapshotKey = 'rs_pre_update_snapshot';

  function pad2(value) { return String(value).padStart(2, '0'); }
  function dateKey(date = new Date()) { return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`; }
  function shortDateKey(date = new Date()) { return `${String(date.getFullYear()).slice(-2)}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`; }
  function fileDate(date = new Date()) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
  function sequenceScope() {
    // Tab-scoped only — never fall back to shared localStorage tenant_id.
    return sessionStorage.getItem('tenant_id') || sessionStorage.getItem('tenant_slug') || 'local';
  }
  function hashCode(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return hash;
  }
  function nextLogicalNo(prefix, existingValues = [], opts = {}) {
    const day = opts.day || shortDateKey();
    const width = opts.width || 3;
    const cleanPrefix = String(prefix || 'NO').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'NO';
    const start = `${cleanPrefix}-${day}-`;
    const re = new RegExp('^' + cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-' + day + '-(\\d+)', 'i');
    const maxExisting = (existingValues || []).reduce((max, value) => {
      const raw = typeof value === 'string' ? value : String((value && (value.no || value.orderId || value.draftId || value.poNumber || value.ticketNumber || value.id)) || '');
      const match = raw.match(re);
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0);
    const key = `rs_seq:${sequenceScope()}:${cleanPrefix}:${day}`;
    let stored = 0;
    try { stored = Number(localStorage.getItem(key) || 0) || 0; } catch (_) {}
    const next = Math.max(stored, maxExisting) + 1;
    try { localStorage.setItem(key, String(next)); } catch (_) {}
    return `${start}${String(next).padStart(width, '0')}`;
  }
  function formatDisplayOrderId(order) {
    const raw = String((order && (order.displayOrderId || order.displayNo || order.orderId || order.id)) || order || '').trim();
    if (!raw) return '-';
    let match = raw.match(/^DO-(QR|WTR)-(\d{6})-(\d{3,})(?:-[A-Z0-9]+)?$/i);
    if (match) return `${match[1].toUpperCase()}-${match[2]}-${match[3]}`;
    match = raw.match(/^(QR|WTR|KOT|ORD)-(\d{6})-(\d{3,})/i);
    if (match) return `${match[1].toUpperCase()}-${match[2]}-${match[3]}`;
    if (/^DO-QR-/i.test(raw)) {
      const id = order && order.id != null ? String(order.id) : raw;
      const n = Number(id);
      if (Number.isFinite(n)) return `QR-${String(Math.abs(n) % 1000).padStart(3, '0')}`;
      return `QR-${String(Math.abs(hashCode(id)) % 1000).padStart(3, '0')}`;
    }
    if (/^DO-WTR-/i.test(raw)) {
      const id = order && order.id != null ? String(order.id) : raw;
      const n = Number(id);
      if (Number.isFinite(n)) return `WTR-${String(Math.abs(n) % 1000).padStart(3, '0')}`;
      return `WTR-${String(Math.abs(hashCode(id)) % 1000).padStart(3, '0')}`;
    }
    return raw;
  }
  // Wave 5: prefer extracted module (assets/modules/bill-identity.js) when loaded
  function nextBillNo(existingBills = []) {
    if (window.RSBillIdentity && typeof RSBillIdentity.nextBillNo === 'function') {
      return RSBillIdentity.nextBillNo(existingBills);
    }
    // Local fallback sequence (offline / server RPC unavailable).
    const key = shortDateKey();
    const prefix = `RS-${key}-`;
    const maxFromList = (existingBills || []).reduce((highest, bill) => {
      const no = String((bill && (bill.no || bill.orderId || bill.id)) || '');
      if (!no.startsWith(prefix)) return highest;
      const seq = Number.parseInt(no.slice(prefix.length), 10);
      return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
    }, 0);
    let tenant = 'local';
    try {
      const s = (window.RS_API && RS_API.session && RS_API.session()) || {};
      tenant = s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'local';
    } catch (_) {}
    const seqKey = `rs_bill_seq:${tenant}:${key}`;
    let stored = 0;
    try { stored = Number(localStorage.getItem(seqKey) || 0) || 0; } catch (_) {}
    const next = Math.max(maxFromList, stored) + 1;
    try { localStorage.setItem(seqKey, String(next)); } catch (_) {}
    return `${prefix}${String(next).padStart(3, '0')}`;
  }

  async function allocateBillNo(existingBills = [], channel) {
    if (window.RSBillIdentity && typeof RSBillIdentity.allocateBillNo === 'function') {
      return RSBillIdentity.allocateBillNo(existingBills, channel);
    }
    const day = shortDateKey();
    const ch = String(channel || '').toLowerCase();
    const chCode = ch.includes('deliver') || ch.includes('online') ? 'DL'
      : (ch.includes('take') || ch.includes('parcel') ? 'TK' : 'DI');
    try {
      if (window.RS_API && typeof RS_API.data === 'function' && !RS_API.zeroCostLaunchMode && navigator.onLine !== false) {
        const res = await Promise.race([
          RS_API.data({ operation: 'next_bill_no', day }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('next_bill_no timeout')), 4000)),
        ]);
        let no = (res && (res.no || res.order_id || res.data)) || null;
        if (no && typeof no === 'string' && /^RS-\d{6}-\d+$/i.test(no)) {
          try {
            const s = (RS_API.session && RS_API.session()) || {};
            const tenant = s.tenant_id || s.tenant_slug || sessionStorage.getItem('tenant_slug') || 'local';
            const seq = Number.parseInt(String(no).split('-').pop(), 10);
            if (Number.isFinite(seq)) {
              const seqKey = `rs_bill_seq:${tenant}:${day}`;
              const stored = Number(localStorage.getItem(seqKey) || 0) || 0;
              if (seq > stored) localStorage.setItem(seqKey, String(seq));
            }
          } catch (_) {}
          no = no.replace(/^RS-/, 'RS-' + chCode + '-');
          return no;
        }
      }
    } catch (e) {
      console.warn('[BillNo] server allocate failed, using local sequence:', e && e.message);
    }
    const local = nextBillNo(existingBills);
    return String(local).replace(/^RS-/, 'RS-' + chCode + '-');
  }

  function newBillIdentity(billNo) {
    if (window.RSBillIdentity && typeof RSBillIdentity.newBillIdentity === 'function') {
      return RSBillIdentity.newBillIdentity(billNo);
    }
    const idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('idem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    const id = Date.now() + Math.floor(Math.random() * 1000);
    return { id, idempotencyKey, no: billNo };
  }

  function ensureOperationStatusBar() {
    let bar = document.getElementById('global-operation-status');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'global-operation-status';
    bar.className = 'operation-status-bar';
    bar.innerHTML = `
      <div class="operation-status-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
      <div class="operation-status-copy">
        <div class="operation-status-title">Working...</div>
        <div class="operation-status-track"><span></span></div>
      </div>`;
    document.body.appendChild(bar);
    return bar;
  }

  function setOperationStatus(message, state = 'running') {
    const bar = ensureOperationStatusBar();
    const icon = bar.querySelector('.operation-status-icon i');
    const title = bar.querySelector('.operation-status-title');
    title.textContent = message;
    icon.className = state === 'success'
      ? 'fa-solid fa-circle-check'
      : state === 'error'
        ? 'fa-solid fa-circle-exclamation'
        : 'fa-solid fa-spinner fa-spin';
    bar.className = `operation-status-bar is-visible is-${state}`;
    return bar;
  }

  function finishOperationStatus(message, state = 'success') {
    const bar = setOperationStatus(message, state);
    window.setTimeout(() => bar.classList.remove('is-visible'), state === 'error' ? 4200 : 2300);
  }

  async function runWithOperation(message, action, button) {
    const oldHtml = button ? button.innerHTML : '';
    const oldDisabled = button ? button.disabled : false;
    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Working';
      }
      setOperationStatus(message);
      const result = await action();
      finishOperationStatus('Done');
      return result;
    } catch (error) {
      finishOperationStatus(error.message || 'Work failed', 'error');
      throw error;
    } finally {
      if (button) {
        button.disabled = oldDisabled;
        button.innerHTML = oldHtml;
      }
    }
  }

  function savePreUpdateSnapshot() {
    const snapshot = {
      savedAt: new Date().toISOString(),
      version: appVersion,
      tenant: {
        id: sessionStorage.getItem('tenant_id') || '',
        slug: sessionStorage.getItem('tenant_slug') || '',
        role: sessionStorage.getItem('logged_in_role') || ''
      },
      activeTab: document.querySelector('.tab-content.active')?.id || '',
      cart: (window.RSPosUI && RSPosUI.getCart) ? RSPosUI.getCart() : (typeof cart !== 'undefined' ? cart : []),
      discountPct: (window.RSPosUI && RSPosUI.getDiscountPct) ? RSPosUI.getDiscountPct() : (typeof discountPct !== 'undefined' ? discountPct : 0)
    };
    try {
      localStorage.setItem(updateSnapshotKey, JSON.stringify(snapshot));
    } catch (e) {
      console.warn('[Snapshot Warning] Failed to save pre-update snapshot:', e);
    }
    return snapshot;
  }

  function showAppliedUpdateNotice() {
    const appliedAt = sessionStorage.getItem('rs_update_applied_at');
    if (!appliedAt) return;
    // Clear flag is handled by onboarding.js to coordinate guided tour popup
    toast('RestroSuite updated successfully', 'fa-cloud-arrow-down');
  }

  async function fetchUpdateRelease() {
    try {
      const isFile = location.protocol === 'file:';
      const url = isFile ? 'app-update.json' : `app-update.json?v=${Date.now()}`;
      const response = await fetch(url, isFile ? {} : { cache: 'no-store' });
      if (!response.ok) return null;
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  function getFileHashFromSignature(sig, filename) {
    if (!sig) return null;
    const parts = sig.split('|');
    for (const part of parts) {
      const sub = part.split(':');
      if (sub[0] === filename) return sub[2] || null;
    }
    return null;
  }

  async function buildUpdateSignature() {
    const files = [
      'dashboard.html',
      'assets/restrosuite.css',
      'assets/dashboard.css',
      'assets/features.css',
      'assets/supabase-config.js',
      'assets/doppio-api.js',
      'assets/db.js',
      'assets/dashboard.js',
      'assets/features-pos.js',
      'assets/features-editor.js',
      'assets/features-manage.js',
      'assets/features-growth.js',
      'assets/features-extra.js',
      'assets/features-shell.js',
      'app-update.json'
    ];
    const parts = [];
    for (const file of files) {
      try {
        const isFile = location.protocol === 'file:';
        const url = isFile ? file : `${file}?check=${Date.now()}`;
        const response = await fetch(url, isFile ? {} : { cache: 'no-store' });
        if (!response.ok) continue;
        const text = await response.text();
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
        parts.push(`${file}:${text.length}:${hash}`);
      } catch (_) {}
    }
    return parts.join('|');
  }

  function showUpdateDialog(releaseInfo, signature) {
    if (document.getElementById('app-update-dialog')) return;
    let info = releaseInfo || {};
    let highlights = Array.isArray(info.highlights) ? info.highlights : [];

    // Fallback to generic system patch details ONLY if releaseInfo is missing title or version
    if (!info.title || !info.version) {
      info = {
        version: 'System patch',
        date: new Date().toLocaleDateString('en-CA'),
        title: 'System stability hotfix',
        summary: 'This update applies under-the-hood code improvements to enhance security, responsiveness, and dashboard stability.'
      };
      highlights = [
        'Codebase reliability and security updates',
        'Performance enhancements and database synchronization tuning',
        'Real-time update check and notification fixes'
      ];
    }

    const modal = document.createElement('div');
    modal.id = 'app-update-dialog';
    modal.className = 'app-update-dialog is-visible';
    modal.innerHTML = `
      <div class="app-update-card" role="dialog" aria-modal="true" aria-labelledby="app-update-title">
        <div class="app-update-eyebrow">System update</div>
        <h2 id="app-update-title">New RestroSuite update is ready</h2>
        <div class="app-update-version">${info.version || 'Latest version'}${info.date ? ' - ' + info.date : ''}</div>
        <p>Your active work will be saved on this device before the update is applied.</p>
        <div class="app-update-release">
          <div class="app-update-release-title">${info.title || 'Workflow improvements'}</div>
          <p>${info.summary || 'This update improves billing, importing, exports, sync, and dashboard stability.'}</p>
          <ul>${highlights.map(item => `<li>${item}</li>`).join('')}</ul>
        </div>
        <div class="app-update-save-row">
          <i class="fa-solid fa-shield-halved"></i>
          <span id="app-update-save-status">Ready to save current dashboard data.</span>
        </div>
        <div class="app-update-progress-track" style="display:none; width:100%; height:4px; background:var(--stroke-2); border-radius:99px; margin-top:8px; overflow:hidden;">
          <div id="app-update-progress-bar" style="width:0%; height:100%; background:var(--orange); transition:width .2s var(--ease);"></div>
        </div>
        <div class="app-update-actions">
          <button type="button" class="btn btn-ghost" id="app-update-later-btn">Later</button>
          <button type="button" class="btn btn-primary" id="app-update-now-btn"><i class="fa-solid fa-rotate"></i> Save & Update</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#app-update-later-btn').onclick = () => modal.remove();
    modal.querySelector('#app-update-now-btn').onclick = async () => {
      try {
        const btnNow = modal.querySelector('#app-update-now-btn');
        const btnLater = modal.querySelector('#app-update-later-btn');
        btnNow.disabled = true;
        btnLater.disabled = true;
        
        const track = modal.querySelector('.app-update-progress-track');
        const bar = modal.querySelector('#app-update-progress-bar');
        const status = modal.querySelector('#app-update-save-status');
        
        if(track) track.style.display = 'block';
        
        const steps = [
          { pct: 20, text: 'Securing active session...' },
          { pct: 40, text: 'Backing up active cart items...' },
          { pct: 60, text: 'Archiving current layout state...' },
          { pct: 80, text: 'Writing snapshot to secure storage...' },
          { pct: 100, text: 'Applying system updates...' }
        ];
        
        for (const step of steps) {
          status.textContent = step.text;
          if(bar) bar.style.width = step.pct + '%';
          if (step.pct === 80) {
            try {
              savePreUpdateSnapshot();
            } catch (e) {
              console.warn('[Update Warning] Snapshot failed:', e);
            }
          }
          await new Promise(r => setTimeout(r, 220));
        }
        
        try {
          localStorage.setItem(updateSignatureKey, signature || '');
        } catch (e) {
          console.warn('[Update Warning] Failed to write signature:', e);
        }
        try {
          sessionStorage.setItem('rs_update_applied_at', new Date().toISOString());
        } catch (e) {
          console.warn('[Update Warning] Failed to write session flag:', e);
        }

        const url = new URL(window.location.href);
        url.searchParams.set('appv', (info.version || Date.now()).toString().replace(/[^a-zA-Z0-9._-]/g, ''));
        
        // Fail-safe reload fallback (triggers after 1.5 seconds if location.replace hangs)
        setTimeout(() => {
          window.location.reload();
        }, 1500);

        window.location.replace(url.toString());
      } catch (err) {
        console.error('[Update Fatal Error] Failed during update:', err);
        window.location.reload();
      }
    };
  }

  // Expose show update dialog globally so the notification bell can trigger it
  window.RS_SHOW_UPDATE_DIALOG = () => {
    if (window.RS_APP_UPDATE) {
      showUpdateDialog(window.RS_APP_UPDATE.releaseInfo, window.RS_APP_UPDATE.signature);
    }
  };

  async function checkForAppUpdate({ silent = true } = {}) {
    const signature = await buildUpdateSignature();
    if (!signature) return;
    const previous = localStorage.getItem(updateSignatureKey);
    if (!previous) {
      localStorage.setItem(updateSignatureKey, signature);
      return;
    }
    if (previous !== signature) {
      const releaseInfo = await fetchUpdateRelease();
      const normFetched = String(releaseInfo && releaseInfo.version || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normCurrent = String(appVersion || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normFetched && normCurrent && normFetched === normCurrent) {
        localStorage.setItem(updateSignatureKey, signature);
        if (!silent) {
          toast('RestroSuite is already up to date', 'fa-circle-check');
        }
        return;
      }

      const prevJsonHash = getFileHashFromSignature(previous, 'app-update.json');
      const currJsonHash = getFileHashFromSignature(signature, 'app-update.json');
      const isJsonUpdated = prevJsonHash && currJsonHash && prevJsonHash !== currJsonHash;
      const dialogReleaseInfo = isJsonUpdated ? releaseInfo : null;

      window.RS_APP_UPDATE = { 
        releaseInfo: dialogReleaseInfo,
        signature, 
        detectedAt: Date.now(),
        isPatchOnly: !isJsonUpdated
      };
      document.dispatchEvent(new CustomEvent('rs:app_update_available'));
      if (!silent) {
        showUpdateDialog(dialogReleaseInfo, signature);
      } else {
        toast('New update is ready. Click to apply.', 'fa-cloud-arrow-down', () => showUpdateDialog(dialogReleaseInfo, signature));
      }
    } else if (!silent) {
      toast('RestroSuite is already up to date', 'fa-circle-check');
    }
  }

  /* ============================================================
     MENU DATA
     ============================================================ */
  const MENU = [];
  const CATS = ['All','Starters','Mains','Breads','Beverages','Desserts'];
  const CAT_COLOR = { Starters:'#FF4F00', Mains:'#5B6C8F', Breads:'#C47B16', Beverages:'#2A9B8F', Desserts:'#B45A6A' };
  const catColor = c => CAT_COLOR[c] || 'var(--orange)';
  const stockLabel = {ok:'In stock',low:'Low',out:'Out'};
  const stockCls = {ok:'stock-ok',low:'stock-low',out:'stock-out'};

  /* ============================================================
     TAX — Wave 12: assets/modules/tax-helpers.js
     Share the same array instance the module owns.
     ============================================================ */
  const TAX_RATES =
    (window.RSTax && Array.isArray(RSTax.TAX_RATES) && RSTax.TAX_RATES) ||
    (Array.isArray(window.RS_TAX_RATES) && window.RS_TAX_RATES) ||
    (window.RS_TAX_RATES = []);
  window.RS_TAX_RATES = TAX_RATES;

  /* ============================================================
     POS UI — Wave 11: assets/modules/pos-ui.js
     Cart state lives in RSPosUI; tax helpers in tax-helpers.js.
     ============================================================ */
  let activeCat = 'All';
  let cart = [];
  let discountPct = 0;
  // Legacy bindings kept so any residual free refs don't throw before module loads.
  // Preferred path: RS / RSPosUI.
  const renderPOS = () => {
    if (window.RSPosUI && RSPosUI.renderPOS) return RSPosUI.renderPOS();
  };
  function refreshPosCats() {
    if (window.RSPosUI && RSPosUI.refreshPosCats) return RSPosUI.refreshPosCats();
  }
  window.refreshPosCats = refreshPosCats;
  function updateMobileCartBar(countArg, totalsArg) {
    if (window.RSPosUI && RSPosUI.updateMobileCartBar) return RSPosUI.updateMobileCartBar(countArg, totalsArg);
  }
  function openMobilePOSCart() {
    if (window.RSPosUI && RSPosUI.openMobilePOSCart) return RSPosUI.openMobilePOSCart();
  }
  function closeMobilePOSCart(v) {
    if (window.RSPosUI && RSPosUI.closeMobilePOSCart) return RSPosUI.closeMobilePOSCart(v);
  }
  function bindMobileCartBar() {
    if (window.RSPosUI && RSPosUI.bindMobileCartBar) return RSPosUI.bindMobileCartBar();
  }
  function addToCart(id) {
    if (window.RSPosUI && RSPosUI.addToCart) return RSPosUI.addToCart(id);
  }
  function changeQty(id, d) {
    if (window.RSPosUI && RSPosUI.changeQty) return RSPosUI.changeQty(id, d);
  }
  function renderCart() {
    if (window.RSPosUI && RSPosUI.renderCart) return RSPosUI.renderCart();
  }
  function getTotals() {
    if (window.RSPosUI && RSPosUI.getTotals) return RSPosUI.getTotals();
    return { sub: 0, disc: 0, gst: 0, grand: 0, count: 0, items: [], discountPct: 0 };
  }
  function clearCart() {
    if (window.RSPosUI && RSPosUI.clearCart) return RSPosUI.clearCart();
  }
  function getCustomer() {
    if (window.RSPosUI && RSPosUI.getCustomer) return RSPosUI.getCustomer();
    return { name: '', phone: '', gst: '', table: 'Walk-in / Takeaway' };
  }
  function runKotAction() {
    if (window.RSPosUI && RSPosUI.runKotAction) return RSPosUI.runKotAction();
  }
  function runCheckoutAction() {
    if (window.RSPosUI && RSPosUI.runCheckoutAction) return RSPosUI.runCheckoutAction();
  }
  function ensureCartActionDelegation() {
    if (window.RSPosUI && RSPosUI.ensureCartActionDelegation) return RSPosUI.ensureCartActionDelegation();
  }
  function wireCartActions() {
    if (window.RSPosUI && RSPosUI.wireCartActions) return RSPosUI.wireCartActions();
  }
  function initPOS() {
    if (window.RSPosUI && RSPosUI.initPOS) return RSPosUI.initPOS();
  }

  /* ============================================================
     QR ORDERS & KDS
     ============================================================ */
  const QR_ORDERS = [];

  const KDS = [];

  function parseOrderTimestamp(dateStr) {
    if (!dateStr) return null;
    // Locale d/m/y strings like "02/07/2026, 10:26 am" must be parsed as
    // d/m/y; the native Date parser reads them m/d/y (Feb 7 instead of
    // 2 July), which made order ages show as thousands of hours.
    const m = String(dateStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
    if (!m) {
      const nativeTime = new Date(dateStr).getTime();
      return Number.isNaN(nativeTime) ? null : nativeTime;
    }
    let [, d, mo, y, h, mi, s, meridiem] = m;
    let hour = Number(h);
    if (meridiem) {
      const pm = meridiem.toLowerCase() === 'pm';
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const parsed = new Date(Number(y), Number(mo) - 1, Number(d), hour, Number(mi), Number(s || 0)).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }

  function getRelativeTime(dateStr) {
    const ts = parseOrderTimestamp(dateStr);
    if (!ts) return 'just now';
    const elapsed = Date.now() - ts;
    const mins = Math.floor(elapsed / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  let pendingOrdersSyncInFlight = false;
  let pendingOrdersSyncQueued = false;
  let pendingOrdersSyncQueuedForceCloud = false;
  let lastPendingOrdersSyncAt = 0;
  const pendingOrdersSyncMinGapMs = 3000;

  async function syncPendingOrders(options) {
    const forceCloud = options === true || !!(options && options.forceCloud);
    const elapsed = Date.now() - lastPendingOrdersSyncAt;
    if (pendingOrdersSyncInFlight || (!forceCloud && elapsed < pendingOrdersSyncMinGapMs)) {
      pendingOrdersSyncQueuedForceCloud = pendingOrdersSyncQueuedForceCloud || forceCloud;
      if (!pendingOrdersSyncQueued) {
        pendingOrdersSyncQueued = true;
        window.setTimeout(() => {
          const queuedForceCloud = pendingOrdersSyncQueuedForceCloud;
          pendingOrdersSyncQueued = false;
          pendingOrdersSyncQueuedForceCloud = false;
          syncPendingOrders({ forceCloud: queuedForceCloud });
        }, forceCloud ? 500 : Math.max(500, pendingOrdersSyncMinGapMs - elapsed));
      }
      return;
    }
    pendingOrdersSyncInFlight = true;
    lastPendingOrdersSyncAt = Date.now();
    if (window.RS_DB) {
      try {
        let rows;
        if (forceCloud && RS_DB.isCloud && RS_DB.listCloud && RS_DB.writeLocal) {
          rows = await RS_DB.listCloud('pending_orders');
          await RS_DB.writeLocal('pending_orders', rows || []);
        } else {
          rows = await RS_DB.list('pending_orders');
        }
        rows = rows || [];

        // 1. Update KDS -- skipped entirely in POS-only mode: billing still
        // works and QR orders still land in the manager's own dashboard
        // (QR_ORDERS below), but nothing is ever queued to the kitchen
        // display or a waiter screen.
        const posOnlyMode = !!(window.RS_SETTINGS && RS_SETTINGS.set_pos_only_mode);
        if (posOnlyMode) {
          replaceArr(KDS, []);
        } else {
          const activeKds = rows.filter(r => r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review');
          const mappedKds = activeKds.map(r => ({
            id: r.id,
            tok: formatDisplayOrderId(r),
            type: `${r.orderType} · ${r.tableNumber}`,
            start: parseOrderTimestamp(r.dateTime) || Date.now(),
            prepMinutes: r.prepMinutes,
            prepStartedAt: r.prepStartedAt,
            items: (r.items || []).map(it => [String(it.qty), it.name, it.notes || ''])
          }));
          replaceArr(KDS, mappedKds);
        }

        // 2. Update QR_ORDERS — keep dateTime so UI can live-refresh relative ages
        const activeQr = rows.filter(r => r.status === 'Pending Review' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'served' || r.status === 'Ready');
        const mappedQr = activeQr.map(r => {
          const ts = parseOrderTimestamp(r.dateTime);
          return {
            id: r.id,
            orderId: r.orderId,
            table: r.tableNumber,
            customerName: r.customerName || '',
            customerPhone: r.customerPhone || '',
            orderType: r.orderType || 'Dine-in',
            dateTime: r.dateTime || null,
            start: ts || Date.now(),
            time: getRelativeTime(r.dateTime),
            status: r.status === 'Pending Review' ? 'pending' : ((r.status === 'preparing' || r.status === 'Accepted') ? 'preparing' : 'served'),
            items: (r.items || []).map(it => ({
              id: it.id,
              name: it.name || 'Item',
              qty: Number(it.qty || 1),
              price: Number(it.price || 0),
              taxCategory: it.taxCategory || it.tax_category,
              notes: it.notes || '',
              cat: it.cat || it.category || it.station || ''
            })),
            total: r.total
          };
        });
        replaceArr(QR_ORDERS, mappedQr);

        // Re-render KDS and QR boards
        try { renderKDS(); } catch(e){}
        try { renderQR(); } catch(e){}
        document.dispatchEvent(new CustomEvent('rs:pending_orders_synced'));
        try { updateTabAttentionBlinking(); } catch(e){}
        try { applyPosOnlyModeUI(); } catch(e){}
      } catch(e) {
        console.warn("syncPendingOrders failed", e);
        // Only show toast if user is likely watching the KDS/orders tab
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && (activeTab.id === 'kds-tab' || activeTab.id === 'pending-orders-tab')) {
          toast('Order sync issue -- retrying...', 'fa-rotate');
        }
      } finally {
        pendingOrdersSyncInFlight = false;
      }
    } else {
      pendingOrdersSyncInFlight = false;
    }
  }

  function updateTabAttentionBlinking() {
    const activeTabId = document.querySelector('.tab-content.active')?.id || document.querySelector('.sidebar-link.active')?.dataset.tab || document.querySelector('.mnav-link.active')?.dataset.tab;
    
    const hasPendingQr = (typeof QR_ORDERS !== 'undefined' && Array.isArray(QR_ORDERS))
      ? QR_ORDERS.some(o => String(o.status || '').toLowerCase() === 'pending')
      : false;
      
    const hasKdsOrders = (typeof KDS !== 'undefined' && Array.isArray(KDS))
      ? KDS.length > 0
      : false;
      
    const hasLowStock = (typeof INVENTORY !== 'undefined' && Array.isArray(INVENTORY))
      ? INVENTORY.some(i => Number(i.stock) < Number(i.min))
      : Number(window.__rsLowStockCount || 0) > 0;

    const hasNewOnline = Number(window.__rsOnlineNewCount || 0) > 0;
      
    document.querySelectorAll('.sidebar-link, .mnav-link').forEach(el => {
      const tab = el.dataset.tab;
      if (!tab) return;
      
      let shouldBlink = false;
      if (tab === 'qr-orders-tab' && hasPendingQr && activeTabId !== 'qr-orders-tab') {
        shouldBlink = true;
      } else if (tab === 'kds-tab' && hasKdsOrders && activeTabId !== 'kds-tab') {
        shouldBlink = true;
      } else if (tab === 'inventory-tab' && hasLowStock && activeTabId !== 'inventory-tab') {
        shouldBlink = true;
      } else if (tab === 'aggregator-tab' && hasNewOnline && activeTabId !== 'aggregator-tab') {
        shouldBlink = true;
      }
      
      el.classList.toggle('attention-blink', shouldBlink);
    });
  }
  window.RS = window.RS || {};
  window.RS.updateTabAttentionBlinking = updateTabAttentionBlinking;

  // POS-only mode (Settings -> Printers & KOT -> "POS-only mode"): billing
  // only, no order ever reaches the Kitchen Display or a waiter screen.
  // Hides the now-pointless KDS nav entry and the "Send KOT" button so the
  // UI doesn't offer actions that no longer do anything.
  function applyPosOnlyModeUI() {
    const posOnlyMode = !!(window.RS_SETTINGS && RS_SETTINGS.set_pos_only_mode);
    document.querySelectorAll('[data-tab="kds-tab"]').forEach(el => {
      el.style.display = posOnlyMode ? 'none' : '';
    });
    const kotBtn = document.getElementById('btn-kot');
    if (kotBtn) kotBtn.style.display = posOnlyMode ? 'none' : '';
    document.documentElement.classList.toggle('rs-pos-only-mode', posOnlyMode);
  }
  window.RS_applyPosOnlyModeUI = applyPosOnlyModeUI;

  // WhatsApp gateway down/up banner -- subscribes to gateway_health_log
  // (already written by whatsapp-gateway.js on every disconnect/connect,
  // realtime already enabled on this table) and shows a persistent,
  // continuously-blinking banner until the gateway reports back online.
  function showGatewayOfflineBanner(reason) {
    const bar = document.getElementById('rs-gateway-offline-banner');
    if (bar) bar.style.display = 'none';

    // Prefer shell badge updater (keeps More menu + compact pill consistent)
    if (typeof window.updateTopbarWhatsAppStatus === 'function') {
      // fall through — shell polling will set offline; also set immediate UI
    }
    if (window.setTopbarWhatsAppBadge) {
      // not exported — use DOM detail
    }
    const tbIcon = document.getElementById('tb-wa-icon');
    const tbLabel = document.getElementById('tb-wa-label');
    const friendly = (function (raw) {
      const s = String(raw || '').toLowerCase();
      if (!s) return 'WhatsApp is not connected. Open Settings → WhatsApp to link.';
      if (s.includes('stream') || s.includes('conflict')) return 'WhatsApp connection dropped. Reconnect in Settings → WhatsApp.';
      if (s.includes('timeout')) return 'WhatsApp took too long to respond. Try again in a moment.';
      if (s.includes('auth')) return 'Link expired. Scan the QR code again in Settings → WhatsApp.';
      if (s.length > 90 || /[{}\[\]<>]|error code|ECONN/i.test(String(raw))) {
        return 'WhatsApp is temporarily unavailable. Try reconnecting in Settings → WhatsApp.';
      }
      return 'WhatsApp is offline.';
    })(reason);
    if (tbIcon) {
      tbIcon.className = 'fa-brands fa-whatsapp tb-wa-icon';
      tbIcon.style.display = 'inline-block';
    }
    if (tbLabel) tbLabel.textContent = 'Off';
    const tbBtn = document.getElementById('tb-wa-status-btn');
    if (tbBtn) {
      tbBtn.classList.remove('wa-linked', 'wa-syncing', 'wa-qr', 'wa-starting', 'wa-auth-failure');
      tbBtn.classList.add('wa-offline');
      tbBtn.title = friendly;
      tbBtn.setAttribute('data-tooltip', friendly);
    }
  }
  function hideGatewayOfflineBanner() {
    const bar = document.getElementById('rs-gateway-offline-banner');
    if (bar) bar.style.display = 'none';

    if (window.updateTopbarWhatsAppStatus) {
      window.updateTopbarWhatsAppStatus();
    }
  }

  // Offline / pending-cloud-sync indicator. assets/db.js already saves every
  // write locally first and queues failed cloud writes in localStorage
  // ('rs:sync_queue') for retry -- but there was no visible sign of any of
  // this, so a save made while offline silently looked identical to a save
  // that actually reached the cloud. This small pill makes that state visible
  // and shows a live count while it's happening.
  function getSyncQueueLength() {
    try {
      const raw = localStorage.getItem('rs:sync_queue');
      if (!raw) return 0;
      const q = JSON.parse(raw);
      return Array.isArray(q) ? q.length : 0;
    } catch(e) { return 0; }
  }
  function updateOfflineSyncIndicator() {
    const count = getSyncQueueLength();
    const isOffline = !navigator.onLine;
    let pill = document.getElementById('rs-offline-sync-pill');
    if (!isOffline && count === 0) {
      if (pill) pill.style.display = 'none';
      return;
    }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'rs-offline-sync-pill';
      pill.className = 'attention-blink';
      pill.setAttribute('role', 'status');
      pill.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99997;' +
        'background:var(--warning-color,#F59E0B);color:#1a1a1a;padding:8px 14px;border-radius:999px;' +
        'font-size:12.5px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;max-width:88vw;';
      pill.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span id="rs-offline-sync-text"></span>';
      document.body.appendChild(pill);
    }
    const textEl = document.getElementById('rs-offline-sync-text');
    if (textEl) {
      if (isOffline) {
        textEl.textContent = count > 0
          ? `Offline -- ${count} change${count === 1 ? '' : 's'} waiting to sync`
          : 'Offline -- changes are being saved on this device';
      } else {
        textEl.textContent = `Syncing ${count} change${count === 1 ? '' : 's'} to the cloud...`;
      }
    }
    pill.style.display = 'flex';
  }
  window.addEventListener('online', updateOfflineSyncIndicator);
  window.addEventListener('offline', updateOfflineSyncIndicator);
  window.addEventListener('rs:cloud-fallback', updateOfflineSyncIndicator);
  window.addEventListener('rs:sync-queue-drained', updateOfflineSyncIndicator);
  window.addEventListener('rs:sync-done', updateOfflineSyncIndicator);
  setInterval(updateOfflineSyncIndicator, 5000);
  if (document.readyState !== 'loading') updateOfflineSyncIndicator();
  else document.addEventListener('DOMContentLoaded', updateOfflineSyncIndicator);
  window.RS_updateOfflineSyncIndicator = updateOfflineSyncIndicator;

  function setupSupabaseRealtime() {
    const api = window.RS_API;
    if (api && api.supabaseClient && window.RS_DB && RS_DB.isCloud) {
      const activeTenantId = api.session()?.tenant_id || sessionStorage.getItem('tenant_id');
      if (activeTenantId) {
        api.supabaseClient.channel('doppio-pending-orders-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_pending_orders', filter: `tenant_id=eq.${activeTenantId}` }, () => {
            syncPendingOrders({ forceCloud: true });
          }).subscribe();
      }
      // Only admin/manager roles need to see (and act on) this -- avoid
      // alarming waiter/kitchen screens with something they can't fix.
      const role = (sessionStorage.getItem('logged_in_role') || '').toLowerCase();
      if (role === 'admin' || role === 'manager' || role === 'owner' || role === 'superadmin') {
        api.supabaseClient.channel('doppio-gateway-health-realtime')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gateway_health_log' }, (payload) => {
            const row = payload && payload.new;
            if (!row) return;
            if (row.event === 'disconnected') {
              showGatewayOfflineBanner(row.details && row.details.reason);
            } else if (row.event === 'connected' || row.event === 'online') {
              hideGatewayOfflineBanner();
            }
          }).subscribe();
      }

      // Live role/permission sync: when an admin changes this staff member's
      // role or allowed tabs in Team & Roles, apply it to this open session
      // immediately instead of requiring them to log out and back in.
      // session_version-based forced revocation (a real security action,
      // e.g. deactivating someone) is handled separately and still works --
      // this only covers routine "give them one more tab" style edits.
      const currentUserId = sessionStorage.getItem('tenant_user_id');
      const currentRoleForSub = (api.session && api.session()?.role) || sessionStorage.getItem('logged_in_role') || '';
      if (currentUserId && currentRoleForSub !== 'superadmin' && currentRoleForSub !== 'brand_admin') {
        api.supabaseClient.channel('doppio-tenant-user-role-realtime')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenant_users', filter: `id=eq.${currentUserId}` }, (payload) => {
            const row = payload && payload.new;
            if (!row) return;
            if (window.RS_applyLiveRoleUpdate) {
              window.RS_applyLiveRoleUpdate(row.role, row.allowed_tabs);
            }
          }).subscribe();
      }
    }
    // Fallback: postgres_changes events are silently dropped for anon
    // subscribers when RLS denies SELECT on the table (production locks
    // all tables behind Edge Functions). Poll while the app is visible so
    // new QR orders surface quickly even without realtime events.
    // Active QR / KDS tabs poll every 4s; background tabs every 12s.
    if (!window.__rsPendingOrdersPollTimer) {
      const pollPending = () => {
        if (document.hidden) return;
        syncPendingOrders({ forceCloud: true });
      };
      const armPoll = () => {
        if (window.__rsPendingOrdersPollTimer) clearInterval(window.__rsPendingOrdersPollTimer);
        const activeId = document.querySelector('.tab-content.active')?.id || '';
        const hot = activeId === 'qr-orders-tab' || activeId === 'kds-tab' || activeId === 'online-orders-tab';
        window.__rsPendingOrdersPollTimer = setInterval(pollPending, hot ? 4000 : 12000);
      };
      armPoll();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          pollPending();
          armPoll();
        }
      });
      // Re-arm when staff switch tabs so the QR board stays snappy.
      document.addEventListener('click', (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest('[data-tab], .nav-item, .sb-item, .tab-btn')) {
          setTimeout(armPoll, 50);
        }
      }, true);
      window.__rsArmPendingOrdersPoll = armPoll;
    }
  }

  window.RS_SYNC = { syncPendingOrders, setupSupabaseRealtime };

  /* ============================================================
     QR ORDERS UI — Wave 10: assets/modules/qr-orders-ui.js
     ============================================================ */
  async function openQrOrderInPos(order) {
    if (window.RSQrOrdersUI && RSQrOrdersUI.openQrOrderInPos) {
      return RSQrOrdersUI.openQrOrderInPos(order);
    }
  }
  const renderQR = () => {
    if (window.RSQrOrdersUI && RSQrOrdersUI.renderQR) return RSQrOrdersUI.renderQR();
  };

  /* ============================================================
     BILLS — Wave 6: UI lives in assets/modules/bills-history.js
     Array stays here so RS.BILLS reference remains stable for POS.
     ============================================================ */
  const BILLS = [];
  function receiptPayloadFromBill(b) {
    if (window.RSBillsHistory && RSBillsHistory.receiptPayloadFromBill) {
      return RSBillsHistory.receiptPayloadFromBill(b);
    }
    return { no: (b && (b.no || b.id)) || 'Invoice', items: [], sub: 0, disc: 0, gst: 0, grand: Number((b && b.amount) || 0), tenders: [], change: 0 };
  }
  function showBillReceipt(b) {
    if (window.RSBillsHistory && RSBillsHistory.showBillReceipt) return RSBillsHistory.showBillReceipt(b);
  }
  function shareBillReceipt(b) {
    if (window.RSBillsHistory && RSBillsHistory.shareBillReceipt) return RSBillsHistory.shareBillReceipt(b);
  }
  async function markBillRefunded(b) {
    if (window.RSBillsHistory && RSBillsHistory.markBillRefunded) return RSBillsHistory.markBillRefunded(b);
  }
  async function deleteBill(b) {
    if (window.RSBillsHistory && RSBillsHistory.deleteBill) return RSBillsHistory.deleteBill(b);
  }
  const renderBills = () => {
    if (window.RSBillsHistory && RSBillsHistory.renderBills) return RSBillsHistory.renderBills();
  };

  /* ============================================================
     INVENTORY — Wave 7: UI lives in assets/modules/inventory-ui.js
     Array stays here so RS.INVENTORY reference remains stable.
     ============================================================ */
  const INVENTORY = [];
  const renderInventory = () => {
    if (window.RSInventoryUI && RSInventoryUI.renderInventory) return RSInventoryUI.renderInventory();
  };

  /* ============================================================
     MENU EDITOR
     ============================================================ */
  const renderEditor = () => {
    $('#editor-list').innerHTML = MENU.map(m=>`
      <tr>
        <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg?'':'nonveg'}"></span><div><b>${_e(m.name)}</b><div style="font-size:11px;color:var(--text-mute)">${m.veg?'Veg':'Non-veg'} · ${_e(m.cat)}</div></div></div></td>
        <td>${_e(m.cat)}</td><td class="td-strong">${rs(m.price)}</td>
        <td><span class="stock-dot ${stockCls[m.stock]}">${stockLabel[m.stock]}</span></td>
        <td><label class="switch-mini"><input type="checkbox" ${m.stock!=='out'?'checked':''}><span></span></label></td>
        <td><div class="row-actions"><button class="icon-act go" title="Edit" aria-label="Edit ${_e(m.name)}"><i class="fa-solid fa-pen"></i></button><button class="icon-act" title="Recipe" aria-label="Recipe for ${_e(m.name)}"><i class="fa-solid fa-flask"></i></button><button class="icon-act danger" title="Delete" aria-label="Delete ${_e(m.name)}"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>`).join('');
    // NOTE: this is a fallback renderer. In normal operation `features-editor.js` overrides
    // 'editor-tab' in `renderers` with a real save/delete implementation (RS.addRenderer).
    // These handlers only run if that override failed to load -- they must NOT claim success
    // for an edit/delete that never actually happened.
    $$('#editor-list .icon-act.go').forEach(b=>b.addEventListener('click',()=>{
      console.warn('Menu editor fallback renderer active -- features-editor.js did not load/override editor-tab.');
      toast('Menu editor failed to load. Please refresh the page and try again.', 'fa-triangle-exclamation');
    }));
    $$('#editor-list .icon-act.danger').forEach(b=>b.addEventListener('click',()=>{
      console.warn('Menu editor fallback renderer active -- features-editor.js did not load/override editor-tab.');
      toast('Menu editor failed to load -- nothing was deleted. Please refresh the page.', 'fa-triangle-exclamation');
    }));
  };

  /* ============================================================
     REPORTS — Wave 8: assets/modules/reports-ui.js
     ============================================================ */
  const renderReports = async (period) => {
    if (window.RSReportsUI && RSReportsUI.renderReports) return RSReportsUI.renderReports(period);
  };
  window._renderReports = (p) => renderReports(p);

  /* ============================================================
     KDS — Wave 9: assets/modules/kds-ui.js
     Array stays here so syncPendingOrders can mutate RS.KDS.
     ============================================================ */
  let kdsState = {};
  const renderKDS = () => {
    if (window.RSKdsUI && RSKdsUI.renderKDS) return RSKdsUI.renderKDS();
  };
  function tickKDS() {
    if (window.RSKdsUI && RSKdsUI.tickKDS) return RSKdsUI.tickKDS();
  }

  /* ============================================================
     GROWTH HUB — Wave 12: assets/modules/growth-hub-shell.js
     ============================================================ */
  const renderHub = () => {
    if (window.RSGrowthHubShell && RSGrowthHubShell.renderHub) return RSGrowthHubShell.renderHub();
  };
  function renderGrowthHub() {
    if (window.RSGrowthHubShell && RSGrowthHubShell.renderGrowthHub) return RSGrowthHubShell.renderGrowthHub();
    return renderHub();
  }

  /* ============================================================
     EMPLOYEES — Wave 10: assets/modules/employees-ui.js
     Array stays here so RS.EMPLOYEES reference remains stable.
     ============================================================ */
  const EMPLOYEES = [];
  const renderEmployees = () => {
    if (window.RSEmployeesUI && RSEmployeesUI.renderEmployees) return RSEmployeesUI.renderEmployees();
  };

  /* ============================================================
     SUPER-ADMIN — Wave 9: assets/modules/super-admin.js
     ============================================================ */
  const renderSuper = async () => {
    if (window.RSSuperAdmin && RSSuperAdmin.renderSuper) return RSSuperAdmin.renderSuper();
  };

  /* ============================================================
     GATEWAY MONITOR — Wave 8: assets/modules/gateway-monitor.js
     ============================================================ */
  async function pollSuperAdminGateway() {
    if (window.RSGatewayMonitor && RSGatewayMonitor.pollSuperAdminGateway) {
      return RSGatewayMonitor.pollSuperAdminGateway();
    }
  }
  function startSaaSGatewayPolling() {
    if (window.RSGatewayMonitor && RSGatewayMonitor.startSaaSGatewayPolling) {
      return RSGatewayMonitor.startSaaSGatewayPolling();
    }
  }
  function stopSaaSGatewayPolling() {
    if (window.RSGatewayMonitor && RSGatewayMonitor.stopSaaSGatewayPolling) {
      return RSGatewayMonitor.stopSaaSGatewayPolling();
    }
  }
  async function loadAppIncidents() {
    if (window.RSGatewayMonitor && RSGatewayMonitor.loadAppIncidents) {
      return RSGatewayMonitor.loadAppIncidents();
    }
  }
  const renderGateway = () => {
    if (window.RSGatewayMonitor && RSGatewayMonitor.renderGateway) {
      return RSGatewayMonitor.renderGateway();
    }
  };

  /* ---------- renderers map ---------- */
  const renderBillsFast = frameTask(renderBills);
  const renderers = {
    'pos-tab':initPOS,'qr-orders-tab':renderQR,
    'bills-tab':()=>{
      // Wave 6: filters + render live in RSBillsHistory
      if (window.RSBillsHistory && RSBillsHistory.bindFilters) {
        RSBillsHistory.bindFilters();
      } else {
        renderBills();
        const search = $('#bills-search');
        if (search && !search._rsListenerBound) {
          search._rsListenerBound = true;
          search.addEventListener('input', debounce(renderBillsFast, 60));
        }
        const payFil = $('#bills-pay-filter');
        if (payFil && !payFil._rsListenerBound) {
          payFil._rsListenerBound = true;
          payFil.addEventListener('change', renderBills);
        }
        const statusFil = $('#bills-status-filter');
        if (statusFil && !statusFil._rsListenerBound) {
          statusFil._rsListenerBound = true;
          statusFil.addEventListener('change', renderBills);
        }
      }
    },
    'inventory-tab':renderInventory,'editor-tab':renderEditor,'reports-tab':renderReports,'kds-tab':renderKDS,
    'growth-hub-tab':renderGrowthHub,'employees-tab':renderEmployees,'super-admin-tab':renderSuper,'gateway-monitor-tab':renderGateway,
    'chain-dashboard-tab':() => { if(window.RestroSuite && RestroSuite.chain) RestroSuite.chain.init(window.RS_API); }
  };

  /* ---------- public API for feature modules ---------- */
  let modalRoot = null;
  function getModalRoot(){ if(!modalRoot){ modalRoot = document.getElementById('rs-modal-root') || (()=>{ const d=document.createElement('div'); d.id='rs-modal-root'; document.body.appendChild(d); return d; })(); } return modalRoot; }
  window.RS = {
    toast, activateTab, rs, initials, avatarColors, catColor,
    nextBillNo, allocateBillNo, newBillIdentity, nextLogicalNo, formatDisplayOrderId, fileDate, setOperationStatus, finishOperationStatus, runWithOperation, savePreUpdateSnapshot,
    MENU, CATS, stockLabel, stockCls,
    getCart:()=>{ if(window.RSPosUI&&RSPosUI.getCart) return RSPosUI.getCart(); return (cart||[]).map(c=>({...c})); }, getTotals, clearCart, getCustomer, addToCart, renderPOS, renderCart, renderEditor,
    setCart:(items)=>{ if(window.RSPosUI&&RSPosUI.setCart) return RSPosUI.setCart(items); cart=(items||[]).map(c=>({...c})); renderCart(); },
    titles, addRenderer:(id,fn)=>{
      renderers[id]=fn;
      const active = document.querySelector('.tab-content.active')?.id;
      if(active === id) {
        const meta = titles[id];
        if(meta){ $('#page-title').textContent = meta[0]; $('#page-sub').textContent = meta[1]; }
        try { fn(); rendered[id]=true; } catch(e){ console.warn('Renderer failed for '+id, e); }
      }
    }, render:(id)=>{ if(renderers[id]){ renderers[id](); rendered[id]=true; } },
    getModalRoot,
    seedToken:()=> nextLogicalNo('KOT'),
    BILLS, INVENTORY, EMPLOYEES, QR_ORDERS, KDS,

    // Wave 5 remaining: inventory ledger lives in assets/modules/inventory-ledger.js
    // Thin delegates keep call sites stable; module overrides after attach.
    async deductInventoryForBill(billRow) {
      if (window.RSInventoryLedger && RSInventoryLedger.deductInventoryForBill) {
        return RSInventoryLedger.deductInventoryForBill(billRow);
      }
      console.warn('[Inventory] ledger module not loaded');
    },
    restoreInventoryForBill(billRow) {
      if (window.RSInventoryLedger && RSInventoryLedger.restoreInventoryForBill) {
        return RSInventoryLedger.restoreInventoryForBill(billRow);
      }
    },

    // ---- persistence ----
    async save(coll){ const map={menu:MENU,bills:BILLS,inventory:INVENTORY,employees:EMPLOYEES}; const arr=map[coll]; if(window.RS_DB&&arr) { const out = await RS_DB.bulkPut(coll, arr.map(x=>({...x}))); if(coll === 'menu') broadcastMenuUpdate(); return out; } return Promise.resolve(); },
    async saveOne(coll,obj){ if(window.RS_DB) { const out = await RS_DB.put(coll, obj.id, {...obj}); if(coll === 'menu') broadcastMenuUpdate(); return out; } return Promise.resolve(); },
    async removeOne(coll,id){ if(window.RS_DB) { const out = await RS_DB.del(coll, id); if(coll === 'menu') broadcastMenuUpdate(); return out; } return Promise.resolve(); },
    saveSettings(obj){ if(window.RS_DB) return RS_DB.setSettings(obj); return Promise.resolve(); },
    getSettings(){ if(window.RS_DB) return RS_DB.getSettings(); return Promise.resolve(null); },
    getCurrencySymbol,
    dbMode:()=> (window.RS_DB && window.RS_DB.mode) || 'local',
    downloadFile(content, mimeType, filename) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };
  document.dispatchEvent(new CustomEvent('rs:ready'));

  /* ---------- hydrate collections from the data layer, then boot ---------- */
  const NATKEY = { menu:'id', bills:'no', inventory:'name', employees:'email' };
  function ensureId(coll, x){ const k=NATKEY[coll]||'id'; if(x.id==null) x.id = (x[k]!=null?x[k]:(k==='email'?x.name:undefined)); if(x.id==null) x.id = coll+'-'+Math.random().toString(36).slice(2,9); return x; }
  function replaceArr(arr, data){ arr.length=0; data.forEach(d=>arr.push(d)); }
  const LIVE_COLLECTIONS = {
    menu:{ table:'doppio_menu', arr:MENU, tabs:['pos-tab','editor-tab'] },
    inventory:{ table:'doppio_inventory', arr:INVENTORY, tabs:['inventory-tab'] },
    bills:{ table:'doppio_bills', arr:BILLS, tabs:['bills-tab','reports-tab'] },
    customers:{ table:'doppio_crm', tabs:['customers-tab'] },
    notifications:{ table:'doppio_notifications', tabs:[] },
    employees:{ table:'doppio_employees', arr:EMPLOYEES, tabs:['employees-tab'] },
    attendance:{ table:'doppio_attendance', tabs:['employees-tab'] },
    leave_requests:{ table:'doppio_leave_requests', tabs:['employees-tab'] }
  };
  async function refreshCollectionFromCloud(coll) {
    if (!window.RS_DB || !RS_DB.isCloud || !LIVE_COLLECTIONS[coll]) return;
    const cfg = LIVE_COLLECTIONS[coll];
    const fresh = await RS_DB.listCloud(coll);
    await RS_DB.writeLocal(coll, fresh || []);
    if (cfg.arr) replaceArr(cfg.arr, fresh || []);
    if (coll === 'menu') { try { refreshPosCats(); renderPOS(); publishMenuForPublicOrdering(); } catch(e){} }
    const active = document.querySelector('.tab-content.active')?.id;
    if (active && cfg.tabs.includes(active) && renderers[active]) {
      try { renderers[active](); rendered[active] = true; } catch(e){}
    }
    document.dispatchEvent(new CustomEvent('rs:collection_synced', { detail:{ collection:coll, count:(fresh||[]).length } }));
  }
  function setupTenantDataRealtime() {
    const api = window.RS_API;
    if (!api || !api.supabaseClient || !window.RS_DB || !RS_DB.isCloud) return;
    const activeTenantId = api.session()?.tenant_id || sessionStorage.getItem('tenant_id');
    if (!activeTenantId || window.__rsTenantRealtimeFor === activeTenantId) return;
    window.__rsTenantRealtimeFor = activeTenantId;
    window.__rsTenantRealtimeChannels = window.__rsTenantRealtimeChannels || [];
    const tableToCollection = Object.fromEntries(Object.entries(LIVE_COLLECTIONS).map(([coll, cfg]) => [cfg.table, coll]));

    const tenantBroadcastChannel = api.supabaseClient.channel(`rs-tenant-${activeTenantId}`)
      .on('broadcast', { event:'tenant-data-changed' }, (response) => {
        const payload = response && response.payload ? response.payload : {};
        if (payload.table === 'doppio_pending_orders') {
          syncPendingOrders({ forceCloud: true }).catch(e => console.warn('Realtime refresh failed for pending orders', e));
          return;
        }
        const coll = tableToCollection[payload.table];
        if (coll) {
          refreshCollectionFromCloud(coll).catch(e => console.warn('Realtime broadcast refresh failed for '+coll, e));
        } else {
          scheduleTenantDataSync();
        }
      })
      .subscribe();
    window.__rsTenantRealtimeChannels.push(tenantBroadcastChannel);

    const billChannel = api.supabaseClient.channel(`doppio-bills-realtime-${activeTenantId}`)
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_bills', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        refreshCollectionFromCloud('bills').catch(e => console.warn('Realtime refresh failed for bills', e));
      })
      .subscribe();
    window.__rsTenantRealtimeChannels.push(billChannel);

    const pendingOrdersChannel = api.supabaseClient.channel(`doppio-pending-orders-tenant-${activeTenantId}`)
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_pending_orders', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        syncPendingOrders({ forceCloud: true });
      })
      .subscribe();
    window.__rsTenantRealtimeChannels.push(pendingOrdersChannel);

    const employeeChannel = api.supabaseClient.channel('doppio-employees-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_employees', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        refreshCollectionFromCloud('employees').catch(e => console.warn('Realtime refresh failed for employees', e));
      })
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_attendance', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        refreshCollectionFromCloud('attendance').catch(e => console.warn('Realtime refresh failed for attendance', e));
      })
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_leave_requests', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        refreshCollectionFromCloud('leave_requests').catch(e => console.warn('Realtime refresh failed for leave requests', e));
      })
      .subscribe();
    window.__rsTenantRealtimeChannels.push(employeeChannel);

    const crmChannel = api.supabaseClient.channel('doppio-crm-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_crm', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        refreshCollectionFromCloud('customers').catch(e => console.warn('Realtime refresh failed for customers', e));
      })
      .subscribe();
    window.__rsTenantRealtimeChannels.push(crmChannel);

    const menuChannel = api.supabaseClient.channel(`doppio-menu-realtime-${activeTenantId}`)
      .on('postgres_changes', { event:'*', schema:'public', table: 'doppio_menu', filter: `tenant_id=eq.${activeTenantId}` }, () => {
        refreshCollectionFromCloud('menu').catch(e => console.warn('Realtime refresh failed for menu', e));
      })
      .on('broadcast', { event: 'menu-updated' }, (response) => {
        if (!response || !response.payload || String(response.payload.tenantId) === String(activeTenantId)) {
          refreshCollectionFromCloud('menu').catch(e => console.warn('Menu broadcast refresh failed', e));
        }
      })
      .on('broadcast', { event: 'data-reset' }, (response) => {
        if (response && response.payload && String(response.payload.tenantId) === String(activeTenantId)) {
          scheduleTenantDataSync();
        }
      })
      .subscribe();
    window.__rsMenuRealtimeChannel = menuChannel;
    window.__rsTenantRealtimeChannels.push(menuChannel);

    ['inventory','notifications'].forEach(coll => {
      const cfg = LIVE_COLLECTIONS[coll];
      const channel = api.supabaseClient.channel(`doppio-${coll}-realtime-${activeTenantId}`)
        .on('postgres_changes', { event:'*', schema:'public', table:cfg.table, filter:`tenant_id=eq.${activeTenantId}` }, () => {
          refreshCollectionFromCloud(coll).catch(e => console.warn('Realtime refresh failed for '+coll, e));
        })
        .subscribe();
      window.__rsTenantRealtimeChannels.push(channel);
    });
  }

  async function syncWithSupabase() {
    if (!window.RS_DB || !RS_DB.isCloud) return;
    const activeTenantId = window.RS_API?.session()?.tenant_id || sessionStorage.getItem('tenant_id');
    if (!activeTenantId) return;
    const bills = await RS_DB.listCloud('bills').catch(() => []);
    const belongsToActiveTenant = bills.some(b => String(b.tenantId || b.tenant_id || activeTenantId) === String(activeTenantId)) || !bills.length;
    if (!belongsToActiveTenant) return;
    await Promise.all(Object.keys(LIVE_COLLECTIONS).map(coll => refreshCollectionFromCloud(coll).catch(() => null)));
    await syncPendingOrders({ forceCloud: true });
  }

  const scheduleTenantDataSync = debounce(() => {
    if (!document.hidden && navigator.onLine) syncWithSupabase();
  }, 800);

  function slugifyPublicMenuKey(value) {
    const slug = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || '';
  }

  function publishMenuForPublicOrdering() {
    try {
      const settings = window.RS_SETTINGS || {};
      const session = window.RS_API && RS_API.session ? RS_API.session() : null;
      const tenantName = settings.set_restaurant_name || settings.set_outlet_name || session?.tenant_name || session?.business_name || 'Demo Restaurant';
      const slugs = new Set(['demo-tenant', 'local-demo']);
      [
        session?.tenant_slug,
        session?.outlet_id,
        sessionStorage.getItem('tenant_slug'),
        localStorage.getItem('tenant_slug'),
        settings.set_outlet_code,
        settings.set_outlet_name,
        settings.set_restaurant_name,
        tenantName
      ].forEach(v => {
        const s = slugifyPublicMenuKey(v);
        if (s) slugs.add(s);
      });
      const taxProfile = window.RS_getTenantTaxProfile ? window.RS_getTenantTaxProfile() : {};
      const payload = {
        menu: MENU.filter(m => m.stock !== 'out').map(m => ({
          name: m.name,
          price: Number(m.price) || 0,
          category: (m.cat || '').trim() || 'Uncategorized',
          description: m.description || '',
          image: m.image || '',
          bestseller: !!m.bestseller
        })),
        tenantName,
        currencySymbol: getCurrencySymbol ? getCurrencySymbol() : '\u20b9',
        taxLabel: taxProfile.tax_system || 'GST',
        updatedAt: new Date().toISOString()
      };
      slugs.forEach(slug => localStorage.setItem('doppio_menu_cache_' + slug, JSON.stringify(payload)));
    } catch(e) {
      console.warn('Public menu cache publish failed', e);
    }
  }

  function broadcastMenuUpdate() {
    publishMenuForPublicOrdering();
    try { refreshPosCats(); renderPOS(); } catch(e) {}
    const api = window.RS_API;
    const activeTenantId = api?.session()?.tenant_id || sessionStorage.getItem('tenant_id');
    if (!api || !api.supabaseClient || !activeTenantId) return;
    const channel = window.__rsMenuRealtimeChannel || api.supabaseClient.channel(`doppio-menu-realtime-${activeTenantId}`);
    channel.send({
      type: 'broadcast',
      event: 'menu-updated',
      payload: { tenantId: activeTenantId, at: new Date().toISOString() }
    }).catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) syncWithSupabase();
  });
  async function hydrate(){
    if(!window.RS_DB) return;
    const map={menu:MENU,bills:BILLS,inventory:INVENTORY,employees:EMPLOYEES};
    
    // 1. Instantly load from local storage cache
    for(const coll in map){
      try {
        const cached = await RS_DB.listLocal(coll);
        if(cached && cached.length){ replaceArr(map[coll], cached); }
      } catch(e){}
    }
    try{ refreshPosCats(); renderPOS(); publishMenuForPublicOrdering(); }catch(e){}

    // Restore persistent cart state / pre-update snapshot
    try {
      const savedCart = localStorage.getItem('rs_active_cart');
      const savedDisc = localStorage.getItem('rs_active_cart_discount');
      const savedCust = localStorage.getItem('rs_active_cart_customer');
      const snapshot = localStorage.getItem('rs_pre_update_snapshot');
      
      let cartToRestore = null;
      let discToRestore = 0;
      let custToRestore = null;
      let tabToRestore = null;
      
      if (snapshot) {
        const parsedSnap = JSON.parse(snapshot);
        if (parsedSnap) {
          cartToRestore = parsedSnap.cart;
          discToRestore = parsedSnap.discountPct || 0;
          tabToRestore = parsedSnap.activeTab;
          if (parsedSnap.tenant) {
            if (parsedSnap.tenant.id) sessionStorage.setItem('tenant_id', parsedSnap.tenant.id);
            if (parsedSnap.tenant.slug) sessionStorage.setItem('tenant_slug', parsedSnap.tenant.slug);
            if (parsedSnap.tenant.role) sessionStorage.setItem('logged_in_role', parsedSnap.tenant.role);
          }
        }
        localStorage.removeItem('rs_pre_update_snapshot');
      } else if (savedCart) {
        cartToRestore = JSON.parse(savedCart);
        discToRestore = Number(savedDisc) || 0;
        if (savedCust) custToRestore = JSON.parse(savedCust);
        // Restore which order-type tab was active
        try {
          const savedOrderType = localStorage.getItem('rs_active_order_type');
          if (savedOrderType) {
            const btns = document.querySelectorAll('.order-type-btn');
            let matched = false;
            btns.forEach(b => {
              const match = b.textContent.trim().toLowerCase() === savedOrderType.toLowerCase();
              b.classList.toggle('active', match);
              if (match) matched = true;
            });
            // fallback: activate first if nothing matched
            if (!matched && btns.length) btns[0].classList.add('active');
          }
        } catch(e) {}
      }
      
      if (cartToRestore && Array.isArray(cartToRestore) && cartToRestore.length > 0) {
        if (window.RSPosUI && RSPosUI.setCart) {
          RSPosUI.setCart(cartToRestore);
          if (RSPosUI.setDiscountPct) RSPosUI.setDiscountPct(discToRestore);
        } else {
          cart = cartToRestore;
          discountPct = discToRestore;
        }
        
        if (custToRestore) {
          const cn = document.getElementById('cust-input-name') || document.getElementById('cust-name');
          const cp = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
          const cg = document.getElementById('cust-gst');
          const ct = document.getElementById('cart-table');
          const csel = document.getElementById('cart-customer-sel');
          
          if (cn) cn.value = custToRestore.name || '';
          if (cp) cp.value = custToRestore.phone || '';
          if (cg) cg.value = custToRestore.gst || '';
          if (ct && custToRestore.table) ct.value = custToRestore.table;
          if (csel && custToRestore.phone) {
            csel.value = custToRestore.phone;
          }
        }
        renderCart();
      }
      
      if (tabToRestore) {
        activateTab(tabToRestore);
      } else {
        // Load saved active tab if no snapshot
        loadSavedTab();
      }
    } catch (e) {
      console.warn('[Cart Restore Warning] Failed to restore active cart state:', e);
      loadSavedTab();
    }

    const curTab=document.querySelector('.tab-content.active'); if(curTab && renderers[curTab.id]) { try{ renderers[curTab.id](); }catch(e){} }
    
    // 2. Fetch fresh data from the cloud in parallel (non-blocking)
    // Wait for /api/config to resolve before checking cloud mode -- without this,
    // RS_API.configured is still false (empty URL) on the first load in a new browser,
    // so the cloud fetch is skipped and a blank menu is shown until a hard refresh.
    if (window.__configReady) { try { await window.__configReady; } catch(e) {} }
    const dbMode = (window.RS_DB && window.RS_DB.mode) || 'local';
    const signedIn = window.RS_API && !!window.RS_API.session();
    if (dbMode === 'cloud' && signedIn) {
      const fetchPromises = Object.keys(map).map(async (coll) => {
        try {
          const fresh = await RS_DB.listCloud(coll);
          if (fresh) {
            await RS_DB.writeLocal(coll, fresh);
            replaceArr(map[coll], fresh);
          }
        } catch(e) {
          console.warn('Background hydrate '+coll+' failed', e);
        }
      });
      Promise.all(fetchPromises).then(() => {
        try{ refreshPosCats(); renderPOS(); publishMenuForPublicOrdering(); }catch(e){}
        const cur=document.querySelector('.tab-content.active'); if(cur && renderers[cur.id]) { try{ renderers[cur.id](); }catch(e){} }
      });
    }

    try{
      await syncPendingOrders({ forceCloud: true });
      setupSupabaseRealtime();
      setupTenantDataRealtime();
    }catch(e){ console.warn('sync pending orders/realtime failed', e); }
    document.dispatchEvent(new CustomEvent('rs:hydrated'));
    if(window.RS_SAAS) RS_SAAS.applyToUI();
  }

  /* ---------- boot ---------- */
  // Session guard: in cloud mode, require a valid signed-in session.
  // Run synchronously first (catches the common case where config is already cached),
  // then re-run after __configReady resolves to catch the new-browser race where
  // RS_API.configured is still false when this line first executes.
  if(window.RS_API && RS_API.configured && !RS_API.session()){ location.href='login'; return; }
  (window.__configReady || Promise.resolve()).then(() => {
    if(window.RS_API && RS_API.configured && !RS_API.session()){ location.href='login'; }
  }).catch(()=>{});

  const sess = window.RS_API ? RS_API.session() : null;
  const isSuper = sess && sess.role === 'superadmin';
  const isBrandAdmin = sess && sess.role === 'brand_admin';
  // Keep html + body in sync (html is stamped early in dashboard.html <head>)
  document.documentElement.classList.toggle('rs-role-superadmin', !!isSuper);
  document.documentElement.classList.toggle('rs-role-brandadmin', !!isBrandAdmin);
  document.documentElement.classList.toggle('rs-role-client', !isSuper && !isBrandAdmin);
  document.documentElement.setAttribute('data-rs-shell', isSuper ? 'superadmin' : (isBrandAdmin ? 'brandadmin' : 'client'));
  document.body.classList.toggle('rs-role-superadmin', !!isSuper);
  document.body.classList.toggle('rs-role-brandadmin', !!isBrandAdmin);
  document.body.classList.toggle('rs-role-client', !isSuper && !isBrandAdmin);
  if (isSuper) {
    try {
      document.title = 'RestroSuite Platform · Super-Admin';
      const brandName = document.querySelector('.brand-name');
      // Soft brand cue only — full lockdown is CSS shell + later block
    } catch (_) {}
  }
  renderImpersonationBanner();

  // -- Role-based tab access map ----------------------------------------------
  // Each role key maps to the sidebar data-tab values that staff can see.
  // 'owner' and any unrecognised role -> full access (no filtering).
  const ROLE_TAB_MAP = {
    manager:   ['pos-tab','floor-tab','qr-orders-tab','kds-tab','bills-tab',
                 'inventory-tab','editor-tab','customers-tab','reports-tab',
                 'analytics-tab','employees-tab', 'growth-hub-tab'],
    cashier:   ['pos-tab','floor-tab','bills-tab','customers-tab'],
    waiter:    ['pos-tab','floor-tab','kds-tab'],
    captain:   ['pos-tab','floor-tab','kds-tab','qr-orders-tab'],
    kitchen:          ['kds-tab'],
    inventory:        ['inventory-tab','editor-tab','reports-tab'],
    customer_display: ['tokens-tab'],
  };

  const ROLE_LABELS = {
    owner:     'Outlet Owner',
    manager:   'Manager',
    cashier:   'Cashier',
    waiter:    'Waiter',
    captain:   'Captain',
    kitchen:          'Kitchen Staff',
    customer_display: 'Customer Display',
    inventory: 'Inventory Manager',
  };

  /** Role-first home tab — reduces cognitive load for staff logins */
  const ROLE_HOME_TAB = ROLE_HOME_TAB_EARLY;

  // Resolve current staff role (session meta -> sessionStorage fallback)
  const staffRole = String((sess && sess.role) || sessionStorage.getItem('logged_in_role') || 'owner')
    .toLowerCase().trim();
  // Roles that get the full, unrestricted dashboard.
  const UNRESTRICTED_ROLES = ['owner', 'admin', 'superadmin', 'brand_admin'];
  // Prefer the backend-computed allowed_tabs from the session (it already
  // intersects role defaults, per-user overrides and the tenant's plan),
  // then fall back to the client-side role map. A non-admin role that
  // resolves to nothing gets POS only -- never the full dashboard.
  function resolveAllowedTabs(role, sessionTabs) {
    if (UNRESTRICTED_ROLES.includes(role)) return null; // null = unrestricted
    const fromSession = (Array.isArray(sessionTabs) && sessionTabs.length)
      ? sessionTabs.map(String) : null;
    return fromSession || ROLE_TAB_MAP[role] || ['pos-tab'];
  }
  const allowedTabs = resolveAllowedTabs(staffRole, sess && sess.allowed_tabs);

  // -- Apply role-specific UI lockdown before first render --
  if (isBrandAdmin) {
    // 1. Show brandadmin-only elements
    $$('.brandadmin-only').forEach(el => {
      el.style.display = el.classList.contains('sidebar-link') ? 'flex' : '';
    });
    // 2. Hide all other sidebar links
    $$('.sidebar-link').forEach(link => {
      if (link.dataset.tab !== 'chain-dashboard-tab') {
        link.style.display = 'none';
      }
    });
    // 3. Update user pill
    const userNameEl = document.querySelector('.user-pill .un');
    const userRoleEl = document.querySelector('.user-pill .ur');
    if (userNameEl && sess && sess.username) userNameEl.textContent = sess.username.charAt(0).toUpperCase() + sess.username.slice(1);
    if (userRoleEl) userRoleEl.textContent = 'Corporate HQ Admin';
    // 4. Hide non-brandadmin metrics
    const headerCenter = document.querySelector('.header-center-metrics');
    if (headerCenter) headerCenter.style.display = 'none';
    // 5. Hide role switch
    const roleSwitch = $('#role-switch');
    if (roleSwitch) roleSwitch.style.display = 'none';
  } else {
    $$('.brandadmin-only').forEach(el => el.style.display = 'none');
  }

  // ── Super-admin platform shell (CSS already hides client chrome from first paint) ──
  if (isSuper) {
    // 1. Show superadmin-only elements (sidebar links, mobile nav, section labels)
    $$('.superadmin-only').forEach(el => {
      el.style.display = el.classList.contains('sidebar-link') || el.classList.contains('mnav-link') ? 'flex' : '';
    });
    // 2. Hide all regular sidebar links (keep only superadmin ones)
    $$('.sidebar-link').forEach(link => {
      const tabId = link.dataset.tab || '';
      if (tabId !== 'super-admin-tab' && tabId !== 'gateway-monitor-tab') {
        link.style.display = 'none';
      }
    });
    // 2b. Hide regular mobile bottom nav items for superadmin
    $$('.superadmin-hide').forEach(el => {
      el.style.display = 'none';
    });
    // 3. Hide ghost sidebar section labels (OPERATIONS, MANAGE, GROW)
    $$('.sb-section:not(.superadmin-only):not(.brandadmin-only)').forEach(el => {
      el.style.display = 'none';
    });
    // 4. Update sidebar branding for superadmin
    const brandName = $('#sidebar-brand-name');
    const brandType = $('#sidebar-brand-type');
    if (brandName) brandName.textContent = 'RESTRO';
    if (brandType) brandType.textContent = 'Suite';
    // 5. Update user pill
    const userNameEl = document.querySelector('.user-pill .un');
    const userRoleEl = document.querySelector('.user-pill .ur');
    if (userNameEl && sess && sess.username) userNameEl.textContent = sess.username.charAt(0).toUpperCase() + sess.username.slice(1);
    if (userRoleEl) userRoleEl.textContent = 'SaaS Super-Admin';
    // 6. Hide non-superadmin header elements
    const headerCenter = document.querySelector('.header-center-metrics');
    if (headerCenter) headerCenter.style.display = 'none';
    // 7. Role switch is client-only demo control
    const rsSwitch = $('#role-switch');
    if (rsSwitch) rsSwitch.style.display = 'none';
    // Wire platform controls ASAP (no 300ms delay — that window caused client flash)
    const openSet = document.getElementById('open-settings');
    if (openSet) openSet.style.display = 'none';
    const tbSearchInput = document.querySelector('.tb-search input');
    if (tbSearchInput) {
      tbSearchInput.placeholder = 'Search tenants…';
      if (!tbSearchInput.dataset.saWired) {
        tbSearchInput.dataset.saWired = '1';
        tbSearchInput.addEventListener('input', () => {
          if (window.RSSuperAdmin && RSSuperAdmin.setSearch) RSSuperAdmin.setSearch(tbSearchInput.value);
        });
      }
    }
    const inlineSearch = document.getElementById('tenant-search-input');
    if (inlineSearch && !inlineSearch.dataset.saWired) {
      inlineSearch.dataset.saWired = '1';
      inlineSearch.addEventListener('input', () => {
        const tbSearchInput2 = document.querySelector('.tb-search input');
        if (tbSearchInput2) tbSearchInput2.value = inlineSearch.value;
        if (window.RSSuperAdmin && RSSuperAdmin.setSearch) RSSuperAdmin.setSearch(inlineSearch.value);
      });
    }
    const cloudPill = document.getElementById('db-mode-pill');
    if (cloudPill && !cloudPill.dataset.saasClick) {
      cloudPill.dataset.saasClick = '1';
      cloudPill.style.cursor = 'pointer';
      cloudPill.title = 'Click to check cloud sync status';
      cloudPill.addEventListener('click', () => {
        const mode = cloudPill.textContent.trim();
        const detail = window.RS_LAST_CLOUD_ERROR ? `⚠️ Last error: ${window.RS_LAST_CLOUD_ERROR.message || 'Unknown'} at ${window.RS_LAST_CLOUD_ERROR.time ? new Date(window.RS_LAST_CLOUD_ERROR.time).toLocaleTimeString() : '-'}` : '✅ No recent sync errors.';
        toast(`Cloud status: ${mode} — ${detail}`, 'fa-cloud');
      });
    }
    const userPill = document.querySelector('.user-pill');
    if (userPill && !userPill.dataset.saasClick) {
      userPill.dataset.saasClick = '1';
      userPill.style.cursor = 'pointer';
      userPill.title = 'View session info';
      userPill.addEventListener('click', () => {
        const s = window.RS_API ? RS_API.session() : null;
        const uname = (s && s.username) || 'codearc-superadmin';
        const role = (s && s.role) || 'superadmin';
        const tenantCount =
          window.RSSuperAdmin && typeof RSSuperAdmin.getTenantCount === 'function'
            ? RSSuperAdmin.getTenantCount()
            : 0;
        toast(`Logged in as ${uname} · Role: ${role} · ${tenantCount} tenants loaded`, 'fa-user-shield');
      });
    }
    const helpBtn = document.getElementById('open-product-guide-btn');
    if (helpBtn) helpBtn.style.display = 'none';
    const newTenantBtn = document.getElementById('btn-create-tenant');
    if (newTenantBtn && !newTenantBtn.dataset.wired) {
      newTenantBtn.dataset.wired = '1';
      newTenantBtn.addEventListener('click', () => {
        if (window.RSSuperAdmin && RSSuperAdmin.openCreateTenantModal) RSSuperAdmin.openCreateTenantModal();
      });
    }
    const bulkBtn = document.getElementById('sa-bulk-approve-btn');
    if (bulkBtn && !bulkBtn.dataset.wired) {
      bulkBtn.dataset.wired = '1';
      bulkBtn.addEventListener('click', () => {
        if (window.RSSuperAdmin && RSSuperAdmin.bulkApproveAllPending) RSSuperAdmin.bulkApproveAllPending();
      });
    }
    const versionPill = document.getElementById('app-version-pill');
    if (versionPill) versionPill.style.display = 'none';
    const callBtn = document.getElementById('tb-call-support');
    if (callBtn) callBtn.style.display = 'none';
    const stationChip = document.getElementById('rs-station-chip');
    if (stationChip) stationChip.style.display = 'none';
    const tbSearch = document.querySelector('.tb-search');
    if (tbSearch) tbSearch.style.display = 'none';
  } else {
    // Hide superadmin-only elements
    $$('.superadmin-only').forEach(el => {
      el.style.display = 'none';
    });
    // Show regular mobile bottom nav items
    $$('.superadmin-hide').forEach(el => {
      el.style.display = el.classList.contains('mnav-link') ? 'flex' : '';
    });
  }

  // -- Apply staff role tab filtering (waiter / cashier / kitchen / etc.) --
  // Pulled into a function so a live role change (see setupSupabaseRealtime's
  // tenant_users subscription) can re-run this instantly instead of only
  // taking effect after the next login.
  function applyStaffRoleTabFiltering(role, tabs) {
    if (isSuper || isBrandAdmin) return;
    if (!tabs) {
      // Unrestricted (owner or unrecognised role) -- make sure nothing is
      // left hidden from a previous, more restrictive role.
      const roleStyle = document.getElementById('rs-role-filter-style');
      if (roleStyle) roleStyle.remove();
      $$('.sidebar-link, .mnav-link, .mnav-more-btn, .more-sheet-link[data-tab]').forEach(link => { link.style.display = ''; });
      return;
    }
    const roleStyleId = 'rs-role-filter-style';
    let roleStyle = document.getElementById(roleStyleId);
    if (!roleStyle) {
      roleStyle = document.createElement('style');
      roleStyle.id = roleStyleId;
      document.head.appendChild(roleStyle);
    }
    const allowedSelectors = tabs
      .concat(role === 'manager' ? ['settings-tab'] : [])
      .map(tab => `[data-tab="${String(tab).replace(/"/g, '\\"')}"]`)
      .join(', ');
    roleStyle.textContent = allowedSelectors
      ? `.sidebar-link[data-tab]:not(${allowedSelectors}), .mnav-link[data-tab]:not(${allowedSelectors}), .mnav-more-btn[data-tab]:not(${allowedSelectors}), .more-sheet-link[data-tab]:not(${allowedSelectors}) { display: none !important; }`
      : `.sidebar-link[data-tab], .mnav-link[data-tab], .mnav-more-btn[data-tab], .more-sheet-link[data-tab] { display: none !important; }`;
    // Hide sidebar links not in allowed list
    $$('.sidebar-link').forEach(link => {
      const tabId = link.dataset.tab || '';
      if (!tabId) return;
      link.style.display = tabs.includes(tabId) ? '' : 'none';
    });
    // Hide mobile bottom nav links not in allowed list
    $$('.mnav-link').forEach(link => {
      const tabId = link.dataset.tab || '';
      if (!tabId) return;
      link.style.display = tabs.includes(tabId) ? '' : 'none';
    });
    // Hide mobile "More" sheet entries not in allowed list (built later by
    // features-shell, so this also re-runs on rs:hydrated below)
    $$('.mnav-more-btn[data-tab], .more-sheet-link[data-tab]').forEach(link => {
      const tabId = link.dataset.tab || '';
      if (!tabId) return;
      link.style.display = tabs.includes(tabId) ? '' : 'none';
    });
    // Update user pill role label
    const userRoleEl = document.querySelector('.user-pill .ur');
    if (userRoleEl) userRoleEl.textContent = ROLE_LABELS[role] || role;
    // Hide settings entry points from non-managers (only owner/admin/manager
    // may open Settings; this covers both the sidebar link and the gear
    // button in the sidebar footer, which previously was never gated)
    if (role !== 'manager') {
      const settingsLink = document.querySelector('.sidebar-link[data-tab="settings-tab"]');
      if (settingsLink) settingsLink.style.display = 'none';
      const settingsGear = document.getElementById('open-settings');
      if (settingsGear) settingsGear.style.display = 'none';
    }
    // If the tab the user is currently sitting on just got revoked, move
    // them somewhere they can still see rather than leaving a dead screen up.
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && !tabs.includes(activeTab.id) && tabs.length && typeof activateTab === 'function') {
      activateTab(tabs[0]);
    }
  }
  applyStaffRoleTabFiltering(staffRole, allowedTabs);
  // Re-apply after hydration: some nav elements (mobile "More" sheet links,
  // late-rendered footer buttons) don't exist yet on the first pass, and the
  // currently active tab may only be resolved after the saved-tab restore.
  document.addEventListener('rs:hydrated', () => {
    const cur = window.RS_ROLE || {};
    applyStaffRoleTabFiltering(cur.staffRole || staffRole, cur.allowedTabs || allowedTabs);
  });

  // Live role/permission update -- called from setupSupabaseRealtime()'s
  // tenant_users subscription when an admin changes this user's role or
  // allowed tabs, so it takes effect immediately instead of needing a
  // fresh login.
  function applyLiveRoleUpdate(newRole, newAllowedTabsColumn) {
    if (isSuper || isBrandAdmin) return;
    const resolvedRole = String(newRole || staffRole).toLowerCase().trim();
    // Prefer an explicit per-user allowed_tabs override (set in Team & Roles);
    // otherwise fall back to the role's default tab set.
    const resolvedTabs = resolveAllowedTabs(resolvedRole, newAllowedTabsColumn);
    sessionStorage.setItem('logged_in_role', resolvedRole);
    sessionStorage.setItem('allowed_tabs', JSON.stringify(resolvedTabs || []));
    applyStaffRoleTabFiltering(resolvedRole, resolvedTabs);
    window.RS_ROLE = { staffRole: resolvedRole, allowedTabs: resolvedTabs, ROLE_TAB_MAP, ROLE_LABELS };
    toast('Your access permissions were just updated', 'fa-user-shield');
  }
  window.RS_applyLiveRoleUpdate = applyLiveRoleUpdate;

  // Expose role helpers globally for other modules
  window.RS_ROLE = { staffRole, allowedTabs, ROLE_TAB_MAP, ROLE_LABELS };

  function bindGlobalImportExportEvents() {
    const escHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    function importPreview({ title, summary, rows, skipped }) {
      return new Promise(resolve => {
        const warnings = (skipped || []).slice(0, 6).map(msg => `<li>${escHtml(msg)}</li>`).join('');
        const body = `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="crm-stats"><div class="cs"><div class="csv">${rows}</div><div class="csl">Rows ready</div></div><div class="cs"><div class="csv">${(skipped||[]).length}</div><div class="csl">Skipped</div></div></div>
          <div style="font-size:13px;color:var(--text-soft)">${escHtml(summary)}</div>
          ${warnings ? `<div class="sr-empty" style="text-align:left;padding:12px"><b>Skipped rows</b><ul style="margin:8px 0 0 18px">${warnings}</ul></div>` : ''}
        </div>`;
        if (!window.RSModal) {
          resolve(window.confirm(`${title}\n\n${rows} rows ready. ${(skipped||[]).length} skipped.\nContinue import?`));
          return;
        }
        RSModal.open({
          title, sub:'Review before saving to database', icon:'fa-file-import', size:'sm', body,
          foot:`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-database"></i> Import</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
            modal.querySelector('[data-confirm]').onclick = () => { close(); resolve(true); };
          }
        });
      });
    }
    async function saveImportedRecords(collection, records) {
      const before = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
      const failed = [];
      let saved = 0;
      const cloudWrites = records.map(async (record) => {
        const newItem = record;
        try {
          await RS.saveOne(collection, record);
          saved++;
        } catch(e) {
          if (collection === 'menu') failed.push(`Recipe import failed for ${newItem.name}: ${e.message}`);
          else failed.push(`${record.name || record.no || record.id || 'Row'}: ${e.message}`);
        }
      });
      await Promise.all(cloudWrites);
      const lastError = window.RS_LAST_CLOUD_ERROR;
      const cloudFallback = !!(lastError && lastError.time !== before && lastError.collection === collection);
      return { saved, failed, cloudFallback };
    }
    function importResultToast(label, result) {
      if (result.failed.length) {
        toast(`${result.saved} ${label} imported. ${result.failed.length} failed.`, 'fa-circle-exclamation');
      } else if (result.cloudFallback) {
        toast(`${result.saved} ${label} saved locally. Cloud sync pending.`, 'fa-cloud-arrow-up');
      } else {
        toast(`${result.saved} ${label} imported and synced`, 'fa-circle-check');
      }
    }

    // 1. Menu Download Template
    const btnDownloadMenu = document.getElementById('btn-download-menu-template');
    if (btnDownloadMenu) {
      btnDownloadMenu.onclick = () => {
        setOperationStatus('Preparing menu CSV template...');
        const headers = ['Name', 'Category', 'Price', 'Description', 'PrepTimeMinutes', 'Available', 'Bestseller'];
        const sampleRows = [
          ['Cappuccino', 'HOT COFFEE', '180', 'Espresso with steamed milk and foam', '4', 'YES', 'YES'],
          ['Veg Grilled Sandwich', 'SANDWICHES', '220', 'Grilled vegetable and cheese sandwich', '8', 'YES', 'NO']
        ];
        const csv = [
          headers.join(','),
          ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `menu-template-${fileDate()}.csv`);
        finishOperationStatus('Menu template downloaded');
        toast('Menu CSV template downloaded', 'fa-circle-check');
      };
    }

    // 2. Menu Import CSV
    const btnImportMenu = document.getElementById('btn-import-menu');
    if (btnImportMenu) {
      btnImportMenu.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
          const file = e.target.files[0];
          if(!file) return;
          const oldImportMenuHtml = btnImportMenu.innerHTML;
          btnImportMenu.disabled = true;
          btnImportMenu.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing';
          const reader = new FileReader();
          reader.onload = async evt => {
            try {
              setOperationStatus('Reading menu import file...');
              const text = evt.target.result;
              const rows = window.RestroSuite && window.RestroSuite.imports && window.RestroSuite.imports.parseCsv
                ? window.RestroSuite.imports.parseCsv(text)
                : [];
              if(!rows || !rows.length) throw new Error('No rows found in CSV');
              setOperationStatus(`Importing ${rows.length} menu rows...`);

              const cleanNumber = (val) => {
                if (val === undefined || val === null || val === '') return NaN;
                if (typeof val === 'number') return val;
                let str = String(val).trim();
                str = str.replace(/[₹$???\s]/g, '');

                const hasComma = str.includes(',');
                const hasDot = str.includes('.');

                if (hasComma && hasDot) {
                  const commaIdx = str.indexOf(',');
                  const dotIdx = str.indexOf('.');
                  if (commaIdx < dotIdx) {
                    str = str.replace(/,/g, '');
                  } else {
                    str = str.replace(/\./g, '').replace(/,/g, '.');
                  }
                } else if (hasComma) {
                  if (/, \d{2}$/.test(str) || /,\d{2}$/.test(str)) {
                    str = str.replace(/,/g, '.');
                  } else {
                    str = str.replace(/,/g, '');
                  }
                }
                return Number(str);
              };

              const getValue = (row, possibleKeys) => {
                const targets = possibleKeys.map(k => String(k).toLowerCase().replace(/[^a-z0-9]/g, ''));
                for (const [rk, rv] of Object.entries(row || {})) {
                  const cleanRk = String(rk).toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (targets.includes(cleanRk)) {
                    if (rv !== undefined && rv !== null && rv !== '') return rv;
                  }
                }
                return '';
              };

              const records = [];
              const skipped = [];
              rows.forEach((row, index) => {
                const name = getValue(row, ['name', 'itemname', 'menuitem', 'item', 'ingredientname', 'ingredient']);
                if(!name) { skipped.push(`Row ${index + 2}: missing item name`); return; }
                const cat = getValue(row, ['category', 'cat', 'itemcategory']) || 'Mains';
                const parsedPrice = cleanNumber(getValue(row, ['price', 'sellingprice', 'cost', 'unitcost']));
                const price = Number.isFinite(parsedPrice) ? parsedPrice : 0;
                if(price <= 0) { skipped.push(`Row ${index + 2}: ${name} has no valid price`); return; }
                const desc = getValue(row, ['description', 'desc']) || '';
                const availableVal = getValue(row, ['available', 'status', 'stock']);
                const available = String(availableVal || 'YES').toUpperCase() !== 'NO' && String(availableVal || 'YES').toUpperCase() !== 'OUT';
                
                const existing = MENU.find(x => String(x.name).toLowerCase() === String(name).toLowerCase());
                const item = {
                  id: existing ? existing.id : 'menu_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                  name: String(name),
                  cat: String(cat),
                  price: price,
                  veg: !String(name + ' ' + cat).toLowerCase().includes('chicken') && !String(name + ' ' + cat).toLowerCase().includes('mutton') && !String(name + ' ' + cat).toLowerCase().includes('fish') && !String(name + ' ' + cat).toLowerCase().includes('egg'),
                  stock: available ? 'ok' : 'out',
                  description: String(desc)
                };
                records.push(item);
              });
              if(!records.length) throw new Error('No valid menu rows found');
              const proceed = await importPreview({ title:'Import menu CSV', summary:'Menu items will be saved to this outlet and synced to Supabase when cloud is available.', rows:records.length, skipped });
              if(!proceed) {
                finishOperationStatus('Menu import cancelled', 'error');
                return;
              }
              setOperationStatus(`Importing ${records.length} menu rows...`);
              const result = await saveImportedRecords('menu', records);
              finishOperationStatus(`${result.saved} menu items imported`);
              importResultToast('menu items', result);
              if(window.RS_DB) {
                const items = await RS_DB.list('menu');
                if(items) {
                  MENU.length = 0;
                  items.forEach(i => MENU.push(i));
                  renderEditor();
                  refreshPosCats();
                  renderPOS();
                  publishMenuForPublicOrdering();
                }
              }
            } catch(err) {
              console.error(err);
              finishOperationStatus('Menu import failed', 'error');
              toast('Import failed: ' + err.message, 'fa-circle-exclamation');
            } finally {
              btnImportMenu.disabled = false;
              btnImportMenu.innerHTML = oldImportMenuHtml;
            }
          };
          reader.readAsText(file);
        };
        input.click();
      };
    }

    // 3. Inventory Download Template
    const btnDownloadInventory = document.getElementById('btn-download-inventory-template');
    if (btnDownloadInventory) {
      btnDownloadInventory.onclick = () => {
        setOperationStatus('Preparing inventory CSV template...');
        const headers = ['IngredientKey', 'IngredientName', 'Category', 'CurrentStock', 'MaxStock', 'Unit', 'ReorderLevelPercent', 'ExpiryDate'];
        const sampleRows = [
          ['espresso_shot', 'Espresso Shot', 'drinks', '3000', '6000', 'ml', '20', ''],
          ['milk', 'Milk', 'drinks', '6000', '10000', 'ml', '25', '2026-06-16'],
          ['bread', 'Bread', 'food', '60', '100', 'slices', '20', '2026-06-13']
        ];
        const csv = [
          headers.join(','),
          ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `inventory-template-${fileDate()}.csv`);
        finishOperationStatus('Inventory template downloaded');
        toast('Inventory CSV template downloaded', 'fa-circle-check');
      };
    }

    // 4. Inventory Import CSV
    const btnImportInventory = document.getElementById('btn-import-inventory');
    if (btnImportInventory) {
      btnImportInventory.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
          const file = e.target.files[0];
          if(!file) return;
          const oldImportInventoryHtml = btnImportInventory.innerHTML;
          btnImportInventory.disabled = true;
          btnImportInventory.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing';
          const reader = new FileReader();
          reader.onload = async evt => {
            try {
              setOperationStatus('Reading inventory import file...');
              const text = evt.target.result;
              const rows = window.RestroSuite && window.RestroSuite.imports && window.RestroSuite.imports.parseCsv
                ? window.RestroSuite.imports.parseCsv(text)
                : [];
              if(!rows || !rows.length) throw new Error('No rows found in CSV');
              setOperationStatus(`Importing ${rows.length} inventory rows...`);

              const cleanNumber = (val) => {
                if (val === undefined || val === null || val === '') return NaN;
                if (typeof val === 'number') return val;
                let str = String(val).trim();
                str = str.replace(/[₹$???\s]/g, '');

                const hasComma = str.includes(',');
                const hasDot = str.includes('.');

                if (hasComma && hasDot) {
                  const commaIdx = str.indexOf(',');
                  const dotIdx = str.indexOf('.');
                  if (commaIdx < dotIdx) {
                    str = str.replace(/,/g, '');
                  } else {
                    str = str.replace(/\./g, '').replace(/,/g, '.');
                  }
                } else if (hasComma) {
                  if (/, \d{2}$/.test(str) || /,\d{2}$/.test(str)) {
                    str = str.replace(/,/g, '.');
                  } else {
                    str = str.replace(/,/g, '');
                  }
                }
                return Number(str);
              };

              const getValue = (row, possibleKeys) => {
                const targets = possibleKeys.map(k => String(k).toLowerCase().replace(/[^a-z0-9]/g, ''));
                for (const [rk, rv] of Object.entries(row || {})) {
                  const cleanRk = String(rk).toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (targets.includes(cleanRk)) {
                    if (rv !== undefined && rv !== null && rv !== '') return rv;
                  }
                }
                return '';
              };

              const records = [];
              const skipped = [];
              rows.forEach((row, index) => {
                const name = getValue(row, ['ingredientname', 'ingredient', 'name', 'item', 'ingredientkey']);
                if(!name) { skipped.push(`Row ${index + 2}: missing ingredient name`); return; }
                const cat = getValue(row, ['category', 'cat', 'itemcategory']) || 'General';
                const parsedStock = cleanNumber(getValue(row, ['instock', 'stock', 'currentstock', 'current', 'quantity']));
                const parsedMin = cleanNumber(getValue(row, ['minlevel', 'min', 'threshold', 'reorderlevelpercent']));
                const parsedCost = cleanNumber(getValue(row, ['unitcost', 'cost', 'price', 'sellingprice']));
                const unit = getValue(row, ['unit', 'unitofmeasure']) || 'unit';
                
                const existing = INVENTORY.find(x => String(x.name).toLowerCase() === String(name).toLowerCase() || String(x.key).toLowerCase() === String(name).toLowerCase());
                const item = {
                  id: existing ? existing.id : 'inv_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                  name: String(name),
                  cat: String(cat),
                  stock: Number.isFinite(parsedStock) ? parsedStock : 0,
                  min: Number.isFinite(parsedMin) ? parsedMin : 10,
                  cost: Number.isFinite(parsedCost) ? parsedCost : 0,
                  unit: String(unit)
                };
                records.push(item);
              });
              if(!records.length) throw new Error('No valid inventory rows found');
              const proceed = await importPreview({ title:'Import inventory CSV', summary:'Inventory rows will update stock levels for this outlet and sync to Supabase when cloud is available.', rows:records.length, skipped });
              if(!proceed) {
                finishOperationStatus('Inventory import cancelled', 'error');
                return;
              }
              setOperationStatus(`Importing ${records.length} inventory rows...`);
              const result = await saveImportedRecords('inventory', records);
              finishOperationStatus(`${result.saved} inventory items imported`);
              importResultToast('ingredients', result);
              if(window.RS_DB) {
                const invs = await RS_DB.list('inventory');
                if(invs) {
                  INVENTORY.length = 0;
                  invs.forEach(i => INVENTORY.push(i));
                  renderInventory();
                }
              }
            } catch(err) {
              console.error(err);
              finishOperationStatus('Inventory import failed', 'error');
              toast('Import failed: ' + err.message, 'fa-circle-exclamation');
            } finally {
              btnImportInventory.disabled = false;
              btnImportInventory.innerHTML = oldImportInventoryHtml;
            }
          };
          reader.readAsText(file);
        };
        input.click();
      };
    }

    // 5. Bills Export Excel-friendly CSV (delegates to bills-history — no ProgressOverlay stub)
    const btnExportBills = document.getElementById('btn-export-bills');
    if (btnExportBills && !btnExportBills.dataset.rsExportDashBound) {
      btnExportBills.dataset.rsExportDashBound = '1';
      btnExportBills.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.RSBillsHistory && typeof RSBillsHistory.exportBillsCsv === 'function') {
          RSBillsHistory.exportBillsCsv();
          return;
        }
        if (window.RS && typeof RS.exportBillsCsv === 'function') {
          RS.exportBillsCsv();
          return;
        }
        // Fallback if module not loaded
        const list = (window.RS && RS.BILLS) || BILLS || [];
        if (!list.length) return toast('No bills to export', 'fa-circle-exclamation');
        const headers = ['Bill No', 'Date', 'Table', 'Total', 'Payment', 'Status'];
        const rows = list.map((b) =>
          [b.no || '', b.dateTime || b.time || '', b.table || '', b.amount || b.total || '', b.pay || '', b.status || '']
            .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
            .join(',')
        );
        const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `bills-${fileDate()}.csv`);
        toast('Exported ' + list.length + ' bills', 'fa-file-csv');
      });
    }

    // 5b. Print Day Report
    const btnPrintDayReport = document.getElementById('btn-print-day-report');
    if (btnPrintDayReport) {
      btnPrintDayReport.onclick = () => {
        const paidBills = BILLS.filter((b) => String(b.status || 'paid').toLowerCase() === 'paid');
        if (!paidBills.length) return toast('No sales data for day report', 'fa-circle-exclamation');

        const settings = window.RS_SETTINGS || {};
        const sess = window.RS_API && RS_API.session ? RS_API.session() : null;
        let outletName =
          settings.set_restaurant_name ||
          settings.set_outlet_name ||
          (sess && (sess.tenant_name || sess.business_name)) ||
          document.querySelector('.user-pill .ur')?.textContent?.split('·')[0]?.trim() ||
          document.getElementById('manage-tenant-name')?.textContent ||
          '';
        if (!outletName || /outlet name/i.test(outletName)) outletName = 'RestroSuite Outlet';
        
        // Calculate stats
        const totalRevenue = paidBills.reduce((sum, b) => sum + (Number(b.amount) || Number(b.total) || 0), 0);
        const totalOrders = paidBills.length;
        const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
        
        // Prefer stored GST; fall back to 5% inclusive estimate
        const gstFromBills = paidBills.reduce((sum, b) => sum + (Number(b.gst) || 0), 0);
        const gstCollected = gstFromBills > 0 ? Math.round(gstFromBills) : Math.round(totalRevenue - totalRevenue / 1.05);
        const netTaxableSales = Math.round(totalRevenue - gstCollected);

        // Payment Breakdown
        const paymentMethods = {};
        paidBills.forEach(b => {
          if (b.tenders && Array.isArray(b.tenders) && b.tenders.length) {
            b.tenders.forEach(t => {
              const method = t.method || 'Cash';
              paymentMethods[method] = (paymentMethods[method] || 0) + Number(t.amount || 0);
            });
          } else {
            const method = b.pay || b.paymentMethod || 'Cash';
            paymentMethods[method] = (paymentMethods[method] || 0) + (b.amount || 0);
          }
        });

        const paymentBreakdownHtml = Object.entries(paymentMethods).map(([method, amount]) => `
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <span>${method}:</span>
            <span>${rs(amount)}</span>
          </div>
        `).join('');

        const now = new Date();
        const formattedDate = now.toLocaleDateString('en-IN');
        const formattedTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

        const html = `
          <div style="font-family: 'DM Sans', monospace; max-width: 280px; margin: 0 auto; color: #111; font-size: 13px; line-height: 1.4;">
            <div style="text-align: center; margin-bottom: 10px;">
              <h2 style="font-family: var(--font-body), system-ui, sans-serif; font-weight: 800; font-size: 18px; margin: 0;">${outletName}</h2>
              <p style="font-size: 11px; color: #555; margin-top: 2px;">DAILY SALES SUMMARY</p>
            </div>
            <hr style="border: 0; border-top: 1px dashed #aaa; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #555; margin-bottom: 8px;">
              <span>Date: ${formattedDate}</span>
              <span>Time: ${formattedTime}</span>
            </div>
            <hr style="border: 0; border-top: 1px dashed #aaa; margin: 10px 0;">
            
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                <span>Total Bills:</span>
                <strong>${totalOrders}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                <span>Avg Order Value (AOV):</span>
                <strong>${rs(aov)}</strong>
              </div>
            </div>
            
            <hr style="border: 0; border-top: 1px dashed #aaa; margin: 10px 0;">
            
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; padding: 2px 0; font-weight: 600;">
                <span>PAYMENT BREAKDOWN</span>
                <span>AMOUNT</span>
              </div>
              ${paymentBreakdownHtml}
            </div>
            
            <hr style="border: 0; border-top: 1px dashed #aaa; margin: 10px 0;">
            
            <div style="margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                <span>Net Taxable Sales:</span>
                <span>${rs(netTaxableSales)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                <span>Total GST (5%):</span>
                <span>${rs(gstCollected)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 15px; font-weight: 800; font-family: var(--font-body), system-ui, sans-serif; border-top: 1px dashed #ccc; margin-top: 4px;">
                <span>GROSS REVENUE:</span>
                <span>${rs(totalRevenue)}</span>
              </div>
            </div>
            
            <hr style="border: 0; border-top: 1px dashed #aaa; margin: 10px 0;">
            
            <div style="text-align: center; font-size: 11px; color: #777; margin-top: 15px;">
              *** End of Report ***
            </div>
          </div>
        `;

        if (typeof window.RSPrint === 'function') {
          window.RSPrint(html, 'Daily Sales Report');
        } else {
          const f = document.createElement('iframe');
          f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
          document.body.appendChild(f);
          const d = f.contentWindow.document;
          d.open();
          d.write(`<!doctype html><html><head><title>Daily Sales Report</title></head><body>${html}</body></html>`);
          d.close();
          f.contentWindow.focus();
          f.contentWindow.print();
          setTimeout(() => f.remove(), 800);
        }
        toast('Day report sent to printer', 'fa-print');
      };
    }

    // 6. GSTR Download
    const btnGSTR = document.getElementById('btn-download-gstr');
    if (btnGSTR) {
      btnGSTR.onclick = () => {
        const paidBills = BILLS.filter(b => b.status === 'paid');
        if(!paidBills.length) return toast('No sales data for GSTR report', 'fa-circle-exclamation');
        setOperationStatus('Preparing GSTR report...');
        const headers = ['Invoice Number', 'Invoice Date', 'Invoice Value', 'Taxable Value', 'CGST (2.5%)', 'SGST (2.5%)', 'Total Tax', 'Payment Method'];
        const csv = [
          headers.join(','),
          ...paidBills.map(b => {
            const total = b.amount || 0;
            const taxable = Math.round(total / 1.05 * 100) / 100;
            const tax = Math.round((total - taxable) * 100) / 100;
            const halfTax = Math.round(tax / 2 * 100) / 100;
            return `"${b.no}","${b.time}",${total},${taxable},${halfTax},${halfTax},${tax},"${b.pay}"`;
          })
        ].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `gstr1-report-${fileDate()}.csv`);
        finishOperationStatus('GSTR report downloaded');
        toast('GSTR CSV downloaded successfully', 'fa-circle-check');
      };
    }

    // 7. Super-Admin Tenants Export
    const btnExportTenants = document.getElementById('btn-export-tenants');
    if (btnExportTenants) {
      btnExportTenants.onclick = async () => {
        try {
          setOperationStatus('Exporting tenant list...');
          let tenants = [];
          if(window.RS_API) {
            const out = await RS_API.admin({ action: 'list_tenants' }).catch(()=>({}));
            if(out && out.tenants) tenants = out.tenants;
          }
          if (!tenants || !tenants.length) {
            finishOperationStatus('No tenants to export', 'error');
            return toast('No tenants to export', 'fa-circle-exclamation');
          }
          const headers = ['ID', 'Name', 'Slug', 'Outlet Type', 'Email', 'Phone', 'Username', 'Status', 'Plan Code', 'Subscription Status', 'MRR', 'Created At'];
          const csv = [
            headers.join(','),
            ...tenants.map(t => {
              const escCsv = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
              return [
                escCsv(t.id),
                escCsv(t.name || t.tenant_name),
                escCsv(t.slug),
                escCsv(t.outlet_type),
                escCsv(t.email),
                escCsv(t.phone),
                escCsv(t.username),
                escCsv(t.status),
                escCsv(t.plan_code),
                escCsv(t.subscription_status),
                Number(t.mrr) || 0,
                escCsv(t.created_at),
              ].join(',');
            })
          ].join('\n');
          RS.downloadFile(csv, 'text/csv;charset=utf-8;', `tenants-export-${fileDate()}.csv`);
          finishOperationStatus('Tenant export downloaded');
          toast('Tenants exported successfully', 'fa-circle-check');
        } catch (e) {
          console.error(e);
          finishOperationStatus('Tenant export failed', 'error');
          toast('Export failed: ' + e.message, 'fa-circle-exclamation');
        }
      };
    }
  }

  // Bind globally when document loads
  bindGlobalImportExportEvents();
  showAppliedUpdateNotice();
  window.setTimeout(() => checkForAppUpdate({ silent: true }), 5000);
  window.setInterval(() => checkForAppUpdate({ silent: true }), 2 * 60 * 1000);

  // Set default landing tab (role-first for staff)
  const roleHome =
    !isSuper && !isBrandAdmin && ROLE_HOME_TAB[staffRole]
      ? ROLE_HOME_TAB[staffRole]
      : 'pos-tab';
  const defaultTab = isSuper ? 'super-admin-tab' : (isBrandAdmin ? 'chain-dashboard-tab' : roleHome);
  const start = (location.hash || '#' + defaultTab).slice(1);
  activateTab((titles[start] || document.getElementById(start)) ? start : defaultTab);

  // Only run hydrate for outlet-level users (not superadmin or brandadmin)
  if(!isSuper && !isBrandAdmin) hydrate();

  // validate the stored session against the backend; only bounce if server explicitly rejects it
  (window.__configReady || Promise.resolve()).then(() => {
    if(window.RS_API && RS_API.configured){
      RS_API.validateSession().then(sess => {
        if(sess === null){ try{ RS_API.logout(); }catch(e){} location.href='login'; }
      }).catch(() => {
        console.warn('[RS] validateSession network error -- keeping local session alive.');
      });
    }
  }).catch(()=>{});

  function showOfflineLogoutLock(){
    if (window.RS_SHOW_OFFLINE_LOGOUT_LOCK) {
      window.RS_SHOW_OFFLINE_LOGOUT_LOCK();
      return;
    }
    toast('Logout is disabled while offline to prevent lock-out.', 'fa-circle-xmark');
  }

  function hasRecentCloudFailure(){
    const last = window.RS_LAST_CLOUD_ERROR;
    return !!(last && last.time && (Date.now() - last.time < 120000));
  }

  async function logoutWouldLockOut(){
    if (window.RS_OFFLINE_LOGOUT_LOCK_ACTIVE && window.RS_OFFLINE_LOGOUT_LOCK_ACTIVE()) return true;
    if (navigator.onLine === false || window.__OFFLINE_CONFIG__ || hasRecentCloudFailure()) return true;
    if (!(window.RS_API && RS_API.configured)) return false;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 1800) : null;
    try {
      const response = await fetch('/api/config?logout_probe=' + Date.now(), {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      return !response.ok;
    } catch(e) {
      return true;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Wire up logout button cleanly
  $$('.logout').forEach(b => {
    b.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if(await logoutWouldLockOut()){
        showOfflineLogoutLock();
        return;
      }
      const msg = "Warning: Logging out will end your session. Any unsaved cart items or local modifications will be cleared if another user logs in on this device. Do you want to proceed?";
      if(!confirm(msg)) return;
      if(window.RS_API) RS_API.logout();
      location.href = 'login';
    });
  });

  // superadmin toggle (role switch demo) -- only show for non-superadmin users
  if(!isSuper) {
    const roleSwitch = $('#role-switch');
    if (roleSwitch) roleSwitch.style.display = 'none';
    $$('.superadmin-only').forEach(el=>el.style.display='none');
  }
  if (!isBrandAdmin) {
    $$('.brandadmin-only').forEach(el=>el.style.display='none');
  }

  // Start periodic tab attention blinking check
  setInterval(() => {
    try { updateTabAttentionBlinking(); } catch(e) {}
  }, 2000);

})();
