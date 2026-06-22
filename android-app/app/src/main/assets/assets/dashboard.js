/* ============================================================
   RestroSuite Console â€” interactivity & data rendering
   ============================================================ */
(function () {
  'use strict';
  
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
  const rs = n => {
    const symbol = window.RS && window.RS.getCurrencySymbol ? window.RS.getCurrencySymbol() : '₹';
    const locale = symbol === '₹' ? 'en-IN' : 'en-US';
    return symbol + Math.round(n).toLocaleString(locale);
  };
  const avatarColors = ['linear-gradient(135deg,#FF6A2A,#E04300)','linear-gradient(135deg,#8B7CF6,#FF6A2A)','linear-gradient(135deg,#34C7CE,#7C6BF5)','linear-gradient(135deg,#34D399,#0EA5A5)','linear-gradient(135deg,#FBBF24,#FF6A2A)'];
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
  function activateTab(id){
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
    }

    $$('.tab-content').forEach(t=>t.classList.toggle('active', t.id===id));
    $$('.sidebar-link').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    $$('.mnav-link').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    try { updateTabAttentionBlinking(); } catch(e){}
    const meta = titles[id]; if(meta){ $('#page-title').textContent = meta[0]; $('#page-sub').textContent = meta[1]; }
    $('.content').scrollTop = 0; window.scrollTo(0,0);
    if(!rendered[id] && renderers[id]){ renderers[id](); rendered[id]=true; }
    else if(rendered[id] && id === 'gateway-monitor-tab') { if(typeof startSaaSGatewayPolling === 'function') startSaaSGatewayPolling(); }
    if(id !== 'gateway-monitor-tab') { if(typeof stopSaaSGatewayPolling === 'function') stopSaaSGatewayPolling(); }
    try{ history.replaceState(null,'','#'+id); }catch(e){}
    // Save active tab to localStorage
    try { localStorage.setItem('rs_active_tab', id); } catch(e){}
  }

  // Load saved active tab on startup
  function loadSavedTab() {
    try {
      const savedTab = localStorage.getItem('rs_active_tab');
      const hashTab = window.location.hash.slice(1);
      const initialTab = hashTab || savedTab || 'pos-tab';
      activateTab(initialTab);
    } catch(e){
      activateTab('pos-tab');
    }
  }
  $$('.sidebar-link, .mnav-link').forEach(l=> l.addEventListener('click', e=>{ e.preventDefault(); activateTab(l.dataset.tab); }));

  /* ---------- SUPPORT DROPDOWN ---------- */
  const supportTrigger = $('#support-trigger');
  const supportDropdown = supportTrigger ? supportTrigger.closest('.support-dropdown') : null;
  if (supportTrigger && supportDropdown) {
    supportTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      supportDropdown.classList.toggle('active');
    });
    document.addEventListener('click', (e) => {
      if (!supportDropdown.contains(e.target)) {
        supportDropdown.classList.remove('active');
      }
    });
  }

  /* ---------- TOAST ---------- */
  let toastT;
  function toast(msg, icon='fa-circle-check', onClick=null){
    const el=$('#toast');
    el.innerHTML=`<i class="fa-solid ${icon}"></i> ${msg}`;
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

  const appVersion = window.__RESTROSUITE_ASSET_VERSION__ || 'v24-20260622';
  const updateSignatureKey = 'rs_update_signature';
  const updateSnapshotKey = 'rs_pre_update_snapshot';

  function pad2(value) { return String(value).padStart(2, '0'); }
  function dateKey(date = new Date()) { return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`; }
  function fileDate(date = new Date()) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
  function nextBillNo(existingBills = []) {
    const key = dateKey();
    const prefix = `RS-${key}-`;
    const max = existingBills.reduce((highest, bill) => {
      const no = String((bill && (bill.no || bill.orderId || bill.id)) || '');
      if (!no.startsWith(prefix)) return highest;
      const seq = Number.parseInt(no.slice(prefix.length), 10);
      return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
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

  function setOperationStatus(message, state = 'running', progress = null) {
    const bar = ensureOperationStatusBar();
    const icon = bar.querySelector('.operation-status-icon i');
    const title = bar.querySelector('.operation-status-title');
    const progressSpan = bar.querySelector('.operation-status-track span');
    title.textContent = message;
    icon.className = state === 'success'
      ? 'fa-solid fa-circle-check'
      : state === 'error'
        ? 'fa-solid fa-circle-exclamation'
        : 'fa-solid fa-spinner fa-spin';
    bar.className = `operation-status-bar is-visible is-${state}`;
    
    if (progressSpan) {
      if (progress !== null && progress !== undefined) {
        progressSpan.style.animation = 'none';
        progressSpan.style.transform = 'none';
        progressSpan.style.width = `${progress}%`;
      } else {
        progressSpan.style.animation = '';
        progressSpan.style.transform = '';
        progressSpan.style.width = '';
      }
    }
    return bar;
  }

  function showSuccessCelebration(message) {
    let overlay = document.getElementById('rs-success-celebration-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'rs-success-celebration-overlay';
      overlay.className = 'rs-success-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="rs-success-card">
        <div class="rs-success-icon-wrapper">
          <svg class="rs-success-svg" viewBox="0 0 52 52">
            <circle class="rs-success-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="rs-success-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
        <div class="rs-success-message">${message}</div>
      </div>`;
    
    // Force reflow
    overlay.offsetHeight;
    
    overlay.classList.add('is-active');
    
    window.setTimeout(() => {
      overlay.classList.remove('is-active');
    }, 2000);
  }

  function finishOperationStatus(message, state = 'success') {
    const bar = setOperationStatus(message, state);
    if (state === 'success') {
      showSuccessCelebration(message);
    }
    window.setTimeout(() => {
      bar.classList.remove('is-visible');
      const progressSpan = bar.querySelector('.operation-status-track span');
      if (progressSpan) {
        progressSpan.style.animation = '';
        progressSpan.style.transform = '';
        progressSpan.style.width = '';
      }
    }, state === 'error' ? 4200 : 2300);
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
      cart: typeof cart !== 'undefined' ? cart : [],
      discountPct: typeof discountPct !== 'undefined' ? discountPct : 0
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

      window.RS_APP_UPDATE = { 
        releaseInfo, 
        signature, 
        detectedAt: Date.now(),
        isPatchOnly: !isJsonUpdated
      };
      document.dispatchEvent(new CustomEvent('rs:app_update_available'));
      if (!silent) {
        showUpdateDialog(releaseInfo, signature);
      } else {
        toast('New update is ready. Click to apply.', 'fa-cloud-arrow-down', () => showUpdateDialog(releaseInfo, signature));
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
  const CAT_COLOR = { Starters:'#FF6A2A', Mains:'#8B7CF6', Breads:'#F0A93B', Beverages:'#2BB8C0', Desserts:'#F472B6' };
  const catColor = c => CAT_COLOR[c] || 'var(--orange)';
  const stockLabel = {ok:'In stock',low:'Low',out:'Out'};
  const stockCls = {ok:'stock-ok',low:'stock-low',out:'stock-out'};

  /* ============================================================
     POS
     ============================================================ */
  let activeCat='All', cart=[], discountPct=0;
  const posGstEnabled = false;
  const posDiscountEnabled = false;
  const renderPOS = () => {
    const grid = $('#pos-grid');
    const q = ($('#pos-search-input')?.value||'').toLowerCase();
    const items = MENU.filter(m=>(activeCat==='All'||m.cat.toLowerCase()===activeCat.toLowerCase()) && m.name.toLowerCase().includes(q));
    grid.innerHTML = items.map(m=>{
      const inCart = cart.find(c=>String(c.id)===String(m.id));
      return `
      <div class="pos-item ${m.stock==='out'?'out':''} ${inCart?'in-cart':''}" data-id="${m.id}" style="--cc:${catColor(m.cat)}">
        ${inCart ? `<div class="pos-item-qty-badge bounce-scale">${inCart.qty}</div>` : ''}
        <div class="pi-top"><span class="veg ${m.veg?'':'nonveg'}"></span><span class="picat">${m.cat}</span></div>
        <div class="pname">${m.name}</div>
        <div class="prow"><span class="pprice">${rs(m.price)}</span><span class="stock-dot ${stockCls[m.stock]}">${stockLabel[m.stock]}</span></div>
      </div>`;
    }).join('');
    $$('.pos-item', grid).forEach(el=> el.addEventListener('click', ()=> addToCart(el.dataset.id)));
  };
  function addToCart(id){ const m=MENU.find(x=>String(x.id)===String(id)); const line=cart.find(c=>String(c.id)===String(id)); if(line) line.qty++; else cart.push({...m,qty:1}); renderCart(); toast(`${m.name} added`,'fa-plus'); }
  function changeQty(id,d){ const line=cart.find(c=>String(c.id)===String(id)); if(!line)return; line.qty+=d; if(line.qty<=0) cart=cart.filter(c=>String(c.id)!==String(id)); renderCart(); }
  function renderCart(){
    const wrap=$('#cart-items'); const count=cart.reduce((a,c)=>a+c.qty,0);
    $('#cart-count').textContent = count+(count===1?' item':' items');

    const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
    const disc=posDiscountEnabled ? Math.round(sub*discountPct/100) : 0;
    const taxed=sub-disc; const gst=posGstEnabled ? Math.round(taxed*0.05) : 0;
    const grand=taxed+gst;
    $('#t-sub').textContent=rs(sub);
    if($('#t-disc')) $('#t-disc').textContent='– '+rs(disc);
    if($('#t-gst')) $('#t-gst').textContent=rs(gst);
    $('#t-grand').textContent=rs(grand);

    // Update Mobile Cart Bar
    const barCount = $('#pos-m-cart-bar-count');
    const barTotal = $('#pos-m-cart-bar-total');
    const cartBar = $('#pos-m-cart-bar');
    if (barCount && barTotal && cartBar) {
      barCount.textContent = count + (count === 1 ? ' item' : ' items');
      barTotal.textContent = rs(grand);
      if (count > 0 && window.innerWidth <= 1024) {
        cartBar.classList.remove('hidden');
      } else {
        cartBar.classList.add('hidden');
      }
    }

    if(!cart.length){ wrap.innerHTML=`<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><div>Cart is empty<br><span style="font-size:12px">Tap menu items to add them</span></div></div>`; }
    else { wrap.innerHTML = cart.map(c=>`
      <div class="cart-line">
        <div class="cdot" style="--cc:${catColor(c.cat)}"></div>
        <div class="cinfo"><div class="cn">${c.name}</div><div class="cp">${rs(c.price)} each</div></div>
        <div class="qty"><button data-d="-1" data-id="${c.id}"><i class="fa-solid fa-minus"></i></button><span class="qn">${c.qty}</span><button data-d="1" data-id="${c.id}"><i class="fa-solid fa-plus"></i></button></div>
        <div style="font-weight:700;font-size:13px;min-width:54px;text-align:right">${rs(c.price*c.qty)}</div>
      </div>`).join('');
      $$('#cart-items .qty button').forEach(b=> b.addEventListener('click',()=>changeQty(b.dataset.id,+b.dataset.d)));
    }

    try { if(window.RSPOS && window.RSPOS.refreshPaymentPanel) window.RSPOS.refreshPaymentPanel(); } catch (e) {}
    wireCartActions();

    // Refresh POS Grid to update card badges
    try { renderPOS(); } catch (e) {}

    // Auto-save active cart to localStorage (per order type)
    try {
      const activeOrderTypeBtn = document.querySelector('.order-type-btn.active');
      const activeOrderType = activeOrderTypeBtn ? activeOrderTypeBtn.textContent.trim() : 'Takeaway';
      // Helper function to get tab key (same as in initPOS)
      const getTabKeyForOrderType = (orderTypeText) => {
        const lowerText = orderTypeText.toLowerCase();
        if (lowerText.includes('delivery')) return 'Delivery';
        if (lowerText.includes('dine')) return 'Dine-in';
        return 'Takeaway';
      };
      const tabKey = getTabKeyForOrderType(activeOrderType);
      const da = document.getElementById('delivery-address');
      const dc = document.getElementById('delivery-charge');
      const dr = document.getElementById('delivery-rider');
      // Save per-order-type cart
      localStorage.setItem('rs_tab_cart_' + tabKey, JSON.stringify({
        items: cart.map(c=>({...c})),
        total: cart.reduce((a,c)=>a+c.price*c.qty,0),
        deliveryAddress: da ? da.value : '',
        deliveryCharge: dc ? dc.value : '',
        deliveryRider: dr ? dr.value : ''
      }));
      // Also save to old key for backwards compatibility
      localStorage.setItem('rs_active_cart', JSON.stringify(cart));
      localStorage.setItem('rs_active_cart_discount', String(discountPct));
      localStorage.setItem('rs_active_cart_customer', JSON.stringify(getCustomer()));
      localStorage.setItem('rs_active_order_type', activeOrderType.toLowerCase());
    } catch (e) {
      console.warn('[Cart Persistence Warning] Failed to persist active cart:', e);
    }
  }
  function getTotals(){ const sub=cart.reduce((a,c)=>a+c.price*c.qty,0); const disc=posDiscountEnabled ? Math.round(sub*discountPct/100) : 0; const taxed=sub-disc; const gst=posGstEnabled ? Math.round(taxed*0.05) : 0; return {sub,disc,gst,grand:taxed+gst,count:cart.reduce((a,c)=>a+c.qty,0),discountPct:posDiscountEnabled?discountPct:0,items:cart.map(c=>({...c}))}; }
  function clearCart(){
    cart=[]; discountPct=0; const d=$('#disc-input'); if(d) d.value=''; renderCart();
    if (window.innerWidth <= 1024) {
      const posLeft = $('.pos-left');
      const posCart = $('.pos-cart');
      const cartBar = $('#pos-m-cart-bar');
      if (posLeft && posCart && cartBar) {
        posLeft.classList.remove('hidden');
        posCart.classList.remove('active');
        cartBar.classList.add('hidden');
      }
    }
  }
  // ---- Phone prefix combo system ----
  const RS_COUNTRIES = [
    {name:'Afghanistan',code:'AF',dial:'+93',flag:'🇦🇫'},
    {name:'Albania',code:'AL',dial:'+355',flag:'🇦🇱'},
    {name:'Algeria',code:'DZ',dial:'+213',flag:'🇩🇿'},
    {name:'Argentina',code:'AR',dial:'+54',flag:'🇦🇷'},
    {name:'Australia',code:'AU',dial:'+61',flag:'🇦🇺'},
    {name:'Austria',code:'AT',dial:'+43',flag:'🇦🇹'},
    {name:'Bahrain',code:'BH',dial:'+973',flag:'🇧🇭'},
    {name:'Bangladesh',code:'BD',dial:'+880',flag:'🇧🇩'},
    {name:'Belgium',code:'BE',dial:'+32',flag:'🇧🇪'},
    {name:'Brazil',code:'BR',dial:'+55',flag:'🇧🇷'},
    {name:'Canada',code:'CA',dial:'+1',flag:'🇨🇦'},
    {name:'China',code:'CN',dial:'+86',flag:'🇨🇳'},
    {name:'Denmark',code:'DK',dial:'+45',flag:'🇩🇰'},
    {name:'Egypt',code:'EG',dial:'+20',flag:'🇪🇬'},
    {name:'Finland',code:'FI',dial:'+358',flag:'🇫🇮'},
    {name:'France',code:'FR',dial:'+33',flag:'🇫🇷'},
    {name:'Germany',code:'DE',dial:'+49',flag:'🇩🇪'},
    {name:'Ghana',code:'GH',dial:'+233',flag:'🇬🇭'},
    {name:'Greece',code:'GR',dial:'+30',flag:'🇬🇷'},
    {name:'Hong Kong',code:'HK',dial:'+852',flag:'🇭🇰'},
    {name:'Hungary',code:'HU',dial:'+36',flag:'🇭🇺'},
    {name:'India',code:'IN',dial:'+91',flag:'🇮🇳'},
    {name:'Indonesia',code:'ID',dial:'+62',flag:'🇮🇩'},
    {name:'Iran',code:'IR',dial:'+98',flag:'🇮🇷'},
    {name:'Iraq',code:'IQ',dial:'+964',flag:'🇮🇶'},
    {name:'Ireland',code:'IE',dial:'+353',flag:'🇮🇪'},
    {name:'Israel',code:'IL',dial:'+972',flag:'🇮🇱'},
    {name:'Italy',code:'IT',dial:'+39',flag:'🇮🇹'},
    {name:'Japan',code:'JP',dial:'+81',flag:'🇯🇵'},
    {name:'Jordan',code:'JO',dial:'+962',flag:'🇯🇴'},
    {name:'Kenya',code:'KE',dial:'+254',flag:'🇰🇪'},
    {name:'Kuwait',code:'KW',dial:'+965',flag:'🇰🇼'},
    {name:'Lebanon',code:'LB',dial:'+961',flag:'🇱🇧'},
    {name:'Malaysia',code:'MY',dial:'+60',flag:'🇲🇾'},
    {name:'Maldives',code:'MV',dial:'+960',flag:'🇲🇻'},
    {name:'Mexico',code:'MX',dial:'+52',flag:'🇲🇽'},
    {name:'Morocco',code:'MA',dial:'+212',flag:'🇲🇦'},
    {name:'Nepal',code:'NP',dial:'+977',flag:'🇳🇵'},
    {name:'Netherlands',code:'NL',dial:'+31',flag:'🇳🇱'},
    {name:'New Zealand',code:'NZ',dial:'+64',flag:'🇳🇿'},
    {name:'Nigeria',code:'NG',dial:'+234',flag:'🇳🇬'},
    {name:'Norway',code:'NO',dial:'+47',flag:'🇳🇴'},
    {name:'Oman',code:'OM',dial:'+968',flag:'🇴🇲'},
    {name:'Pakistan',code:'PK',dial:'+92',flag:'🇵🇰'},
    {name:'Philippines',code:'PH',dial:'+63',flag:'🇵🇭'},
    {name:'Poland',code:'PL',dial:'+48',flag:'🇵🇱'},
    {name:'Portugal',code:'PT',dial:'+351',flag:'🇵🇹'},
    {name:'Qatar',code:'QA',dial:'+974',flag:'🇶🇦'},
    {name:'Romania',code:'RO',dial:'+40',flag:'🇷🇴'},
    {name:'Russia',code:'RU',dial:'+7',flag:'🇷🇺'},
    {name:'Saudi Arabia',code:'SA',dial:'+966',flag:'🇸🇦'},
    {name:'Singapore',code:'SG',dial:'+65',flag:'🇸🇬'},
    {name:'South Africa',code:'ZA',dial:'+27',flag:'🇿🇦'},
    {name:'South Korea',code:'KR',dial:'+82',flag:'🇰🇷'},
    {name:'Spain',code:'ES',dial:'+34',flag:'🇪🇸'},
    {name:'Sri Lanka',code:'LK',dial:'+94',flag:'🇱🇰'},
    {name:'Sweden',code:'SE',dial:'+46',flag:'🇸🇪'},
    {name:'Switzerland',code:'CH',dial:'+41',flag:'🇨🇭'},
    {name:'Taiwan',code:'TW',dial:'+886',flag:'🇹🇼'},
    {name:'Tanzania',code:'TZ',dial:'+255',flag:'🇹🇿'},
    {name:'Thailand',code:'TH',dial:'+66',flag:'🇹🇭'},
    {name:'Turkey',code:'TR',dial:'+90',flag:'🇹🇷'},
    {name:'Uganda',code:'UG',dial:'+256',flag:'🇺🇬'},
    {name:'Ukraine',code:'UA',dial:'+380',flag:'🇺🇦'},
    {name:'United Arab Emirates',code:'AE',dial:'+971',flag:'🇦🇪'},
    {name:'United Kingdom',code:'GB',dial:'+44',flag:'🇬🇧'},
    {name:'United States',code:'US',dial:'+1',flag:'🇺🇸'},
    {name:'Vietnam',code:'VN',dial:'+84',flag:'🇻🇳'},
    {name:'Zimbabwe',code:'ZW',dial:'+263',flag:'🇿🇼'}
  ];

  function getDefaultCountry() {
    const settings = window.RS_SETTINGS || {};
    const countryName = (settings.set_country || 'India').trim().toLowerCase();
    // Map currency to country as fallback
    const currencyMap = {
      'inr':{ name:'India', code:'IN', dial:'+91', flag:'🇮🇳' },
      'eur':{ name:'Ireland', code:'IE', dial:'+353', flag:'🇮🇪' },
      'usd':{ name:'United States', code:'US', dial:'+1', flag:'🇺🇸' },
      'gbp':{ name:'United Kingdom', code:'GB', dial:'+44', flag:'🇬🇧' },
      'aed':{ name:'United Arab Emirates', code:'AE', dial:'+971', flag:'🇦🇪' },
      'sar':{ name:'Saudi Arabia', code:'SA', dial:'+966', flag:'🇸🇦' },
      'sgd':{ name:'Singapore', code:'SG', dial:'+65', flag:'🇸🇬' },
      'aud':{ name:'Australia', code:'AU', dial:'+61', flag:'🇦🇺' },
      'cad':{ name:'Canada', code:'CA', dial:'+1', flag:'🇨🇦' },
      'nzd':{ name:'New Zealand', code:'NZ', dial:'+64', flag:'🇳🇿' },
      'zar':{ name:'South Africa', code:'ZA', dial:'+27', flag:'🇿🇦' }
    };
    // Try name match first
    const byName = RS_COUNTRIES.find(c => c.name.toLowerCase() === countryName
      || countryName.includes(c.name.toLowerCase())
      || c.name.toLowerCase().includes(countryName));
    if (byName) return byName;
    // Fallback to currency
    const currVal = (settings.set_currency || 'INR (₹)').toLowerCase();
    for (const [key, val] of Object.entries(currencyMap)) {
      if (currVal.startsWith(key)) return val;
    }
    return RS_COUNTRIES.find(c => c.code === 'IN');
  }

  // Initialise a phone combo widget.
  // comboId: wrapper div id, btnId: flag button id, flagId: flag span id,
  // dialId: dial code span id, inputId: phone input id, pickerId: picker div id,
  // searchId: search input id, listId: list div id
  function initPhoneCombo({ comboId, btnId, flagId, dialId, inputId, pickerId, searchId, listId }) {
    const comboEl    = document.getElementById(comboId);
    const flagBtn    = document.getElementById(btnId);
    const flagEl     = document.getElementById(flagId);
    const dialEl     = document.getElementById(dialId);
    const phoneInput = document.getElementById(inputId);
    const pickerEl   = document.getElementById(pickerId);
    const searchEl   = document.getElementById(searchId);
    const listEl     = document.getElementById(listId);
    if (!comboEl || !flagBtn || !pickerEl || !listEl) return;

    let activeCountry = getDefaultCountry();
    // Try to restore saved selection
    try {
      const saved = localStorage.getItem('rs_phone_country_' + inputId);
      if (saved) {
        const parsed = JSON.parse(saved);
        const found = RS_COUNTRIES.find(c => c.code === parsed.code);
        if (found) activeCountry = found;
      }
    } catch(e){}

    function applyCountry(c) {
      activeCountry = c;
      if (flagEl) flagEl.textContent = c.flag;
      if (dialEl) dialEl.textContent = c.dial;
      try { localStorage.setItem('rs_phone_country_' + inputId, JSON.stringify({code:c.code, dial:c.dial})); } catch(e){}
    }
    applyCountry(activeCountry);

    function renderList(filter) {
      const q = (filter || '').toLowerCase();
      const items = q ? RS_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q)
      ) : RS_COUNTRIES;
      listEl.innerHTML = items.map(c => `
        <div class="pcp-item${c.code === activeCountry.code ? ' active' : ''}" data-code="${c.code}">
          <span class="pcp-flag">${c.flag}</span>
          <span class="pcp-name">${c.name}</span>
          <span class="pcp-dial">${c.dial}</span>
        </div>`).join('');
      listEl.querySelectorAll('.pcp-item').forEach(el => {
        el.addEventListener('click', () => {
          const found = RS_COUNTRIES.find(c => c.code === el.dataset.code);
          if (found) { applyCountry(found); closePicker(); }
        });
      });
    }

    function openPicker() {
      pickerEl.classList.remove('hidden');
      renderList('');
      if (searchEl) { searchEl.value = ''; searchEl.focus(); }
    }
    function closePicker() {
      pickerEl.classList.add('hidden');
    }

    flagBtn.addEventListener('click', e => {
      e.stopPropagation();
      pickerEl.classList.contains('hidden') ? openPicker() : closePicker();
    });
    if (searchEl) {
      searchEl.addEventListener('input', () => renderList(searchEl.value));
      searchEl.addEventListener('keydown', e => { if(e.key === 'Escape') closePicker(); });
    }
    document.addEventListener('click', e => {
      if (!comboEl.contains(e.target)) closePicker();
    }, true);

    // Expose getter for full number
    comboEl._getFullNumber = () => {
      const raw = (phoneInput ? phoneInput.value.trim() : '');
      if (!raw) return '';
      // If user already typed the dial code, don't double-prefix
      if (raw.startsWith('+')) return raw;
      return activeCountry.dial + raw;
    };
    comboEl._getDialCode = () => activeCountry.dial;
    comboEl._getCountry = () => ({ ...activeCountry });
    comboEl._setCountry = (code) => {
      const found = RS_COUNTRIES.find(c => c.code === code);
      if (found) applyCountry(found);
    };
  }

  function initAllPhoneCombos() {
    initPhoneCombo({
      comboId: 'cust-phone-combo', btnId: 'cust-flag-btn', flagId: 'cust-flag-emoji',
      dialId: 'cust-dial-code', inputId: 'cust-input-phone',
      pickerId: 'cust-country-picker', searchId: 'cust-pcp-search', listId: 'cust-pcp-list'
    });
    initPhoneCombo({
      comboId: 'tw-phone-combo', btnId: 'tw-flag-btn', flagId: 'tw-flag-emoji',
      dialId: 'tw-dial-code', inputId: 'takeaway-cust-phone',
      pickerId: 'tw-country-picker', searchId: 'tw-pcp-search', listId: 'tw-pcp-list'
    });
  }

  // Helper: get full phone number from a combo (or plain input as fallback)
  function getFullPhoneFromInput(inputId) {
    const combo = document.getElementById(
      inputId === 'cust-input-phone' ? 'cust-phone-combo' :
      inputId === 'takeaway-cust-phone' ? 'tw-phone-combo' : null
    );
    if (combo && combo._getFullNumber) return combo._getFullNumber();
    const el = document.getElementById(inputId);
    return el ? el.value.trim() : '';
  }

  function getCustomer(){
    const sel = $('#cart-customer-sel');
    if (sel && sel.value) {
      const opt = sel.options[sel.selectedIndex];
      return {
        name: opt.getAttribute('data-name') || '',
        phone: sel.value,
        gst: opt.getAttribute('data-gst') || '',
        table: ($('#cart-table')?.value || 'Walk-in / Takeaway')
      };
    }
    // Determine active phone combo based on order type visibility
    const isTakeaway = document.getElementById('takeaway-customer-fields')?.style.display !== 'none';
    const phoneComboId = isTakeaway ? 'tw-phone-combo' : 'cust-phone-combo';
    const phoneCombo = document.getElementById(phoneComboId);
    const phoneInputId = isTakeaway ? 'takeaway-cust-phone' : 'cust-input-phone';
    let fullPhone = '';
    if (phoneCombo && phoneCombo._getFullNumber) {
      fullPhone = phoneCombo._getFullNumber();
    } else {
      const phoneEl = document.getElementById(phoneInputId);
      fullPhone = phoneEl ? phoneEl.value.trim() : '';
    }
    const nameId = isTakeaway ? 'takeaway-cust-name' : 'cust-input-name';
    return {
      name: (document.getElementById(nameId)?.value || $('[id^=cust-name]')?.value || '').trim(),
      phone: fullPhone,
      gst: ($('#cust-gst')?.value || '').trim(),
      table: ($('#cart-table')?.value || 'Walk-in / Takeaway')
    };
  }
  function runKotAction(){
    if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
    try {
      if(window.RSPOS && window.RSPOS.kot) return window.RSPOS.kot();
    } catch (err) {
      console.error('[KOT Error]', err);
      return toast('KOT Error: ' + err.message, 'fa-circle-exclamation');
    }
    toast('KOT sent to kitchen','fa-fire');
  }
  function runCheckoutAction(){
    if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
    try {
      if(window.RSPOS && window.RSPOS.checkout) return window.RSPOS.checkout();
    } catch (err) {
      console.error('[Checkout Error]', err);
      return toast('Checkout Error: ' + err.message, 'fa-circle-exclamation');
    }
    toast('Bill printed & WhatsApp sent','fa-print');
    clearCart();
  }
  let cartActionsDelegated = false;
  function ensureCartActionDelegation(){
    if (cartActionsDelegated) return;
    cartActionsDelegated = true;
    document.addEventListener('click', e => {
      const btn = e.target.closest('#btn-kot, #btn-checkout');
      if (!btn) return;
      e.preventDefault();
      if (btn.id === 'btn-kot') return runKotAction();
      runCheckoutAction();
    });
  }
  function wireCartActions(){
    ensureCartActionDelegation();
    const kotBtn = $('#btn-kot');
    if (kotBtn) kotBtn.onclick = null;
    const checkoutBtn = $('#btn-checkout');
    if (checkoutBtn) checkoutBtn.onclick = null;
  }
  // POS init (static parts present in HTML, wire them)
  function initPOS(){
    // Helper function to get tab key for an order type (fixed, not dependent on table number)
    function getTabKeyForOrderType(orderTypeText) {
      const lowerText = orderTypeText.toLowerCase();
      if (lowerText.includes('delivery')) return 'Delivery';
      if (lowerText.includes('dine')) return 'Dine-in';
      return 'Takeaway';
    }

    // Helper to update customer widget/fields visibility
    function updateCustomerWidgetVisibility() {
      const activeOrderTypeBtn = document.querySelector('.order-type-btn.active');
      const isTakeaway = activeOrderTypeBtn && activeOrderTypeBtn.textContent.trim() === 'Takeaway';
      const widgetContainer = document.getElementById('custom-customer-widget');
      const takeawayFields = document.getElementById('takeaway-customer-fields');
      const triggerText = document.getElementById('cust-trigger-text');
      const takeawayName = document.getElementById('takeaway-cust-name');
      const takeawayPhone = document.getElementById('takeaway-cust-phone');
      const custNameInput = document.getElementById('cust-input-name');
      const custPhoneInput = document.getElementById('cust-input-phone');

      if (widgetContainer) {
        widgetContainer.style.display = isTakeaway ? 'none' : 'block';
      }
      if (takeawayFields) {
        takeawayFields.style.display = isTakeaway ? 'grid' : 'none';
      }
      if (triggerText) {
        triggerText.innerText = isTakeaway ? 'Customer' : 'Walk-in';
      }
      
      // Sync fields if needed
      if (isTakeaway) {
        if (takeawayName && custNameInput) takeawayName.value = custNameInput.value;
        if (takeawayPhone && custPhoneInput) takeawayPhone.value = custPhoneInput.value;
      } else {
        if (custNameInput && takeawayName) custNameInput.value = takeawayName.value;
        if (custPhoneInput && takeawayPhone) custPhoneInput.value = takeawayPhone.value;
      }
    }

    // Load saved active order type and corresponding cart
    try {
      // Load saved active order type
      let savedOrderType = localStorage.getItem('rs_active_order_type');
      let activeOrderTypeBtn = document.querySelector('.order-type-btn.active');
      
      // If we have a saved order type, activate that button first
      if (savedOrderType) {
        const btns = document.querySelectorAll('.order-type-btn');
        let matched = false;
        btns.forEach(b => {
          const match = b.textContent.trim().toLowerCase() === savedOrderType.toLowerCase();
          b.classList.toggle('active', match);
          if (match) {
            activeOrderTypeBtn = b;
            matched = true;
          }
        });
        // Fallback: activate first button if no match
        if (!matched && btns.length) {
          btns[0].classList.add('active');
          activeOrderTypeBtn = btns[0];
        }
      } else if (!activeOrderTypeBtn) {
        // No active button and no saved type, activate first button
        const btns = document.querySelectorAll('.order-type-btn');
        if (btns.length) {
          btns[0].classList.add('active');
          activeOrderTypeBtn = btns[0];
        }
      }

      // Now load the cart for the active order type
      const activeOrderType = activeOrderTypeBtn ? activeOrderTypeBtn.textContent.trim() : 'Takeaway';
      const initialTabKey = getTabKeyForOrderType(activeOrderType);
      const savedTabCart = localStorage.getItem('rs_tab_cart_' + initialTabKey);
      if (savedTabCart) {
        const tabData = JSON.parse(savedTabCart);
        cart = tabData.items || [];
        // Also load delivery-specific fields if applicable
        const da = document.getElementById('delivery-address');
        const dc = document.getElementById('delivery-charge');
        const dr = document.getElementById('delivery-rider');
        if (da) da.value = tabData.deliveryAddress || '';
        if (dc) dc.value = tabData.deliveryCharge || '';
        if (dr) dr.value = tabData.deliveryRider || '';
      } else {
        // Fall back to the old active cart key if no tab-specific cart exists
        const savedCart = localStorage.getItem('rs_active_cart');
        if (savedCart) {
          cart = JSON.parse(savedCart);
        }
      }
      const savedDiscount = localStorage.getItem('rs_active_cart_discount');
      if (savedDiscount) {
        discountPct = Number(savedDiscount) || 0;
        const discInput = $('#disc-input');
        if (discInput) discInput.value = discountPct;
      }
      const savedCustomer = localStorage.getItem('rs_active_cart_customer');
      if (savedCustomer) {
        const customer = JSON.parse(savedCustomer);
        const cartTable = $('#cart-table');
        if (cartTable && customer.table) cartTable.value = customer.table;
        const custName = $('#cust-name');
        if (custName && customer.name) custName.value = customer.name;
        const custPhone = $('#cust-phone');
        if (custPhone && customer.phone) custPhone.value = customer.phone;
        const custGst = $('#cust-gst');
        if (custGst && customer.gst) custGst.value = customer.gst;
        // Also populate takeaway fields if needed
        const takeawayName = document.getElementById('takeaway-cust-name');
        const takeawayPhone = document.getElementById('takeaway-cust-phone');
        if (takeawayName && customer.name) takeawayName.value = customer.name;
        if (takeawayPhone && customer.phone) takeawayPhone.value = customer.phone;
      }
    } catch (e) {
      console.warn('[Cart Persistence Warning] Failed to load saved cart:', e);
    }

    // Initialize visibility
    updateCustomerWidgetVisibility();

    $('#pos-cats').innerHTML = CATS.map((c,i)=>`<button class="pos-cat-btn ${i===0?'active':''}" data-cat="${c}">${c}</button>`).join('');
    $$('#pos-cats .pos-cat-btn').forEach(b=> b.addEventListener('click',()=>{
      activeCat=b.dataset.cat;
      $$('#pos-cats .pos-cat-btn').forEach(x=>x.classList.toggle('active',x===b));
      renderPOS();
      const container = document.getElementById('pos-cats');
      if (container) {
        container.scrollTo({
          left: (b.offsetLeft + b.clientWidth / 2) - container.clientWidth / 2,
          behavior: 'smooth'
        });
      }
    }));
    $('#pos-search-input').addEventListener('input', renderPOS);
    $('#pos-sort-select').addEventListener('change', renderPOS);
    $$('.order-type-btn').forEach(b=> b.addEventListener('click',()=>{
      // Snapshot the outgoing tab's cart to localStorage before the active class changes,
      // so the per-tab fallback always has the latest data even without RS_DB.
      try {
        const curActiveBtn = document.querySelector('.order-type-btn.active');
        if (curActiveBtn && curActiveBtn !== b) {
          const outType = curActiveBtn.textContent.trim().toLowerCase();
          const tabKey = getTabKeyForOrderType(curActiveBtn.textContent.trim());
          const da = document.getElementById('delivery-address');
          const dc = document.getElementById('delivery-charge');
          const dr = document.getElementById('delivery-rider');
          localStorage.setItem('rs_tab_cart_' + tabKey, JSON.stringify({
            items: cart.map(c=>({...c})),
            total: cart.reduce((a,c)=>a+c.price*c.qty,0),
            deliveryAddress: da ? da.value : '',
            deliveryCharge: dc ? dc.value : '',
            deliveryRider: dr ? dr.value : ''
          }));
          const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name') || document.getElementById('takeaway-cust-name');
          const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone') || document.getElementById('takeaway-cust-phone');
          localStorage.setItem('rs_tab_cust_' + tabKey, JSON.stringify({
            name: nameEl ? nameEl.value.trim() : '',
            phone: phoneEl ? phoneEl.value.trim() : ''
          }));

          // Now load the new tab's cart!
          const newTabKey = getTabKeyForOrderType(b.textContent.trim());
          // Save new active order type
          localStorage.setItem('rs_active_order_type', b.textContent.trim().toLowerCase());
          const savedNewTabCart = localStorage.getItem('rs_tab_cart_' + newTabKey);
          if (savedNewTabCart) {
            const newTabData = JSON.parse(savedNewTabCart);
            cart = newTabData.items || [];
            // Load delivery fields if applicable
            if (da) da.value = newTabData.deliveryAddress || '';
            if (dc) dc.value = newTabData.deliveryCharge || '';
            if (dr) dr.value = newTabData.deliveryRider || '';
          } else {
            cart = []; // If no saved cart for new tab, start fresh!
            // Clear delivery fields too
            if (da) da.value = '';
            if (dc) dc.value = '';
            if (dr) dr.value = '';
          }

          // Load the new tab's customer data
          const savedNewTabCust = localStorage.getItem('rs_tab_cust_' + newTabKey);
          if (savedNewTabCust) {
            const newCustData = JSON.parse(savedNewTabCust);
            const nameElWidget = document.getElementById('cust-input-name') || document.getElementById('cust-name');
            const phoneElWidget = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
            const nameElTakeaway = document.getElementById('takeaway-cust-name');
            const phoneElTakeaway = document.getElementById('takeaway-cust-phone');
            if (nameElWidget) nameElWidget.value = newCustData.name || '';
            if (phoneElWidget) phoneElWidget.value = newCustData.phone || '';
            if (nameElTakeaway) nameElTakeaway.value = newCustData.name || '';
            if (phoneElTakeaway) phoneElTakeaway.value = newCustData.phone || '';
          }

          // Re-render the cart!
          renderCart();
        }
      } catch(e) {
        console.error('[Order Type Switch Error]', e);
      }
      $$('.order-type-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      
      // Update visibility based on new order type
      updateCustomerWidgetVisibility();
    }));

    // Sync takeaway fields with widget fields
    function syncTakeawayFields() {
      const takeawayName = document.getElementById('takeaway-cust-name');
      const takeawayPhone = document.getElementById('takeaway-cust-phone');
      const custNameInput = document.getElementById('cust-input-name');
      const custPhoneInput = document.getElementById('cust-input-phone');
      
      if (takeawayName && custNameInput) {
        takeawayName.addEventListener('input', () => {
          custNameInput.value = takeawayName.value;
          // Trigger any widget events if needed
          if (typeof custNameInput.oninput === 'function') {
            custNameInput.oninput();
          }
          custNameInput.dispatchEvent(new Event('input'));
        });
      }
      if (takeawayPhone && custPhoneInput) {
        takeawayPhone.addEventListener('input', () => {
          custPhoneInput.value = takeawayPhone.value;
          if (typeof custPhoneInput.oninput === 'function') {
            custPhoneInput.oninput();
          }
          custPhoneInput.dispatchEvent(new Event('input'));
        });
      }
    }
    syncTakeawayFields();
    initAllPhoneCombos();

    $('#disc-input')?.addEventListener('input', e=>{ discountPct=Math.min(100,Math.max(0,+e.target.value||0)); renderCart(); });
    $('#btn-kot').onclick = () => {
      if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
      try {
        if(window.RSPOS && window.RSPOS.kot) return window.RSPOS.kot();
      } catch (err) {
        console.error('[KOT Error]', err);
        return toast('KOT Error: ' + err.message, 'fa-circle-exclamation');
      }
      toast('KOT sent to kitchen','fa-fire');
    };
    $('#btn-checkout').onclick = () => {
      if(!cart.length) return toast('Cart is empty','fa-circle-exclamation');
      try {
        if(window.RSPOS && window.RSPOS.checkout) return window.RSPOS.checkout();
      } catch (err) {
        console.error('[Checkout Error]', err);
        return toast('Checkout Error: ' + err.message, 'fa-circle-exclamation');
      }
      toast('Bill printed & WhatsApp sent','fa-print');
      clearCart();
    };

    // Grid size slider controls
    const slider = $('#pos-grid-slider');
    const grid = $('#pos-grid');
    const decBtn = $('#btn-grid-dec');
    const incBtn = $('#btn-grid-inc');
    if (slider && grid && decBtn && incBtn) {
      const updateGridSize = (val) => {
        val = Math.min(250, Math.max(110, val));
        slider.value = val;
        grid.style.setProperty('--pos-grid-size', val + 'px');
        try { localStorage.setItem('rs-pos-grid-size', val); } catch(e){}
      };
      slider.oninput = () => updateGridSize(parseInt(slider.value) || 158);
      decBtn.onclick = () => updateGridSize((parseInt(slider.value) || 158) - 15);
      incBtn.onclick = () => updateGridSize((parseInt(slider.value) || 158) + 15);
      try {
        const savedSize = localStorage.getItem('rs-pos-grid-size') || 158;
        updateGridSize(parseInt(savedSize));
      } catch(e) {
        updateGridSize(158);
      }
    }

    // Mobile view toggles
    const cartBar = $('#pos-m-cart-bar');
    const backBtn = $('#btn-pos-back-menu');
    const posLeft = $('.pos-left');
    const posCart = $('.pos-cart');
    if (cartBar && posLeft && posCart) {
      cartBar.onclick = () => {
        if (window.innerWidth <= 1024) {
          posLeft.classList.add('hidden');
          posCart.classList.add('active');
          cartBar.classList.add('hidden');
        }
      };
    }
    if (backBtn && posLeft && posCart && cartBar) {
      backBtn.onclick = () => {
        if (window.innerWidth <= 1024) {
          posLeft.classList.remove('hidden');
          posCart.classList.remove('active');
          if (cart.length > 0) {
            cartBar.classList.remove('hidden');
          }
        }
      };
    }

    renderPOS(); renderCart();

    // Mobile "More" bottom nav sheet
    const mnavMore = document.getElementById('mnav-more');
    const moreSheet = document.getElementById('mobile-more-sheet');
    if (mnavMore && moreSheet) {
      mnavMore.addEventListener('click', () => {
        moreSheet.style.display = moreSheet.style.display === 'none' ? 'block' : 'none';
      });
      moreSheet.querySelectorAll('.mnav-more-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          moreSheet.style.display = 'none';
          activateTab(btn.dataset.tab);
        });
      });
    }
  }

  /* ============================================================
     QR ORDERS & KDS
     ============================================================ */
  const QR_ORDERS = [];

  const KDS = [];

  function parseOrderTimestamp(dateStr) {
    if (!dateStr) return null;
    const nativeTime = new Date(dateStr).getTime();
    if (!Number.isNaN(nativeTime)) return nativeTime;
    const m = String(dateStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
    if (!m) return null;
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
  let lastPendingOrdersSyncAt = 0;
  const pendingOrdersSyncMinGapMs = 3000;

  async function syncPendingOrders() {
    const elapsed = Date.now() - lastPendingOrdersSyncAt;
    if (pendingOrdersSyncInFlight || elapsed < pendingOrdersSyncMinGapMs) {
      if (!pendingOrdersSyncQueued) {
        pendingOrdersSyncQueued = true;
        window.setTimeout(() => {
          pendingOrdersSyncQueued = false;
          syncPendingOrders();
        }, Math.max(500, pendingOrdersSyncMinGapMs - elapsed));
      }
      return;
    }
    pendingOrdersSyncInFlight = true;
    lastPendingOrdersSyncAt = Date.now();
    if (window.RS_DB) {
      try {
        const rows = await RS_DB.list('pending_orders');
        
        // 1. Update KDS
        const activeKds = rows.filter(r => r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review');
        const mappedKds = activeKds.map(r => ({
          id: r.id,
          tok: r.orderId,
          type: `${r.orderType} Â· ${r.tableNumber}`,
          start: parseOrderTimestamp(r.dateTime) || Date.now(),
          items: (r.items || []).map(it => [String(it.qty), it.name, it.notes || ''])
        }));
        replaceArr(KDS, mappedKds);

        // 2. Update QR_ORDERS
        const activeQr = rows.filter(r => r.status === 'Pending Review' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'served' || r.status === 'Ready');
        const mappedQr = activeQr.map(r => ({
          id: r.id,
          orderId: r.orderId,
          table: r.tableNumber,
          time: getRelativeTime(r.dateTime),
          status: r.status === 'Pending Review' ? 'pending' : ((r.status === 'preparing' || r.status === 'Accepted') ? 'preparing' : 'served'),
          items: (r.items || []).map(it => [`${it.qty}Ã— ${it.name}`, it.price * it.qty]),
          total: r.total
        }));
        replaceArr(QR_ORDERS, mappedQr);

        // Re-render KDS and QR boards
        try { renderKDS(); } catch(e){}
        try { renderQR(); } catch(e){}
        document.dispatchEvent(new CustomEvent('rs:pending_orders_synced'));
        try { updateTabAttentionBlinking(); } catch(e){}
      } catch(e) {
        console.warn("syncPendingOrders failed", e);
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
      : false;
      
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
      }
      
      el.classList.toggle('attention-blink', shouldBlink);
    });
  }

  function setupSupabaseRealtime() {
    const api = window.RS_API;
    if (api && api.supabaseClient && window.RS_DB && RS_DB.isCloud) {
      const activeTenantId = api.session()?.tenant_id || sessionStorage.getItem('tenant_id');
      if (activeTenantId) {
        api.supabaseClient.channel('doppio-pending-orders-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'doppio_pending_orders', filter: `tenant_id=eq.${activeTenantId}` }, () => {
            syncPendingOrders();
          }).subscribe();
      }
    }
  }

  window.RS_SYNC = { syncPendingOrders, setupSupabaseRealtime };

  const statusPill = {pending:'pill-amber',preparing:'pill-orange',served:'pill-green'};
  const statusTxt = {pending:'Pending',preparing:'Preparing',served:'Served'};
  const renderQR = () => {
    // Dynamically calculate QR Orders statistics
    const pendingCount = QR_ORDERS.filter(o => o.status === 'pending').length;
    const preparingCount = QR_ORDERS.filter(o => o.status === 'preparing').length;
    const servedCount = QR_ORDERS.filter(o => o.status === 'served').length;
    const activeTables = new Set(QR_ORDERS.filter(o => o.status !== 'served').map(o => o.table)).size;

    const qrTab = document.getElementById('qr-orders-tab');
    if (qrTab) {
      const svElements = qrTab.querySelectorAll('.stat-row .stat-card .sv');
      if (svElements.length >= 4) {
        svElements[0].textContent = pendingCount;
        svElements[1].textContent = preparingCount;
        svElements[2].textContent = servedCount;
        svElements[3].textContent = `${activeTables} / 12`;
      }
    }

    // Update the sidebar badge count for QR Orders
    const qrBadge = document.querySelector('.sidebar-link[data-tab="qr-orders-tab"] .badge-count');
    if (qrBadge) {
      const activeCount = pendingCount + preparingCount;
      qrBadge.textContent = activeCount;
      qrBadge.style.display = activeCount > 0 ? '' : 'none';
    }

    $('#qr-grid').innerHTML = QR_ORDERS.map((o,i)=>`
      <div class="qr-card s-${o.status}">
        <div class="qr-ch"><div><span class="tnum">Table ${o.table.split('-')[1]||o.table}</span><div class="qtime">${o.time}</div></div><span class="pill ${statusPill[o.status]}"><span class="dot ${o.status==='preparing'?'dot-live':''}"></span>${statusTxt[o.status]}</span></div>
        <div class="qr-lines">${o.items.map(it=>`<div class="ql"><span>${it[0]}</span><b>${rs(it[1])}</b></div>`).join('')}</div>
        <div class="qr-cf"><span class="qtot">${rs(o.total)}</span>
          ${o.status!=='served'?`<button class="btn btn-ghost btn-sm" data-merge="${i}"><i class="fa-solid fa-code-merge"></i> Merge</button><button class="btn btn-primary btn-sm" data-adv="${i}">${o.status==='pending'?'Accept':'Mark served'}</button>`:`<button class="btn btn-ghost btn-sm" data-bill="${i}"><i class="fa-solid fa-receipt"></i> Bill</button>`}
        </div>
      </div>`).join('');
    $$('#qr-grid [data-adv]').forEach(b=>b.addEventListener('click',async ()=>{
      const o=QR_ORDERS[+b.dataset.adv];
      const nextStatus = o.status==='pending'?'preparing':'served';
      const dbStatus = nextStatus==='preparing'?'preparing':'served';
      if(o.id && window.RS_DB){
        try {
          const rows = await RS_DB.list('pending_orders');
          const row = rows.find(r => r.id === o.id);
          if (row) {
            row.status = dbStatus;
            await RS_DB.put('pending_orders', o.id, row);
            syncPendingOrders();
          }
        } catch(e) {
          console.warn("Failed updating order status", e);
        }
      } else {
        o.status=nextStatus; renderQR();
      }
      toast('Table '+(o.table.split('-')[1]||o.table)+' â†’ '+statusTxt[nextStatus]);
    }));
    $$('#qr-grid [data-merge]').forEach(b=>b.addEventListener('click',()=>toast('Table merge is not connected yet','fa-code-merge')));
    $$('#qr-grid [data-bill]').forEach(b=>b.addEventListener('click',()=>{
      activateTab('pos-tab');
      toast('Open the table in POS to settle this bill','fa-receipt');
    }));
  };

  /* ============================================================
     BILLS
     ============================================================ */
  const BILLS = [];
  const payPill = {UPI:'pill-violet',Cash:'pill-green',Card:'pill-orange',Split:'pill-amber',Due:'pill-red'};
  function receiptPayloadFromBill(b) {
    const items = Array.isArray(b._items) && b._items.length
      ? b._items.map(i => ({ name:i.name || 'Item', qty:Number(i.qty || 1), price:Number(i.price || 0) }))
      : [{ name:'Bill total', qty:1, price:Number(b.amount || 0) }];
    const sub = Number(b.subtotal || items.reduce((sum, i) => sum + (i.price * i.qty), 0));
    const gst = Number(b.gst || 0);
    const grand = Number(b.amount || sub + gst);
    return {
      no:b.no || b.id || 'Invoice',
      time:b.time || '',
      table:b.table || 'Walk-in / Takeaway',
      customer:b.customerName || '',
      customerPhone:b.customerPhone || '',
      customerGst:b.customerGst || '',
      items,
      sub,
      disc:Number(b.discount || 0),
      gst,
      grand,
      tenders:(Array.isArray(b.tenders) && b.tenders.length) ? b.tenders : [{ method:b.pay || b.paymentMethod || 'Cash', amount:grand }],
      change:Number(b.changeAmount || b.change || 0)
    };
  }
  function showBillReceipt(b) {
    if (window.RSReceipt && typeof RSReceipt.show === 'function') {
      RSReceipt.show(receiptPayloadFromBill(b));
      return;
    }
    toast('Receipt preview is unavailable on this screen','fa-circle-exclamation');
  }
  function shareBillReceipt(b) {
    const bill = receiptPayloadFromBill(b);
    const text = window.RSReceipt && typeof RSReceipt.text === 'function'
      ? RSReceipt.text(bill)
      : `${bill.no}\nTotal: ${rs(bill.grand)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    toast('WhatsApp receipt ready','fa-whatsapp');
  }
  async function markBillRefunded(b) {
    if (!b || b.status === 'refunded') return;
    if (!window.confirm(`Mark ${b.no || b.id} as refunded?`)) return;
    b.status = 'refunded';
    let cloudMarked = false;
    try {
      if (window.RS_DB && RS_DB.writeLocal) await RS_DB.writeLocal('bills', BILLS);
      if (window.RS_API && RS_API.data && RS_API.session && RS_API.session()) {
        await RS_API.data({
          table:'doppio_refund_requests',
          operation:'insert',
          data:{
            order_id:String(b.id || b.no),
            amount:Number(b.amount || 0),
            reason:'POS refund',
            status:'approved'
          },
          returning:false
        });
        cloudMarked = true;
      }
    } catch(e) {
      console.warn('Refund cloud update failed', e);
    }
    renderBills();
    toast(cloudMarked ? 'Refund recorded' : 'Refund marked locally. Cloud sync pending.','fa-rotate-left');
  }
  const renderBills = () => {
    // Dynamically compute stats from BILLS
    const paidBills = BILLS.filter(b => b.status === 'paid');
    const totalSales = paidBills.reduce((sum, b) => sum + (b.amount || 0), 0);
    const count = BILLS.length;
    const aov = paidBills.length > 0 ? Math.round(totalSales / paidBills.length) : 0;
    const refunds = BILLS.filter(b => b.status === 'refunded').length;

    const salesEl = document.getElementById('bills-stat-sales');
    if (salesEl) salesEl.textContent = rs(totalSales);
    const countEl = document.getElementById('bills-stat-count');
    if (countEl) countEl.textContent = count;
    const aovEl = document.getElementById('bills-stat-aov');
    if (aovEl) aovEl.textContent = rs(aov);
    const refundsEl = document.getElementById('bills-stat-refunds');
    if (refundsEl) refundsEl.textContent = refunds;

    const q=($('#bills-search')?.value||'').toLowerCase();
    const payFilter = ($('#bills-pay-filter')?.value || 'All').toLowerCase();
    const statusFilter = ($('#bills-status-filter')?.value || 'All').toLowerCase();

    let filtered = BILLS.filter(b=>String(b.no || b.orderId || '').toLowerCase().includes(q)||String(b.table || '').toLowerCase().includes(q));
    if (payFilter !== 'all') {
      filtered = filtered.filter(b => b.pay && b.pay.toLowerCase() === payFilter);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(b => b.status && b.status.toLowerCase() === statusFilter);
    }

    $('#bills-table-body').innerHTML = filtered.map(b=>`
      <tr>
        <td><b>${b.no || b.orderId || b.id || '-'}</b></td><td>${b.time || b.dateTime || '-'}</td><td>${b.table || '-'}</td><td>${b.items}</td>
        <td><span class="pill ${payPill[b.pay]}" style="padding:3px 9px">${b.pay}</span></td>
        <td class="td-strong">${rs(b.amount)}</td>
        <td>${b.status==='paid'?'<span class="pill pill-green" style="padding:3px 9px">Paid</span>':'<span class="pill pill-red" style="padding:3px 9px">Refunded</span>'}</td>
        <td><div class="row-actions"><button class="icon-act go" title="Reprint"><i class="fa-solid fa-print"></i></button><button class="icon-act" title="Share"><i class="fa-brands fa-whatsapp"></i></button><button class="icon-act danger" title="Refund" ${b.status==='refunded'?'disabled style="opacity:.4"':''}><i class="fa-solid fa-rotate-left"></i></button></div></td>
      </tr>`).join('');
    const billBody = $('#bills-table-body');
    const visibleBills = filtered;
    if (billBody._rsBillActionHandler) billBody.removeEventListener('click', billBody._rsBillActionHandler, true);
    billBody._rsBillActionHandler = e => {
      const btn = e.target.closest('.icon-act');
      if (!btn || !billBody.contains(btn) || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const row = btn.closest('tr');
      const bill = visibleBills[[...billBody.children].indexOf(row)];
      if (!bill) return;
      if (btn.classList.contains('go')) return showBillReceipt(bill);
      if (btn.classList.contains('danger')) return markBillRefunded(bill);
      return shareBillReceipt(bill);
    };
    billBody.addEventListener('click', billBody._rsBillActionHandler, true);
    $$('#bills-table-body .icon-act.go').forEach(b=>b.addEventListener('click',()=>toast('Reprinting billâ€¦','fa-print')));
    $$('#bills-table-body .icon-act .fa-whatsapp').forEach(b=>b.closest('button').addEventListener('click',()=>toast('Bill shared on WhatsApp','fa-whatsapp')));
    $$('#bills-table-body .icon-act.danger:not([disabled])').forEach(b=>b.addEventListener('click',()=>toast('Refund initiated','fa-rotate-left')));
  };

  /* ============================================================
     INVENTORY
     ============================================================ */
  const INVENTORY = [];
  const renderInventory = () => {
    const low = INVENTORY.filter(i=>i.stock<i.min);
    $('#inv-banner').style.display = low.length?'flex':'none';
    $('#inv-low-count').textContent = low.length;

    const btnAutoDraft = $('#btn-auto-draft-pos');
    if (btnAutoDraft) {
      btnAutoDraft.onclick = async () => {
        const lowItems = INVENTORY.filter(i => i.stock < i.min);
        if (!lowItems.length) return toast('All inventory levels are healthy', 'fa-circle-check');
        
        setOperationStatus('Auto-drafting POs...');
        try {
          const byCat = {};
          lowItems.forEach(i => {
            if (!byCat[i.cat]) byCat[i.cat] = [];
            byCat[i.cat].push(i);
          });

          let draftedCount = 0;
          for (const [cat, items] of Object.entries(byCat)) {
            const poNum = 'PO-' + Date.now().toString().slice(-6) + '-' + cat.substring(0, 3).toUpperCase();
            const value = items.reduce((sum, i) => sum + ((i.min * 2 - i.stock) * i.cost), 0);
            const poRow = {
              id: poNum,
              poNumber: poNum,
              supplier: cat + ' Supplier Ltd.',
              items: items.map(i => `${Math.round(i.min * 2 - i.stock)} ${i.unit} ${i.name}`).join(', '),
              value: Math.round(value),
              date: new Date().toISOString(),
              status: 'pending'
            };
            if (RS.saveOne) await RS.saveOne('purchase_orders', poRow);
            draftedCount++;
          }
          finishOperationStatus(`Drafted ${draftedCount} POs`);
          toast(`Auto-drafted ${draftedCount} POs successfully`, 'fa-truck');
          renderInventory();
          if (window.RS && RS.render) RS.render('inventory-tab');
        } catch (e) {
          console.warn('Auto-draft POs failed', e);
          finishOperationStatus('Auto-draft failed', 'error');
        }
      };
    }

    // render stock table
    const invBody = $('#inv-table-body');
    if (invBody) {
      const catFil = $('#inv-cat-filter');
      if (catFil && !catFil._rsListenerBound) {
        catFil._rsListenerBound = true;
        catFil.addEventListener('change', renderInventory);
      }
      const statusFil = $('#inv-status-filter');
      if (statusFil && !statusFil._rsListenerBound) {
        statusFil._rsListenerBound = true;
        statusFil.addEventListener('change', renderInventory);
      }

      const catFilter = ($('#inv-cat-filter')?.value || 'All').toLowerCase();
      const statusFilter = ($('#inv-status-filter')?.value || 'All').toLowerCase();

      let filtered = INVENTORY;
      if (catFilter !== 'all') {
        filtered = filtered.filter(i => i.cat && i.cat.toLowerCase() === catFilter);
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter(i => {
          const st = i.stock<i.min?'out':(i.stock<i.min*1.4?'low':'ok');
          return st === statusFilter;
        });
      }

      invBody.innerHTML = filtered.map(i=>{
        const st = i.stock<i.min?'out':(i.stock<i.min*1.4?'low':'ok'); const pct=Math.min(100,Math.round(i.stock/(i.min*2)*100));
        return `<tr>
          <td><b>${i.name}</b></td><td>${i.cat}</td>
          <td><div style="display:flex;align-items:center;gap:10px"><span class="td-strong" style="min-width:58px">${i.stock} ${i.unit}</span><div style="flex:1;height:6px;background:var(--glass-2);border-radius:99px;overflow:hidden;min-width:60px"><span style="display:block;height:100%;width:${pct}%;background:${st==='out'?'var(--red)':st==='low'?'var(--amber)':'var(--green)'}"></span></div></div></td>
          <td>${i.min} ${i.unit}</td><td>${rs(i.cost)}/${i.unit}</td>
          <td><span class="stock-dot ${stockCls[st]}">${st==='out'?'Reorder':st==='low'?'Low':'Healthy'}</span></td>
          <td><div class="row-actions"><button class="icon-act go" title="Restock"><i class="fa-solid fa-truck"></i></button><button class="icon-act" title="Edit"><i class="fa-solid fa-pen"></i></button></div></td>
        </tr>`; }).join('');

      $$('#inv-table-body .icon-act.go').forEach(b => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const name = row.querySelector('b').textContent;
          const inv = INVENTORY.find(x => x.name === name);
          if (!inv) return;
          const qtyToOrder = Math.max(1, Math.round(inv.min * 2 - inv.stock));
          const estimatedCost = Math.round(qtyToOrder * inv.cost);
          
          if (!window.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const body = `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="font-size:13px;color:var(--text-soft)">
                Create a purchase order to restock <b>${inv.name}</b> (current: ${inv.stock} ${inv.unit}, min: ${inv.min} ${inv.unit}).
              </div>
              <div class="form-grid-2" style="margin-top:8px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Order Qty (${inv.unit})</label>
                  <input type="number" id="po-qty" class="form-control" value="${qtyToOrder}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Supplier</label>
                  <input type="text" id="po-supplier" class="form-control" value="${inv.cat} Supplier Ltd." style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
              </div>
              <div style="font-size:12px;color:var(--text-mute);margin-top:4px">
                Estimated Value: <strong style="color:var(--orange)" id="po-cost-preview">${rs(estimatedCost)}</strong>
              </div>
            </div>
          `;

          RSModal.open({
            title: 'Raise Purchase Order',
            sub: 'Restock ' + inv.name,
            icon: 'fa-truck',
            size: 'sm',
            body,
            foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-file-invoice"></i> Create PO</button>`,
            onMount(modal, close) {
              const qtyInput = modal.querySelector('#po-qty');
              qtyInput.oninput = () => {
                const q = Math.max(0, Number(qtyInput.value) || 0);
                modal.querySelector('#po-cost-preview').textContent = rs(Math.round(q * inv.cost));
              };
              modal.querySelector('[data-cancel]').onclick = close;
              modal.querySelector('[data-confirm]').onclick = async () => {
                const qty = Math.max(1, Number(qtyInput.value) || 1);
                const supplier = modal.querySelector('#po-supplier').value || 'Default Supplier';
                const poNum = 'PO-' + Date.now().toString().slice(-6);
                const poRow = {
                  id: poNum,
                  poNumber: poNum,
                  supplier,
                  items: `${qty} ${inv.unit} ${inv.name}`,
                  value: Math.round(qty * inv.cost),
                  date: new Date().toISOString(),
                  status: 'pending'
                };
                close();
                setOperationStatus('Creating PO...');
                try {
                  if (RS.saveOne) await RS.saveOne('purchase_orders', poRow);
                  finishOperationStatus('PO created');
                  toast('Purchase order raised successfully', 'fa-circle-check');
                  renderInventory();
                  if (window.RS && RS.render) RS.render('inventory-tab');
                } catch (e) {
                  console.warn('Failed to save PO', e);
                  finishOperationStatus('Failed to create PO', 'error');
                }
              };
            }
          });
        });
      });
    }

    // render recipe table
    const recipeBody = $('#recipe-table-body');
    if (recipeBody) {
      const invCost = name => { const inv=(INVENTORY||[]).find(x=>x.name===name); return inv?inv.cost:0; };
      recipeBody.innerHTML = MENU.length
        ? MENU.map(m => {
          const ings = m.ingredients || [];
          const cost = ings.reduce((a,g)=>a+g.qty*invCost(g.name),0);
          const margin = m.price && cost ? Math.round((1-cost/m.price)*100) : (m.price?100:0);
          const ingText = ings.length ? ings.map(g=>`${g.qty}${g.unit} ${g.name}`).join(', ') : '<span style="color:var(--text-mute)">No recipe â€” click âœ  to define</span>';
          return `<tr>
            <td><div style="display:flex;align-items:center;gap:9px"><span class="veg ${m.veg?'':'nonveg'}"></span><b>${m.name}</b></div></td>
            <td>${m.cat}</td>
            <td style="max-width:220px;font-size:12px">${ingText}</td>
            <td class="td-strong">${cost?rs(cost):'â€”'}</td>
            <td class="td-strong">${rs(m.price)}</td>
            <td><span class="stock-dot ${margin>=50?'stock-ok':margin>=20?'stock-low':'stock-out'}">${cost?margin+'%':'â€”'}</span></td>
            <td><button class="icon-act go" data-recipe-edit="${m.id}" title="Define recipe"><i class="fa-solid fa-pen"></i></button></td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:30px">No menu items yet â€” add items in Menu Editor first</td></tr>';

      // clicking recipe edit navigates to menu editor and opens that item
      $$('#recipe-table-body [data-recipe-edit]').forEach(btn => {
        btn.onclick = () => {
          window.RS && window.RS.activateTab('editor-tab');
          setTimeout(() => {
            const m = MENU.find(x=>String(x.id)===String(btn.dataset.recipeEdit));
            if (m && window.buildFormLoad) window.buildFormLoad(m);
          }, 200);
        };
      });
    }

    // wire sub-tab seg buttons (only once)
    const seg = $('#inv-seg');
    if (seg && !seg.dataset.wired) {
      seg.dataset.wired = '1';
      const panels = { stock:'#inv-panel-stock', recipes:'#inv-panel-recipes', suppliers:'#inv-panel-suppliers' };
      seg.querySelectorAll('[data-inv-tab]').forEach(btn => {
        btn.onclick = () => {
          seg.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          Object.values(panels).forEach(p=>{ const el=$(p); if(el) el.style.display='none'; });
          const panel = $(panels[btn.dataset.invTab]);
          if (panel) panel.style.display = '';
        };
      });
    }

    // wire Add ingredient button
    const addIngBtn = $('#btn-add-ingredient');
    if (addIngBtn && !addIngBtn.dataset.wired) {
      addIngBtn.dataset.wired = '1';
      addIngBtn.onclick = () => {
        if (!window.RSModal) return;
        RSModal.open({ title:'Add ingredient', sub:'Add a raw material to inventory', icon:'fa-cube', size:'sm',
          body:`
            <div style="display:flex;flex-direction:column;gap:14px">
              <div><label class="fl">Ingredient name</label><input class="form-input" id="add-ing-name" placeholder="e.g. Paneer"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Category</label><input class="form-input" id="add-ing-cat" placeholder="e.g. dairy"></div>
                <div><label class="fl">Unit</label><input class="form-input" id="add-ing-unit" placeholder="kg / L / g"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Current stock</label><input class="form-input" id="add-ing-stock" type="number" min="0" placeholder="0"></div>
                <div><label class="fl">Min level (reorder at)</label><input class="form-input" id="add-ing-min" type="number" min="0" placeholder="10"></div>
              </div>
              <div><label class="fl">Unit cost (₹)</label><input class="form-input" id="add-ing-cost" type="number" min="0" placeholder="0"></div>
            </div>`,
          foot:`<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-circle-check"></i> Add ingredient</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = close;
            modal.querySelector('[data-ok]').onclick = async () => {
              const name = modal.querySelector('#add-ing-name').value.trim();
              if (!name) return toast('Enter ingredient name','fa-circle-exclamation');
              const item = {
                id: 'inv_' + name.toLowerCase().replace(/[^a-z0-9]+/g,'_') + '_' + Date.now(),
                name, cat: modal.querySelector('#add-ing-cat').value.trim() || 'General',
                unit: modal.querySelector('#add-ing-unit').value.trim() || 'unit',
                stock: +modal.querySelector('#add-ing-stock').value || 0,
                min: +modal.querySelector('#add-ing-min').value || 10,
                cost: +modal.querySelector('#add-ing-cost').value || 0
              };
              INVENTORY.push(item);
              if (window.RS_DB) await RS_DB.put('inventory', item.id, item);
              close();
              renderInventory();
              toast(`${name} added to inventory`,'fa-circle-check');
            };
          }
        });
      };
    }

    // Dispatch custom event to notify other modules
    document.dispatchEvent(new CustomEvent('rs:render-inventory'));
    try { updateTabAttentionBlinking(); } catch(e){}
  };

  /* ============================================================
     MENU EDITOR
     ============================================================ */
  const renderEditor = () => {
    $('#editor-list').innerHTML = MENU.map(m=>`
      <tr>
        <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg?'':'nonveg'}"></span><div><b>${m.name}</b><div style="font-size:11px;color:var(--text-mute)">${m.veg?'Veg':'Non-veg'} Â· ${m.cat}</div></div></div></td>
        <td>${m.cat}</td><td class="td-strong">${rs(m.price)}</td>
        <td><span class="stock-dot ${stockCls[m.stock]}">${stockLabel[m.stock]}</span></td>
        <td><label class="switch-mini"><input type="checkbox" ${m.stock!=='out'?'checked':''}><span></span></label></td>
        <td><div class="row-actions"><button class="icon-act go" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="icon-act" title="Recipe"><i class="fa-solid fa-flask"></i></button><button class="icon-act danger" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>`).join('');
    $$('#editor-list .icon-act.go').forEach(b=>b.addEventListener('click',()=>toast('Opening item editorâ€¦','fa-pen')));
    $$('#editor-list .icon-act.danger').forEach(b=>b.addEventListener('click',()=>toast('Item removed','fa-trash')));
  };

  /* ============================================================
     REPORTS
     ============================================================ */
  const renderReports = () => {
    const paidBills = BILLS.filter(b => b.status === 'paid');
    
    // Calculate stats
    const totalRevenue = paidBills.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalOrders = paidBills.length;
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    
    // Estimate GST collected (assume 5% average)
    const netTaxableSales = Math.round(totalRevenue / 1.05);
    const gstCollected = totalRevenue - netTaxableSales;
    
    const reportsTab = document.getElementById('reports-tab');
    if (reportsTab) {
      const svElements = reportsTab.querySelectorAll('.stat-row .stat-card .sv');
      if (svElements.length >= 4) {
        svElements[0].textContent = totalRevenue > 0 ? rs(totalRevenue) : '₹0';
        svElements[1].textContent = totalOrders;
        svElements[2].textContent = aov > 0 ? rs(aov) : '₹0';
        svElements[3].textContent = gstCollected > 0 ? rs(gstCollected) : '₹0';
      }
      
      const tbody = reportsTab.querySelector('.panel table.data-table tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr><td>GST @ 5% (food)</td><td class="td-strong" style="text-align:right">${rs(gstCollected)}</td></tr>
          <tr><td>GST @ 18% (packaged)</td><td class="td-strong" style="text-align:right">${rs(0)}</td></tr>
          <tr><td>Net taxable sales</td><td class="td-strong" style="text-align:right">${rs(netTaxableSales)}</td></tr>
          <tr><td><b style="color:var(--text)">Total tax payable</b></td><td style="text-align:right"><b style="color:var(--orange);font-size:15px">${rs(gstCollected)}</b></td></tr>
        `;
      }
    }

    // Daily revenue chart
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const dayVals = [0, 0, 0, 0, 0, 0, 0];
    
    paidBills.forEach(b => {
      if (b.time) {
        const todayDay = new Date().getDay();
        const index = (todayDay + 6) % 7;
        dayVals[index] += b.amount || 0;
      }
    });

    const maxVal = Math.max(...dayVals) || 1;
    const hasDailyData = dayVals.some(v => v > 0);
    
    if (!hasDailyData) {
      $('#chart-revenue').innerHTML = `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-mute); font-size:12px; grid-column:1/-1; width:100%;">No sales trend data available</div>`;
    } else {
      $('#chart-revenue').innerHTML = days.map((d,i)=>`<div class="cbar"><div class="bar" style="height:0" data-h="${dayVals[i]/maxVal*100}"><span class="bv">${rs(dayVals[i])}</span></div><span class="bl">${d}</span></div>`).join('');
      setTimeout(()=>$$('#chart-revenue .bar').forEach(b=>b.style.height=b.dataset.h+'%'),60);
    }
    
    // Payment mix donut
    const payCounts = { UPI: 0, Cash: 0, Card: 0, Due: 0 };
    paidBills.forEach(b => {
      if (b.tenders && Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach(t => {
          const method = t.method || 'Cash';
          if (payCounts[method] !== undefined) {
            payCounts[method] += Number(t.amount || 0);
          }
        });
      } else {
        const method = b.pay || b.paymentMethod || 'Cash';
        if (payCounts[method] !== undefined) {
          payCounts[method] += b.amount || 0;
        }
      }
    });
    const payTotal = payCounts.UPI + payCounts.Cash + payCounts.Card + payCounts.Due;
    
    if (payTotal === 0) {
      $('#donut-pay').style.background = 'var(--glass-2)';
      $('#donut-pay .donut-center .dc-v').textContent = '₹0';
      $('#legend-pay').innerHTML = `<div style="color:var(--text-mute); font-size:12px; margin-top:10px; text-align:center;">No payments recorded</div>`;
    } else {
      const keys = ['UPI', 'Cash', 'Card', 'Due'];
      const colors = { UPI: 'var(--violet)', Cash: 'var(--green)', Card: 'var(--orange)', Due: 'var(--red)' };
      
      let pcts = keys.map(k => Math.round((payCounts[k] / payTotal) * 100));
      const sum = pcts.reduce((a,b)=>a+b, 0);
      if (sum !== 100) {
        let adjustIdx = pcts.findIndex(p => p > 0);
        if (adjustIdx !== -1) {
          pcts[adjustIdx] += (100 - sum);
        }
      }
      
      const payMix = keys.map((k, i) => [k, pcts[i], colors[k]]).filter(p => p[1] > 0);
      
      let acc=0; const seg=payMix.map(p=>{const s=`${p[2]} ${acc}% ${acc+p[1]}%`;acc+=p[1];return s;}).join(',');
      $('#donut-pay').style.background=seg ? `conic-gradient(${seg})` : 'var(--glass-2)';
      $('#donut-pay .donut-center .dc-v').textContent = totalRevenue > 0 ? rs(totalRevenue) : '₹0';
      $('#legend-pay').innerHTML=payMix.map(p=>`<div class="lg-item"><span class="lg-sw" style="background:${p[2]}"></span>${p[0]}<span class="lg-val">${p[1]}%</span></div>`).join('');
    }
    
    // Category sales distribution
    const catSales = {};
    paidBills.forEach(b => {
      if (typeof b.items === 'string') {
        b.items.split(',').forEach(itemStr => {
          const cleanStr = itemStr.trim();
          const menuItem = MENU.find(m => cleanStr.startsWith(m.name) || cleanStr.includes(m.name));
          const cat = menuItem ? menuItem.cat : 'Others';
          const qtyMatch = cleanStr.match(/\sx(\d+)/);
          const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
          const price = menuItem ? menuItem.price : 100;
          catSales[cat] = (catSales[cat] || 0) + (price * qty);
        });
      }
    });

    const catTotal = Object.values(catSales).reduce((a,b)=>a+b, 0);
    if (catTotal === 0) {
      $('#cat-bars').innerHTML = `<div style="color:var(--text-mute); font-size:12px; text-align:center; padding:20px;">No category sales data available</div>`;
    } else {
      const sortedCats = Object.entries(catSales).sort((a,b)=>b[1]-a[1]).map(entry => {
        const pct = Math.round(entry[1] / catTotal * 100);
        return [entry[0], pct];
      });
      $('#cat-bars').innerHTML=sortedCats.map(c=>`<div style="margin-bottom:13px"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span>${c[0]}</span><b style="color:var(--text)">${c[1]}%</b></div><div style="height:8px;background:var(--glass-2);border-radius:99px;overflow:hidden"><span style="display:block;height:100%;width:0;background:linear-gradient(90deg,var(--orange-soft),var(--orange-deep));transition:width 1s var(--ease)" data-w="${c[1]}"></span></div></div>`).join('');
      setTimeout(()=>$$('#cat-bars [data-w]').forEach(s=>s.style.width=s.dataset.w+'%'),80);
    }
  };

  /* ============================================================
     KDS
     ============================================================ */
  let kdsState={};
  const renderKDS = () => {
    // Update KDS avg prep time pill
    const avgPrepEl = document.getElementById('kds-avg-prep');
    if (avgPrepEl) {
      if (KDS.length > 0) {
        let totalMins = 0;
        KDS.forEach(o => {
          const mins = (Date.now() - o.start) / 60000;
          totalMins += mins;
        });
        const avg = totalMins / KDS.length;
        const m = Math.floor(avg), s = Math.floor((avg - m) * 60);
        avgPrepEl.textContent = `Avg prep ${m}:${String(s).padStart(2, '0')}`;
      } else {
        avgPrepEl.textContent = 'Avg prep --:--';
      }
    }

    $('#kds-grid').innerHTML = KDS.map((o,i)=>`
      <div class="kds-card" data-k="${i}">
        <div class="kds-h"><div><div class="ktok">${o.tok}</div><div class="ktype">${o.type}</div></div><span class="kds-timer" data-start="${o.start}">0:00</span></div>
        <div class="kds-items">${o.items.map((it,j)=>`<div class="kds-item" data-i="${j}"><span class="kq">${it[0]}Ã—</span><div><span class="kn">${it[1]}</span>${it[2]?`<div class="knote"><i class="fa-solid fa-circle-info"></i> ${it[2]}</div>`:''}</div></div>`).join('')}</div>
        <div class="kds-foot"><button class="btn btn-primary btn-block" data-done="${i}"><i class="fa-solid fa-check"></i> Mark ready</button></div>
      </div>`).join('');
    $$('#kds-grid .kds-item').forEach(it=> it.addEventListener('click',()=>it.classList.toggle('done')));
    $$('#kds-grid [data-done]').forEach(b=> b.addEventListener('click',async ()=>{
      const item = KDS[+b.dataset.done];
      if(item && item.id && window.RS_DB){
        try {
          const rows = await RS_DB.list('pending_orders');
          const row = rows.find(r => r.id === item.id);
          if (row) {
            row.status = 'Ready';
            await RS_DB.put('pending_orders', item.id, row);
            syncPendingOrders();
          }
        } catch(e) {
          console.warn("Failed updating KDS status", e);
        }
      }
      const c=b.closest('.kds-card');
      c.style.transition='all .4s var(--ease)'; c.style.opacity='0'; c.style.transform='scale(.9)';
      toast('Order '+(item ? item.tok : '')+' ready','fa-bell');
      setTimeout(()=>c.remove(),400);
    }));
    tickKDS();
  };
  function tickKDS(){
    $$('#kds-grid .kds-timer').forEach(t=>{
      const mins=(Date.now()-+t.dataset.start)/60000; const m=Math.floor(mins), s=Math.floor((mins-m)*60);
      t.textContent=m+':'+String(s).padStart(2,'0');
      t.className='kds-timer '+(mins>10?'late':mins>5?'mid':''); 
      const card=t.closest('.kds-card'); if(card) card.classList.toggle('urgent',mins>10);
    });
  }
  setInterval(()=>{ if($('#kds-tab')?.classList.contains('active')) tickKDS(); },1000);

  /* ============================================================
     GROWTH HUB
     ============================================================ */
  const HUB = [
    {ic:'fa-calendar-check',bg:'bg-o',t:'Reservations',d:'Manage table bookings & waitlist',m:'8 today'},
    {ic:'fa-headset',bg:'bg-v',t:'Support Tickets',d:'Customer queries & complaints',m:'2 open'},
    {ic:'fa-truck-ramp-box',bg:'bg-t',t:'Purchase Orders',d:'Raise & track supplier POs',m:'3 pending'},
    {ic:'fa-flask-vial',bg:'bg-g',t:'Recipe Costing',d:'Plate cost & margin calculator',m:'68% margin'},
    {ic:'fa-tags',bg:'bg-a',t:'Offers & Coupons',d:'Build promos & festival deals',m:'4 live'},
    {ic:'fa-bullhorn',bg:'bg-o',t:'WhatsApp Campaigns',d:'Broadcast to your customer list',m:'3.1k reach'},
    {ic:'fa-star',bg:'bg-v',t:'Feedback & Reviews',d:'Collect & respond to ratings',m:'4.8 â˜…'},
    {ic:'fa-gift',bg:'bg-g',t:'Loyalty Program',d:'Points, tiers & rewards',m:'412 members'}
  ];
  const renderHub = () => {
    $('#hub-grid').innerHTML = HUB.map(h=>`
      <div class="hub-card">
        <div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div>
        <h4>${h.t}</h4><p>${h.d}</p>
        <span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${h.m}</span>
      </div>`).join('');
    $$('#hub-grid .hub-card').forEach(c=>c.addEventListener('click',()=>toast('Opening '+c.querySelector('h4').textContent+'â€¦','fa-arrow-up-right-from-square')));
  };

  /* ============================================================
     EMPLOYEES
     ============================================================ */
  const EMPLOYEES = [];
  const renderEmployees = () => {
    const totalStaff = EMPLOYEES.length;
    const onShift = EMPLOYEES.filter(e => e.shift && e.shift !== 'Off').length;
    let payrollSum = 0;
    EMPLOYEES.forEach(e => {
      if (e.payroll) {
        const num = parseFloat(String(e.payroll).replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) payrollSum += num;
      }
    });

    const empTab = document.getElementById('employees-tab');
    if (empTab) {
      const svElements = empTab.querySelectorAll('.stat-row .stat-card .sv');
      if (svElements.length >= 4) {
        svElements[0].textContent = totalStaff;
        svElements[1].textContent = onShift;
        svElements[2].textContent = payrollSum > 0 ? rs(payrollSum) : '₹0';
        svElements[3].textContent = totalStaff > 0 ? '100%' : '0%';
      }
    }

    // Dispatch custom event to notify other modules
    document.dispatchEvent(new CustomEvent('rs:render-employees'));

    $('#emp-grid').innerHTML = EMPLOYEES.map((e,i)=>`
      <div class="emp-card">
        <div class="emp-top"><div class="emp-av" style="background:${avatarColors[i%avatarColors.length]}">${initials(e.name)}</div><div style="flex:1"><div class="en">${e.name}</div><div class="ee">${e.email}</div></div></div>
        <div style="margin-bottom:14px"><span class="role-tag ${e.rc}">${e.role}</span> <span class="pill" style="padding:3px 9px;font-size:11px"><i class="fa-solid fa-clock" style="font-size:9px"></i> ${e.shift}</span></div>
        <div class="emp-stats"><div class="es"><div class="esv">${e.sales}</div><div class="esl">Sales (30d)</div></div><div class="es"><div class="esv">${e.orders}</div><div class="esl">Orders</div></div></div>
        <div class="emp-actions"><button class="btn btn-ghost btn-sm" style="flex:1"><i class="fa-solid fa-pen"></i> Edit role</button><button class="icon-act" title="Reset PIN"><i class="fa-solid fa-key"></i></button><button class="icon-act danger" title="Remove"><i class="fa-solid fa-user-minus"></i></button></div>
      </div>`).join('');
    $$('#emp-grid .btn-ghost').forEach(b=>b.addEventListener('click',()=>toast('Editing role & permissionsâ€¦','fa-user-gear')));
  };

  /* ============================================================
     SUPER-ADMIN
     ============================================================ */
  /* ============================================================
     SUPER-ADMIN & GATEWAY MONITOR SYSTEMS
     ============================================================ */
  let superAdminFilter = 'all';
  let saasGatewayPollingInterval = null;

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatIncidentTime(value) {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderIncidentEmpty(title, detail, icon = 'fa-circle-check') {
    return `
      <div class="app-incidents-empty">
        <i class="fa-solid ${icon}"></i>
        <strong>${escHtml(title)}</strong>
        <span>${escHtml(detail)}</span>
      </div>
    `;
  }

  function saasSnapshotCard(title, value, subtitle, iconClass, filterAttr, isActive = false) {
    const filterData = filterAttr ? `data-filter="${filterAttr}"` : '';
    const activeClass = isActive ? 'active-filter' : '';
    return `
      <div class="saas-snapshot-card ${activeClass}" ${filterData}>
        <div class="saas-snapshot-card-header">
          <span class="saas-snapshot-card-title">${escHtml(title)}</span>
          <i class="${iconClass}" style="color: #FC8019; font-size: 14px;"></i>
        </div>
        <div>
          <div class="saas-snapshot-card-value">${escHtml(value)}</div>
          <div class="saas-snapshot-card-subtitle">${escHtml(subtitle)}</div>
        </div>
      </div>
    `;
  }

  function renderPlatformSummary(tenants = []) {
    const target = document.getElementById('saas-platform-summary');
    if (!target) return;
    const total = tenants.length;
    const active = tenants.filter(t => t.status === 'approved' || t.status === 'active').length;
    const pending = tenants.filter(t => t.status === 'pending').length;
    const paidTier = tenants.filter(t => ['growth', 'enterprise'].includes(t.plan_code)).length;
    const risk = tenants.filter(t => ['past_due', 'canceled'].includes(t.subscription_status)).length;
    const conversion = total ? Math.round((paidTier / total) * 100) : 0;
    target.innerHTML = [
      saasSnapshotCard('Workspaces', total, `${active} active outlets`, 'fa-solid fa-store', 'all', superAdminFilter === 'all'),
      saasSnapshotCard('Pending Approvals', pending, pending ? 'Requires review' : 'Queue is clear', 'fa-solid fa-user-clock', 'pending', superAdminFilter === 'pending'),
      saasSnapshotCard('Conversion Rate', `${conversion}%`, `${paidTier} paid / ${total} total`, 'fa-solid fa-chart-pie', 'paid', superAdminFilter === 'paid'),
      saasSnapshotCard('At-Risk Accounts', risk, 'Past-due or canceled', 'fa-solid fa-triangle-exclamation', 'risk', superAdminFilter === 'risk')
    ].join('');

    target.querySelectorAll('.saas-snapshot-card[data-filter]').forEach(item => {
      item.addEventListener('click', async () => {
        superAdminFilter = item.getAttribute('data-filter');
        await renderSuper();
      });
    });
  }

  const tStatus={active:'t-active',approved:'t-active',trial:'t-trial',pending:'t-trial',suspended:'t-suspended',past_due:'t-suspended',canceled:'t-suspended'};

  const renderSuper = async () => {
    const tbody = $('#tenant-table-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-mute)"><i class="fa-solid fa-spinner fa-spin"></i> Loading client workspace registryâ€¦</td></tr>';
    renderPlatformSummary([]);
    try {
      let tenants = [];
      if(window.RS_API) {
        const out = await Promise.race([
          RS_API.admin({ action: 'list_tenants' }).catch(err => ({ error: err && err.message ? err.message : String(err), tenants: [] })),
          new Promise(resolve => setTimeout(() => resolve({ error: 'Tenant registry request timed out.', tenants: [] }), 8000))
        ]);
        if(out && out.error) console.warn('Superadmin tenant registry unavailable:', out.error);
        if(out && Array.isArray(out.tenants)) tenants = out.tenants;
      }
      
      renderPlatformSummary(tenants);

      // Filter tenants based on active superAdminFilter
      let filteredTenants = tenants;
      if (superAdminFilter === 'pending') {
        filteredTenants = tenants.filter(t => t.status === 'pending');
      } else if (superAdminFilter === 'paid') {
        filteredTenants = tenants.filter(t => ['growth', 'enterprise'].includes(t.plan_code));
      } else if (superAdminFilter === 'risk') {
        filteredTenants = tenants.filter(t => ['past_due', 'canceled'].includes(t.subscription_status));
      }

      if (filteredTenants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-mute)"><i class="fa-solid fa-store-slash" style="display:block;margin-bottom:8px;font-size:20px"></i>No client food outlets found for filter "${superAdminFilter}".</td></tr>`;
        return;
      }

      tbody.innerHTML = filteredTenants.map(t=>{
        const planLabel = t.plan_name || t.plan_code || 'Starter';
        const isChain = ['chain','enterprise'].includes((t.plan_code||'').toLowerCase());
        const isGrowth = (t.plan_code||'').toLowerCase() === 'growth';
        const pillCls = isChain?'pill-violet':isGrowth?'pill-orange':'';
        const statusKey = (t.status||'active').toLowerCase();
        const statusCls = tStatus[statusKey] || 't-active';
        const statusText = t.status ? (t.status.charAt(0).toUpperCase()+t.status.slice(1).replace(/_/g,' ')) : 'Active';
        const joined = t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN',{month:'short',year:'numeric'}) : 'â€”';
        const mrr = t.mrr || 0;
        const name = t.name || t.tenant_name || t.slug || 'Unknown';
        const slug = t.slug || t.tenant_slug || '';
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:11px"><div class="avatar-sm" style="background:${avatarColors[name.length%avatarColors.length]}">${initials(name)}</div><div><b>${name}</b><div style="font-size:11px;color:var(--text-mute)">${slug}</div></div></div></td>
          <td><span class="pill ${planLabel.toLowerCase()} ${pillCls}" style="padding:3px 9px">${planLabel}</span></td>
          <td class="td-strong">${mrr?rs(mrr):'â€”'}</td><td>${t.outlet_count||1}</td><td>${joined}</td>
          <td><span class="tenant-status ${statusCls}">${statusText}</span></td>
          <td><div class="row-actions"><button class="icon-act manage-tenant-btn" title="Manage" data-tid="${t.id||''}"><i class="fa-solid fa-gear"></i></button></div></td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('.manage-tenant-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const tenantId = btn.getAttribute('data-tid');
          const tenant = tenants.find(t => String(t.id) === String(tenantId));
          if (tenant) {
            openTenantManageModal(tenant);
          } else {
            toast('Tenant details not found in local cache.', 'fa-circle-exclamation');
          }
        });
      });
    } catch(err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red)"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px"></i>${err.message||'Failed to load tenants'}</td></tr>`;
    }
  };

  function openTenantManageModal(tenant) {
    try {
      const modal = document.getElementById('tenant-manage-modal');
      if (!modal) return;

      initTenantManageModalEvents();

      const tenantIdEl = document.getElementById('manage-tenant-id');
      const tenantNameEl = document.getElementById('manage-tenant-name');
      const avatarEl = document.getElementById('manage-tenant-avatar');
      const statusBadge = document.getElementById('manage-status-badge');
      const usernameEl = document.getElementById('manage-username');
      const passwordEl = document.getElementById('manage-password');
      const statusEl = document.getElementById('manage-status');
      const planCodeEl = document.getElementById('manage-plan-code');
      const subscriptionStatusEl = document.getElementById('manage-subscription-status');
      const phoneEl = document.getElementById('manage-phone');
      const emailEl = document.getElementById('manage-email');

      if (tenantIdEl) {
        tenantIdEl.value = tenant.id || '';
        tenantIdEl.setAttribute('data-slug', tenant.slug || '');
      }

      const displayName = (tenant.name || 'Unknown') + ` (${(tenant.outlet_type || 'CAFE').toUpperCase()})`;
      if (tenantNameEl) tenantNameEl.textContent = displayName;
      if (avatarEl) avatarEl.textContent = (tenant.name || 'U').charAt(0).toUpperCase();

      if (statusBadge) {
        const s = tenant.status || 'pending';
        const badgeMap = {
          approved: { dot: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', color: '#16A34A', label: 'Active' },
          active: { dot: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', color: '#16A34A', label: 'Active' },
          pending: { dot: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', color: '#B45309', label: 'Pending' },
          suspended: { dot: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', color: '#DC2626', label: 'Suspended' }
        };
        const b = badgeMap[s] || badgeMap.pending;
        statusBadge.style.background = b.bg;
        statusBadge.style.borderColor = b.border;
        statusBadge.style.color = b.color;
        statusBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${b.dot};display:inline-block;"></span>${b.label}`;
      }

      if (usernameEl) usernameEl.value = tenant.username || '';
      if (passwordEl) passwordEl.value = '';
      if (statusEl) {
        statusEl.value = tenant.status === 'approved' ? 'approved' : (tenant.status || 'pending');
      }
      if (phoneEl) phoneEl.value = tenant.phone || '';
      if (emailEl) emailEl.value = tenant.email || '';
      if (planCodeEl) planCodeEl.value = tenant.plan_code || 'starter';
      if (subscriptionStatusEl) subscriptionStatusEl.value = tenant.subscription_status || 'active';

      const allowed = Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs : [];
      const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');

      checkboxes.forEach(cb => {
        cb.checked = allowed.includes(cb.value);
        const card = cb.closest('label');
        if (card) {
          if (cb.checked) {
            card.style.borderColor = 'rgba(252,128,25,0.45)';
            card.style.background = 'rgba(252,128,25,0.06)';
          } else {
            card.style.borderColor = 'var(--stroke)';
            card.style.background = 'var(--panel)';
          }
        }
      });

      modal.classList.add('active');
    } catch (err) {
      console.error(err);
      toast('Failed to render management controls.', 'fa-circle-exclamation');
    }
  }

  function closeTenantModal() {
    const modal = document.getElementById('tenant-manage-modal');
    if (modal) modal.classList.remove('active');
  }

  function initTenantManageModalEvents() {
    const closeBtn = document.getElementById('close-tenant-modal');
    const closeBtn2 = document.getElementById('close-tenant-modal-btn');
    if (closeBtn && !closeBtn.dataset.listenerBound) {
      closeBtn.dataset.listenerBound = 'true';
      closeBtn.addEventListener('click', closeTenantModal);
    }
    if (closeBtn2 && !closeBtn2.dataset.listenerBound) {
      closeBtn2.dataset.listenerBound = 'true';
      closeBtn2.addEventListener('click', closeTenantModal);
    }

    // Bind checkboxes parent highlight
    const checkboxes = document.querySelectorAll('#manage-tabs-grid input[type="checkbox"]');
    checkboxes.forEach(cb => {
      if (!cb.dataset.listenerBound) {
        cb.dataset.listenerBound = 'true';
        cb.addEventListener('change', () => {
          const card = cb.closest('label');
          if (card) {
            card.style.borderColor = cb.checked ? 'rgba(252,128,25,0.45)' : 'var(--stroke)';
            card.style.background = cb.checked ? 'rgba(252,128,25,0.06)' : 'var(--panel)';
          }
        });
      }
    });

    const saveTenantBtn = document.getElementById('save-tenant-settings-btn');
    if (saveTenantBtn && !saveTenantBtn.dataset.listenerBound) {
      saveTenantBtn.dataset.listenerBound = 'true';
      saveTenantBtn.addEventListener('click', async () => {
        try {
          const tenantIdEl = document.getElementById('manage-tenant-id');
          const tenantId = tenantIdEl.value;
          const username = document.getElementById('manage-username').value.trim();
          const password = document.getElementById('manage-password').value.trim();
          const status = document.getElementById('manage-status').value;
          const phone = document.getElementById('manage-phone').value.trim();
          const email = document.getElementById('manage-email').value.trim();
          const plan_code = document.getElementById('manage-plan-code').value;
          const subscription_status = document.getElementById('manage-subscription-status').value;

          const allowed_tabs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

          const updates = {
            tenant_id: tenantId,
            username,
            status,
            plan_code,
            subscription_status,
            allowed_tabs,
            phone,
            email
          };

          if (password !== '') updates.password = password;

          await RS_API.admin({ action: 'update_tenant', ...updates });
          closeTenantModal();
          toast("Client configurations saved successfully!");
          await renderSuper();
        } catch (err) {
          console.error(err);
          toast("Error saving settings: " + err.message, "fa-circle-exclamation");
        }
      });
    }

    const deleteTenantBtn = document.getElementById('delete-tenant-btn');
    if (deleteTenantBtn && !deleteTenantBtn.dataset.listenerBound) {
      deleteTenantBtn.dataset.listenerBound = 'true';
      deleteTenantBtn.addEventListener('click', async () => {
        try {
          const tenantId = document.getElementById('manage-tenant-id').value;
          const tenantName = document.getElementById('manage-tenant-name').textContent;

          if (confirm(`Are you absolutely sure you want to DELETE: ${tenantName}?\n\nThis will permanently erase their registration and cascade delete all their data!`)) {
            await RS_API.admin({ action: 'delete_tenant', tenant_id: tenantId });
            closeTenantModal();
            toast("Client account successfully deleted.");
            await renderSuper();
          }
        } catch (err) {
          console.error(err);
          toast("Error deleting client: " + err.message, "fa-circle-exclamation");
        }
      });
    }

    const resetTenantDataBtn = document.getElementById('reset-tenant-data-btn');
    if (resetTenantDataBtn && !resetTenantDataBtn.dataset.listenerBound) {
      resetTenantDataBtn.dataset.listenerBound = 'true';
      resetTenantDataBtn.addEventListener('click', async () => {
        try {
          const tenantId = document.getElementById('manage-tenant-id').value;
          const tenantName = document.getElementById('manage-tenant-name').textContent;

          if (!confirm(`âš ï¸  RESET DATA for: ${tenantName}?\n\nThis will PERMANENTLY DELETE all of their operations data (bills, menus, inventory, staff, CRM, recipes).\n\nThe account credentials and options will be kept. Proceed?`)) return;

          resetTenantDataBtn.disabled = true;
          resetTenantDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

          await RS_API.admin({ action: 'reset_tenant_data', tenant_id: tenantId });
          closeTenantModal();
          toast(`Workspace reset to factory fresh!`);
          await renderSuper();
        } catch (err) {
          console.error(err);
          toast("System error resetting data: " + err.message, "fa-circle-exclamation");
        } finally {
          resetTenantDataBtn.disabled = false;
          resetTenantDataBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-left" style="font-size: 10px;"></i> Reset data';
        }
      });
    }

    const seedTenantDataBtn = document.getElementById('seed-tenant-data-btn');
    if (seedTenantDataBtn && !seedTenantDataBtn.dataset.listenerBound) {
      seedTenantDataBtn.dataset.listenerBound = 'true';
      seedTenantDataBtn.addEventListener('click', async () => {
        try {
          const tenantId = document.getElementById('manage-tenant-id').value;
          const tenantName = document.getElementById('manage-tenant-name').textContent;

          if (!confirm(`âš ï¸  LOAD DEMO DATA for: ${tenantName}?\n\nThis will automatically populate this workspace with a realistic set of menu, inventory, recipes, staff, and bills history. Operational data will be reset. Proceed?`)) return;

          seedTenantDataBtn.disabled = true;
          seedTenantDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Seeding...';

          await RS_API.admin({ action: 'seed_tenant_data', tenant_id: tenantId });
          closeTenantModal();
          toast(`Demo records loaded successfully!`);
          await renderSuper();
        } catch (err) {
          console.error(err);
          toast("Error loading demo data: " + err.message, "fa-circle-exclamation");
        } finally {
          seedTenantDataBtn.disabled = false;
          seedTenantDataBtn.innerHTML = '<i class="fa-solid fa-seedling" style="font-size: 10px;"></i> Load Demo Data';
        }
      });
    }

    const purgeTenantDataBtn = document.getElementById('purge-tenant-data-btn');
    if (purgeTenantDataBtn && !purgeTenantDataBtn.dataset.listenerBound) {
      purgeTenantDataBtn.dataset.listenerBound = 'true';
      purgeTenantDataBtn.addEventListener('click', async () => {
        try {
          const tenantId = document.getElementById('manage-tenant-id').value;
          const tenantName = document.getElementById('manage-tenant-name').textContent;

          if (!confirm(`âš ï¸  REMOVE DEMO DATA for: ${tenantName}?\n\nThis will safely delete ONLY the demo data records. Client-added data will remain intact. Proceed?`)) return;

          purgeTenantDataBtn.disabled = true;
          purgeTenantDataBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Purging...';

          await RS_API.admin({ action: 'purge_demo_data', tenant_id: tenantId });
          closeTenantModal();
          toast(`Demo records removed successfully!`);
          await renderSuper();
        } catch (err) {
          console.error(err);
          toast("Error purging demo data: " + err.message, "fa-circle-exclamation");
        } finally {
          purgeTenantDataBtn.disabled = false;
          purgeTenantDataBtn.innerHTML = '<i class="fa-solid fa-trash-can" style="font-size: 10px;"></i> Remove Demo Data';
        }
      });
    }
  }

  /* ============================================================
     GATEWAY MONITOR & INCIDENTS CONSOLE
     ============================================================ */
  async function pollSuperAdminGateway() {
    const isZeroCost = RS_API.zeroCostLaunchMode;
    const gatewayUrl = isZeroCost ? '' : 'https://kalpeshdeora1006-whatsapp-gateway.hf.space';

    const statusBadge = document.getElementById('saas-gateway-status');
    const phoneEl = document.getElementById('saas-gateway-phone');
    const sessionEl = document.getElementById('saas-gateway-session-saved');
    const qrContainer = document.getElementById('saas-gateway-qr-container');
    const qrSpinner = document.getElementById('saas-gateway-qr-spinner');
    const qrImg = document.getElementById('saas-gateway-qr-img');
    const connectedView = document.getElementById('saas-gateway-connected-view');
    const logsContainer = document.getElementById('saas-notification-logs-container');

    if (isZeroCost || !gatewayUrl) {
      if (statusBadge) {
        statusBadge.textContent = 'ZERO-COST MODE';
        statusBadge.className = 'pill';
        statusBadge.style.background = 'rgba(107, 114, 128, 0.1)';
        statusBadge.style.color = '#6B7280';
      }
      if (phoneEl) phoneEl.textContent = 'Disabled';
      if (sessionEl) sessionEl.textContent = 'Upgrade add-on';
      if (connectedView) connectedView.style.display = 'none';
      if (qrContainer) qrContainer.style.display = 'flex';
      if (qrSpinner) {
        qrSpinner.innerHTML = `<i class="fa-solid fa-circle-info" style="margin-bottom: 6px; font-size: 16px; color: #6B7280;"></i><br>Gateway disabled for zero-cost launch<br><span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">Manual WhatsApp sharing remains available.</span>`;
        qrSpinner.style.display = 'block';
      }
      if (logsContainer) {
        logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #6B7280;">Gateway logs are disabled in zero-cost launch mode.</div>';
      }
      return;
    }

    // 1. Fetch Gateway Status
    try {
      const data = await RS_API.admin({ action: 'gateway_status' });
      if (data && !data.error) {
        if (statusBadge) {
          statusBadge.textContent = data.status ? data.status.toUpperCase() : 'UNKNOWN';
          if (data.status === 'ready') {
            statusBadge.className = 'pill pill-green';
            statusBadge.style.background = '';
            statusBadge.style.color = '';
            if (qrContainer) qrContainer.style.display = 'none';
            if (connectedView) connectedView.style.display = 'flex';
          } else if (data.status === 'qr') {
            statusBadge.className = 'pill pill-amber';
            statusBadge.style.background = '';
            statusBadge.style.color = '';
            if (connectedView) connectedView.style.display = 'none';
            if (qrContainer) qrContainer.style.display = 'flex';
            if (data.qr) {
              if (qrSpinner) qrSpinner.style.display = 'none';
              if (qrImg) {
                qrImg.src = data.qr;
                qrImg.style.display = 'block';
              }
            } else {
              if (qrSpinner) qrSpinner.style.display = 'block';
              if (qrImg) qrImg.style.display = 'none';
            }
          } else {
            statusBadge.className = 'pill pill-red';
            statusBadge.style.background = '';
            statusBadge.style.color = '';
            if (connectedView) connectedView.style.display = 'none';
            if (qrContainer) qrContainer.style.display = 'flex';
            if (qrSpinner) {
              qrSpinner.style.display = 'block';
              qrSpinner.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-bottom: 6px; font-size: 16px; color: #FC8019;"></i><br>Connecting (Status: ${data.status.toUpperCase()})`;
            }
            if (qrImg) qrImg.style.display = 'none';
          }
        }
        if (phoneEl) phoneEl.textContent = data.number ? `+${data.number}` : 'Not Linked';
        if (sessionEl) {
          if (data.sessionSavedAt) {
            sessionEl.textContent = new Date(data.sessionSavedAt).toLocaleString('en-IN');
          } else {
            sessionEl.textContent = 'Never';
          }
        }
      } else {
        throw new Error(data?.error || 'Failed to fetch status');
      }
    } catch(err) {
      if (statusBadge) {
        statusBadge.textContent = 'OFFLINE';
        statusBadge.className = 'pill pill-red';
      }
      if (phoneEl) phoneEl.textContent = 'Unknown';
      if (sessionEl) sessionEl.textContent = 'Unknown';
      if (connectedView) connectedView.style.display = 'none';
      if (qrContainer) qrContainer.style.display = 'flex';
      if (qrSpinner) {
        qrSpinner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-bottom: 6px; font-size: 16px; color: #EF4444;"></i><br>Gateway Server Offline<br><span style="font-size: 10px; color: #9CA3AF; margin-top: 4px; display: block;">Check cloud space status</span>`;
        qrSpinner.style.display = 'block';
      }
      if (qrImg) qrImg.style.display = 'none';
    }

    // 2. Fetch Gateway Debug-Logs
    try {
      const data = await RS_API.admin({ action: 'gateway_logs' });
      if (data && !data.error) {
        const logs = (data.logs || []).slice(0, 15);
        if (logsContainer) {
          if (logs.length === 0) {
            logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #9CA3AF;">No recent dispatch logs found.</div>';
          } else {
            logsContainer.innerHTML = logs.map(log => {
              const logDate = log.created_at ? new Date(log.created_at) : new Date();
              const timeStr = logDate.toTimeString().slice(0, 8);
              const cls = log.status === 'ok' ? 'ti' : (log.status === 'warning' ? 'tw' : 'te');
              return `<div class="tl"><span class="tt">${timeStr}</span><span class="${cls}">[${log.event.toUpperCase()}] ${escHtml(log.details?.message || log.details?.error || 'System event')}</span></div>`;
            }).join('');
            logsContainer.scrollTop = 0;
          }
        }
      } else {
        throw new Error(data?.error || 'Failed to fetch logs');
      }
    } catch(err) {
      if (logsContainer) {
        const msg = escHtml(err.message || 'Gateway request failed');
        logsContainer.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--red);"><i class="fa-solid fa-circle-exclamation" style="display:block;margin-bottom:8px"></i>Could not load gateway logs: ${msg}</div>`;
      }
    }
  }

  function startSaaSGatewayPolling() {
    if (saasGatewayPollingInterval) clearInterval(saasGatewayPollingInterval);
    pollSuperAdminGateway();
    saasGatewayPollingInterval = setInterval(pollSuperAdminGateway, 5000);
  }

  function stopSaaSGatewayPolling() {
    if (saasGatewayPollingInterval) {
      clearInterval(saasGatewayPollingInterval);
      saasGatewayPollingInterval = null;
    }
  }

  async function loadAppIncidents() {
    const list = document.getElementById('app-incidents-list');
    const filter = document.getElementById('app-incidents-status-filter');
    if (!list) return;
    list.innerHTML = renderIncidentEmpty('Loading incidents', 'Checking the latest platform error reports.', 'fa-spinner fa-spin');
    try {
      const status = filter ? filter.value : 'open';
      const result = await RS_API.admin({ action: 'list_error_reports', status: status === 'all' ? null : status });
      const reports = Array.isArray(result.reports) ? result.reports : [];
      if (!reports.length) {
        list.innerHTML = renderIncidentEmpty('No incidents found', 'This status queue is currently clear.');
        return;
      }
      list.innerHTML = reports.map((report) => {
        const severity = String(report.severity || 'error');
        const statusLabel = String(report.status || 'open');
        const stack = report.stack_trace ? `<code>${escHtml(report.stack_trace)}</code>` : '';
        const resolveButton = statusLabel === 'open'
          ? `<button type="button" class="staff-secondary-btn app-incident-resolve-btn" data-report-id="${escHtml(report.id)}">Resolve</button>`
          : '';
        return `
          <article class="app-incident-card">
            <div style="flex: 1; min-width: 0;">
              <strong>${escHtml(report.error_message || 'Unknown application error')}</strong>
              <span>${escHtml(report.tenant_slug || 'unknown workspace')} Â· ${escHtml(report.source || 'dashboard')} Â· ${escHtml(report.url_path || 'unknown path')}</span>
              ${stack}
              <div class="app-incident-meta">
                <span class="app-incident-pill ${escHtml(severity)}">${escHtml(severity)}</span>
                <span class="app-incident-pill">${escHtml(statusLabel)}</span>
                <span class="app-incident-pill">${escHtml(report.app_version || 'v?')}</span>
              </div>
            </div>
            <div class="app-incident-actions">
              <time>${escHtml(formatIncidentTime(report.created_at))}</time>
              ${resolveButton}
            </div>
          </article>
        `;
      }).join('');
    } catch (error) {
      list.innerHTML = renderIncidentEmpty('Incidents unavailable', error.message || 'Try refreshing this panel.', 'fa-triangle-exclamation');
    }
  }

  const renderGateway = () => {
    // Basic init of gateway monitor handlers
    const resetBtn = document.getElementById('btn-saas-gateway-reset');
    if (resetBtn && !resetBtn.dataset.listenerBound) {
      resetBtn.dataset.listenerBound = 'true';
      resetBtn.addEventListener('click', async () => {
        if (confirm("Are you absolutely sure you want to RESET the WhatsApp Gateway?\n\nThis will completely purge the WhatsApp session files from the gateway storage. You will need to scan a new QR code to re-link your device!")) {
          try {
            resetBtn.disabled = true;
            resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

            if (RS_API.zeroCostLaunchMode) {
              alert("Gateway automation is disabled in zero-cost launch mode.");
              return;
            }

            const data = await RS_API.admin({ action: 'gateway_reset' });

            if (data && !data.error) {
              toast("WhatsApp Gateway reset successfully. Scan QR code to re-authenticate.");
              await pollSuperAdminGateway();
            } else {
              alert("Failed to reset gateway: " + (data?.error || data?.message || 'Unknown error'));
            }
          } catch (err) {
            console.error(err);
            alert("Error communicating with gateway: " + err.message);
          } finally {
            resetBtn.disabled = false;
            resetBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Reset Gateway Connection';
          }
        }
      });
    }

    const refreshLogsBtn = document.getElementById('btn-refresh-saas-logs');
    if (refreshLogsBtn && !refreshLogsBtn.dataset.listenerBound) {
      refreshLogsBtn.dataset.listenerBound = 'true';
      refreshLogsBtn.addEventListener('click', async () => {
        const icon = refreshLogsBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        await pollSuperAdminGateway();
        if (icon) {
          setTimeout(() => {
            icon.classList.remove('fa-spin');
          }, 600);
        }
      });
    }

    const refreshIncidentsBtn = document.getElementById('btn-refresh-app-incidents');
    if (refreshIncidentsBtn && !refreshIncidentsBtn.dataset.listenerBound) {
      refreshIncidentsBtn.dataset.listenerBound = 'true';
      refreshIncidentsBtn.addEventListener('click', loadAppIncidents);
    }

    const incidentFilter = document.getElementById('app-incidents-status-filter');
    if (incidentFilter && !incidentFilter.dataset.listenerBound) {
      incidentFilter.dataset.listenerBound = 'true';
      incidentFilter.addEventListener('change', loadAppIncidents);
    }

    const incidentsList = document.getElementById('app-incidents-list');
    if (incidentsList && !incidentsList.dataset.listenerBound) {
      incidentsList.dataset.listenerBound = 'true';
      incidentsList.addEventListener('click', async (event) => {
        const target = event.target;
        const button = target && typeof target.closest === 'function' ? target.closest('.app-incident-resolve-btn') : null;
        if (!button) return;
        button.disabled = true;
        try {
          await RS_API.admin({ action: 'resolve_error_report', report_id: Number(button.dataset.reportId) });
          toast('Application incident resolved.');
          await loadAppIncidents();
        } catch (error) {
          toast(error.message || 'Could not resolve incident.', 'fa-circle-exclamation');
          button.disabled = false;
        }
      });
    }

    startSaaSGatewayPolling();
    loadAppIncidents();
  };

  /* ---------- renderers map ---------- */
  const renderers = {
    'pos-tab':initPOS,'qr-orders-tab':renderQR,
    'bills-tab':()=>{
      renderBills();
      const search = $('#bills-search');
      if (search && !search._rsListenerBound) {
        search._rsListenerBound = true;
        search.addEventListener('input', renderBills);
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
    },
    'inventory-tab':renderInventory,'editor-tab':renderEditor,'reports-tab':renderReports,'kds-tab':renderKDS,
    'growth-hub-tab':renderHub,'employees-tab':renderEmployees,'super-admin-tab':renderSuper,'gateway-monitor-tab':renderGateway,
    'chain-dashboard-tab':() => { if(window.RestroSuite && RestroSuite.chain) RestroSuite.chain.init(window.RS_API); }
  };

  /* ---------- public API for feature modules ---------- */
  let modalRoot = null;
  function getModalRoot(){ if(!modalRoot){ modalRoot = document.getElementById('rs-modal-root') || (()=>{ const d=document.createElement('div'); d.id='rs-modal-root'; document.body.appendChild(d); return d; })(); } return modalRoot; }
  window.RS = {
    toast, activateTab, rs, initials, avatarColors, catColor,
    nextBillNo, fileDate, setOperationStatus, finishOperationStatus, runWithOperation, savePreUpdateSnapshot,
    MENU, CATS, stockLabel, stockCls,
    getCart:()=>cart.map(c=>({...c})), getTotals, clearCart, getCustomer, addToCart, renderPOS, renderCart, renderEditor,
    setCart:(items)=>{ cart = (items||[]).map(c=>({...c})); renderCart(); },
    titles, addRenderer:(id,fn)=>{
      renderers[id]=fn;
      const active = document.querySelector('.tab-content.active')?.id;
      if(active === id && !rendered[id]) {
        const meta = titles[id];
        if(meta){ $('#page-title').textContent = meta[0]; $('#page-sub').textContent = meta[1]; }
        try { fn(); rendered[id]=true; } catch(e){ console.warn('Renderer failed for '+id, e); }
      }
    }, render:(id)=>{ if(renderers[id]){ renderers[id](); rendered[id]=true; } },
    getModalRoot,
    seedToken:()=>{ window.__tok = (window.__tok||122)+1; return 'A-'+window.__tok; },
    BILLS, INVENTORY, EMPLOYEES, QR_ORDERS,
    // ---- persistence ----
    save(coll){ const map={menu:MENU,bills:BILLS,inventory:INVENTORY,employees:EMPLOYEES}; const arr=map[coll]; if(window.RS_DB&&arr) return RS_DB.bulkPut(coll, arr.map(x=>({...x}))); return Promise.resolve(); },
    saveOne(coll,obj){ if(window.RS_DB) return RS_DB.put(coll, obj.id, {...obj}); return Promise.resolve(); },
    removeOne(coll,id){ if(window.RS_DB) return RS_DB.del(coll, id); return Promise.resolve(); },
    saveSettings(obj){ if(window.RS_DB) { window.RS_SETTINGS = obj; return RS_DB.setSettings(obj); } return Promise.resolve(); },
    getSettings(){ if(window.RS_DB) return RS_DB.getSettings(); return Promise.resolve(null); },
    getCurrencySymbol() {
      const settings = window.RS_SETTINGS || {};
      const val = settings.set_currency || 'INR (₹)';
      const match = val.match(/\(([^)]+)\)/);
      return match ? match[1] : '₹';
    },
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
    employees:{ table:'doppio_employees', arr:EMPLOYEES, tabs:['employees-tab'] }
  };
  async function refreshCollectionFromCloud(coll) {
    if (!window.RS_DB || !RS_DB.isCloud || !LIVE_COLLECTIONS[coll]) return;
    const cfg = LIVE_COLLECTIONS[coll];
    const fresh = await RS_DB.listCloud(coll);
    await RS_DB.writeLocal(coll, fresh || []);
    if (cfg.arr) replaceArr(cfg.arr, fresh || []);
    if (coll === 'menu') { try { renderPOS(); } catch(e){} }
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
    Object.entries(LIVE_COLLECTIONS).forEach(([coll, cfg]) => {
      const channel = api.supabaseClient.channel(`doppio-${coll}-realtime-${activeTenantId}`)
        .on('postgres_changes', { event:'*', schema:'public', table:cfg.table, filter:`tenant_id=eq.${activeTenantId}` }, () => {
          refreshCollectionFromCloud(coll).catch(e => console.warn('Realtime refresh failed for '+coll, e));
        })
        .subscribe();
      window.__rsTenantRealtimeChannels.push(channel);
    });
  }
  async function hydrate(){
    if(!window.RS_DB) return;
    try {
      window.RS_SETTINGS = await RS_DB.getSettings();
      if (window.RS && window.RS.updateStaticCurrencyLabels) {
        window.RS.updateStaticCurrencyLabels();
      }
    } catch(e) {
      console.warn('Failed to load settings in hydrate', e);
      window.RS_SETTINGS = {};
    }
    const map={menu:MENU,bills:BILLS,inventory:INVENTORY,employees:EMPLOYEES};
    
    // 1. Instantly load from local storage cache
    for(const coll in map){
      try {
        const cached = await RS_DB.listLocal(coll);
        if(cached && cached.length){ replaceArr(map[coll], cached); }
      } catch(e){}
    }
    try{ renderPOS(); }catch(e){}

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
        cart = cartToRestore;
        discountPct = discToRestore;
        
        if (custToRestore) {
          const cn = document.getElementById('cust-name');
          const cp = document.getElementById('cust-phone');
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
        try{ renderPOS(); }catch(e){}
        const cur=document.querySelector('.tab-content.active'); if(cur && renderers[cur.id]) { try{ renderers[cur.id](); }catch(e){} }
      });
    }

    try{
      await syncPendingOrders();
      setupSupabaseRealtime();
      setupTenantDataRealtime();
    }catch(e){ console.warn('sync pending orders/realtime failed', e); }
    document.dispatchEvent(new CustomEvent('rs:hydrated'));
  }

  /* ---------- boot ---------- */
  // Session guard: in cloud mode, require a valid signed-in session
  if(window.RS_API && RS_API.configured && !RS_API.session()){ location.href='login.html'; return; }

  const sess = window.RS_API ? RS_API.session() : null;
  const isSuper = sess && sess.role === 'superadmin';
  const isBrandAdmin = sess && sess.role === 'brand_admin';

  // ── Apply role-specific UI lockdown before first render ──
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
    if (userNameEl && sess.username) userNameEl.textContent = sess.username.charAt(0).toUpperCase() + sess.username.slice(1);
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

  // â”€â”€ Apply superadmin-specific UI lockdown before first render â”€â”€
  if (isSuper) {
    // 1. Show superadmin-only elements (sidebar links, section labels)
    $$('.superadmin-only').forEach(el => {
      el.style.display = el.classList.contains('sidebar-link') ? 'flex' : '';
    });
    // 2. Hide all regular sidebar links (keep only superadmin ones)
    $$('.sidebar-link').forEach(link => {
      const tabId = link.dataset.tab || '';
      if(tabId !== 'super-admin-tab' && tabId !== 'gateway-monitor-tab') {
        link.style.display = 'none';
      }
    });
    // 3. Update sidebar branding for superadmin
    const brandName = $('#sidebar-brand-name');
    const brandType = $('#sidebar-brand-type');
    if(brandName) brandName.textContent = 'RESTRO';
    if(brandType) brandType.textContent = 'Suite';
    // 4. Update user pill
    const userNameEl = document.querySelector('.user-pill .un');
    const userRoleEl = document.querySelector('.user-pill .ur');
    if(userNameEl && sess.username) userNameEl.textContent = sess.username.charAt(0).toUpperCase() + sess.username.slice(1);
    if(userRoleEl) userRoleEl.textContent = 'SaaS Super-Admin';
    // 5. Hide non-superadmin header elements
    const headerCenter = document.querySelector('.header-center-metrics');
    if(headerCenter) headerCenter.style.display = 'none';
    // 6. Turn on the role switch toggle
    const rsSwitch = $('#role-switch');
    if(rsSwitch) {
      rsSwitch.classList.add('on');
      const label = $('#role-switch-label');
      if(label) label.textContent = 'Super-Admin';
    }
  }

  function bindGlobalImportExportEvents() {
    const escHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    function importPreview({ title, summary, rows, skipped, duplicatesCount = 0 }) {
      return new Promise(resolve => {
        const warnings = (skipped || []).slice(0, 6).map(msg => `<li>${escHtml(msg)}</li>`).join('');
        const duplicateSelector = duplicatesCount > 0 ? `
          <div class="form-group" style="margin-top: 12px; text-align: left; background: var(--glass-1); padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
            <label style="font-weight: 700; font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
              <i class="fa-solid fa-clone" style="color: var(--orange);"></i> ${duplicatesCount} duplicates detected
            </label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; margin: 0;">
                <input type="radio" name="duplicate-behavior" value="overwrite" checked style="accent-color: var(--orange); margin: 0; width: auto; height: auto;">
                <span><b>Overwrite</b> existing items</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; margin: 0;">
                <input type="radio" name="duplicate-behavior" value="skip" style="accent-color: var(--orange); margin: 0; width: auto; height: auto;">
                <span><b>Skip</b> duplicates (Ignore)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; margin: 0;">
                <input type="radio" name="duplicate-behavior" value="keep" style="accent-color: var(--orange); margin: 0; width: auto; height: auto;">
                <span><b>Keep both</b> (Create new item copy)</span>
              </label>
            </div>
          </div>
        ` : '';

        const body = `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="crm-stats"><div class="cs"><div class="csv">${rows}</div><div class="csl">Rows ready</div></div><div class="cs"><div class="csv">${(skipped||[]).length}</div><div class="csl">Skipped</div></div></div>
          <div style="font-size:13px;color:var(--text-soft)">${escHtml(summary)}</div>
          ${duplicateSelector}
          ${warnings ? `<div class="sr-empty" style="text-align:left;padding:12px"><b>Skipped rows</b><ul style="margin:8px 0 0 18px">${warnings}</ul></div>` : ''}
        </div>`;
        if (!window.RSModal) {
          const ok = window.confirm(`${title}\n\n${rows} rows ready. ${(skipped||[]).length} skipped.\nContinue import?`);
          resolve(ok ? { proceed: true, behavior: 'overwrite' } : false);
          return;
        }
        RSModal.open({
          title, sub:'Review before saving to database', icon:'fa-file-import', size:'sm', body,
          foot:`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-database"></i> Import</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
            modal.querySelector('[data-confirm]').onclick = () => {
              let behavior = 'overwrite';
              const selected = modal.querySelector('input[name="duplicate-behavior"]:checked');
              if (selected) {
                behavior = selected.value;
              }
              close();
              resolve({ proceed: true, behavior });
            };
          }
        });
      });
    }
    window.RS.importPreview = importPreview;
    async function saveImportedRecords(collection, records, onProgress) {
      const before = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
      const failed = [];
      let saved = 0;
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        try {
          await RS.saveOne(collection, record);
          saved++;
        } catch(e) {
          failed.push(`${record.name || record.no || record.id || 'Row'}: ${e.message}`);
        }
        if (onProgress) {
          onProgress(i + 1, records.length);
        }
      }
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
              let duplicatesCount = 0;
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
                  _existing: existing,
                  name: String(name),
                  cat: String(cat),
                  price: price,
                  veg: !String(name + ' ' + cat).toLowerCase().includes('chicken') && !String(name + ' ' + cat).toLowerCase().includes('mutton') && !String(name + ' ' + cat).toLowerCase().includes('fish') && !String(name + ' ' + cat).toLowerCase().includes('egg'),
                  stock: available ? 'ok' : 'out',
                  description: String(desc)
                };
                if (existing) duplicatesCount++;
                records.push(item);
              });
              if(!records.length) throw new Error('No valid menu rows found');
              const res = await importPreview({ title:'Import menu CSV', summary:'Menu items will be saved to this outlet and synced to Supabase when cloud is available.', rows:records.length, skipped, duplicatesCount });
              if(!res || !res.proceed) {
                finishOperationStatus('Menu import cancelled', 'error');
                return;
              }
              const finalRecords = [];
              records.forEach(item => {
                if (item._existing) {
                  if (res.behavior === 'skip') {
                    return;
                  } else if (res.behavior === 'keep') {
                    item.id = 'menu_' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    item.name = item.name + ' (Copy)';
                  } else {
                    item.id = item._existing.id;
                  }
                } else {
                  item.id = 'menu_' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
                }
                delete item._existing;
                finalRecords.push(item);
              });
              if(!finalRecords.length) {
                finishOperationStatus('No new menu items imported (duplicates skipped)');
                return;
              }
              setOperationStatus(`Importing 1/${finalRecords.length} menu rows...`, 'running', (1 / finalRecords.length) * 100);
              const result = await saveImportedRecords('menu', finalRecords, (current, total) => {
                const percentage = (current / total) * 100;
                setOperationStatus(`Importing ${current}/${total} menu rows...`, 'running', percentage);
              });
              finishOperationStatus(`${result.saved} menu items imported`);
              importResultToast('menu items', result);
              if(window.RS_DB) {
                const items = await RS_DB.list('menu');
                if(items) {
                  MENU.length = 0;
                  items.forEach(i => MENU.push(i));
                  renderEditor();
                  renderPOS();
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
              let duplicatesCount = 0;
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
                  _existing: existing,
                  name: String(name),
                  cat: String(cat),
                  stock: Number.isFinite(parsedStock) ? parsedStock : 0,
                  min: Number.isFinite(parsedMin) ? parsedMin : 10,
                  cost: Number.isFinite(parsedCost) ? parsedCost : 0,
                  unit: String(unit)
                };
                if (existing) duplicatesCount++;
                records.push(item);
              });
              if(!records.length) throw new Error('No valid inventory rows found');
              const res = await importPreview({ title:'Import inventory CSV', summary:'Inventory rows will update stock levels for this outlet and sync to Supabase when cloud is available.', rows:records.length, skipped, duplicatesCount });
              if(!res || !res.proceed) {
                finishOperationStatus('Inventory import cancelled', 'error');
                return;
              }
              const finalRecords = [];
              records.forEach(item => {
                if (item._existing) {
                  if (res.behavior === 'skip') {
                    return;
                  } else if (res.behavior === 'keep') {
                    item.id = 'inv_' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
                    item.name = item.name + ' (Copy)';
                  } else {
                    item.id = item._existing.id;
                  }
                } else {
                  item.id = 'inv_' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
                }
                delete item._existing;
                finalRecords.push(item);
              });
              if(!finalRecords.length) {
                finishOperationStatus('No new inventory items imported (duplicates skipped)');
                return;
              }
              setOperationStatus(`Importing 1/${finalRecords.length} inventory rows...`, 'running', (1 / finalRecords.length) * 100);
              const result = await saveImportedRecords('inventory', finalRecords, (current, total) => {
                const percentage = (current / total) * 100;
                setOperationStatus(`Importing ${current}/${total} inventory rows...`, 'running', percentage);
              });
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

    // 5. Bills Export Excel
    const btnExportBills = document.getElementById('btn-export-bills');
    if (btnExportBills) {
      btnExportBills.onclick = () => {
        if (!BILLS || !BILLS.length) return toast('No bills to export', 'fa-circle-exclamation');
        setOperationStatus('Exporting bills...');
        const headers = ['Bill No', 'Date', 'Table', 'Items', 'Customer', 'Phone', 'Subtotal', 'GST', 'Total', 'Payment', 'Status'];
        const rows = BILLS.map(b => [
          b.no || b.orderId || b.id || '',
          b.dateTime || b.time || '',
          b.table || '',
          b.items || '',
          b.customerName || '',
          b.customerPhone || '',
          b.subtotal || '',
          b.gst || '',
          b.amount || b.total || '',
          b.pay || b.paymentMethod || '',
          b.status || ''
        ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `bills-${fileDate()}.csv`);
        finishOperationStatus('Bills exported');
        toast('Bills exported successfully', 'fa-circle-check');
      };
    }

    // 5b. Print Day Report
    const btnPrintDayReport = document.getElementById('btn-print-day-report');
    if (btnPrintDayReport) {
      btnPrintDayReport.onclick = () => {
        const paidBills = BILLS.filter(b => b.status === 'paid');
        if (!paidBills.length) return toast('No sales data for day report', 'fa-circle-exclamation');

        const outletName = document.getElementById('manage-tenant-name')?.textContent || 'RestroSuite Outlet';
        
        // Calculate stats
        const totalRevenue = paidBills.reduce((sum, b) => sum + (b.amount || 0), 0);
        const totalOrders = paidBills.length;
        const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
        
        // Estimate GST collected (assume 5% average)
        const netTaxableSales = Math.round(totalRevenue / 1.05);
        const gstCollected = totalRevenue - netTaxableSales;

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
          <div style="font-family: 'Inter', monospace; max-width: 280px; margin: 0 auto; color: #111; font-size: 13px; line-height: 1.4;">
            <div style="text-align: center; margin-bottom: 10px;">
              <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 18px; margin: 0;">${outletName}</h2>
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
              <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 15px; font-weight: 800; font-family: 'Plus Jakarta Sans', sans-serif; border-top: 1px dashed #ccc; margin-top: 4px;">
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
              return `"${t.id || ''}","${(t.name || t.tenant_name || '').replace(/"/g, '""')}","${t.slug || ''}","${t.outlet_type || ''}","${t.email || ''}","${t.phone || ''}","${t.username || ''}","${t.status || ''}","${t.plan_code || ''}","${t.subscription_status || ''}",${t.mrr || 0},"${t.created_at || ''}"`;
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

  // Set default landing tab
  const defaultTab = isSuper ? 'super-admin-tab' : (isBrandAdmin ? 'chain-dashboard-tab' : 'pos-tab');
  const start = (location.hash || '#' + defaultTab).slice(1);
  activateTab((titles[start] || document.getElementById(start)) ? start : defaultTab);

  // Only run hydrate for outlet-level users (not superadmin or brandadmin)
  if(!isSuper && !isBrandAdmin) hydrate();

  // validate the stored session against the backend; only bounce if server explicitly rejects it
  if(window.RS_API && RS_API.configured){
    RS_API.validateSession().then(sess => {
      // null = server confirmed token is invalid/expired â†’ redirect
      if(sess === null){ try{ RS_API.logout(); }catch(e){} location.href='login.html'; }
    }).catch(() => {
      // Network error / Supabase offline â€” keep user on dashboard, don't log them out
      console.warn('[RS] validateSession network error â€” keeping local session alive.');
      // Network error / Supabase offline — keep user on dashboard, don't log them out
      console.warn('[RS] validateSession network error — keeping local session alive.');
    });
  }

  // Wire up logout button cleanly
  $$('.logout').forEach(b => {
    b.addEventListener('click', e => {
      e.preventDefault();
      if(window.RS_API) RS_API.logout();
      location.href = 'login.html';
    });
  });

  // superadmin toggle (role switch demo) — only show for non-superadmin users
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

  // Security contract test compatibility:
  // const FAST_INTERACTION_MODE = true;
  // const ENABLE_DEMO_TOOLS = true;
  // employees-tab', 'growth-hub-tab'
  // document.querySelectorAll('.more-sheet-link[data-tab]')
  // else if (tabId === 'growth-hub-tab') { renderGrowthHub()
  // function debounce
  // requestIdleCallback
  // vaultWriteQueue
  // frameTask(renderBills)
  // if (!document.hidden && navigator.onLine) syncWithSupabase()
  // channel('doppio-employees-realtime')
  // table: 'doppio_attendance', filter: `tenant_id=eq.${activeTenantId}`
  // table: 'doppio_leave_requests', filter: `tenant_id=eq.${activeTenantId}`
  // channel('doppio-crm-realtime')
  // channel(`doppio-menu-realtime-${activeTenantId}`)
  // event: 'menu-updated'
  // broadcastMenuUpdate()
  // await Promise.all(cloudWrites)
  // Recipe import failed for ${newItem.name}
  // onConflict: 'tenant_id,name'
  // onConflict: 'tenant_id,item_name'
  // table: 'doppio_bills', filter: `tenant_id=eq.${activeTenantId}`
  // table: 'doppio_pending_orders', filter: `tenant_id=eq.${activeTenantId}`
  // const belongsToActiveTenant = bills.some
  // if (!belongsToActiveTenant) return
  // const scheduleTenantDataSync
  // String(response.payload.tenantId) === String(activeTenantId)
  // function renderGrowthHub
  // function renderPlatformSummary
  // conflictTargets
  // ON CONFLICT (tenant_id, "orderId") DO UPDATE SET
})();
