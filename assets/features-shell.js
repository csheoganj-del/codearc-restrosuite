/* ============================================================
   RestroSuite -- App shell: global search, notifications, Settings
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
    const safe = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

    /* ===================== GLOBAL SEARCH ===================== */
    const searchWrap = $('.tb-search'), searchInput = searchWrap && searchWrap.querySelector('input');
    if(searchInput){
      const box = document.createElement('div'); box.className='search-results'; searchWrap.appendChild(box);
      const PAGES = [['pos-tab','Point of Sale','cash-register'],['floor-tab','Floor & Tables','chair'],['aggregator-tab','Online Orders','bowl-rice'],['kds-tab','Kitchen Display','fire-burner'],['bills-tab','Bills','file-invoice-dollar'],['inventory-tab','Inventory','boxes-stacked'],['editor-tab','Menu Editor','pen-to-square'],['customers-tab','Customers','address-book'],['reports-tab','Reports','chart-line'],['employees-tab','Employees','users'],['growth-hub-tab','Growth Hub','rocket'],['settings-tab','Settings','gear']];
      function run(q){
        const t = q.trim().toLowerCase();
        if(!t){ box.classList.remove('show'); return; }
        const menu = RS.MENU.filter(m=>m.name.toLowerCase().includes(t)).slice(0,4);
        const bills = (RS.BILLS||[]).filter(b=>b.no.toLowerCase().includes(t)||String(b.table).toLowerCase().includes(t)).slice(0,3);
        const team = (RS.EMPLOYEES||[]).filter(e=>e.name.toLowerCase().includes(t)).slice(0,3);
        const pages = PAGES.filter(p=>p[1].toLowerCase().includes(t)).slice(0,4);
        let html='';
        if(menu.length){ html+='<div class="sr-group">Menu items</div>'+menu.map(m=>`<div class="sr-item" data-go="pos-tab"><span class="si-ic"><i class="fa-solid fa-utensils"></i></span><div><div class="si-t">${m.name}</div><div class="si-s">${m.cat}</div></div><span class="si-meta">${rs(m.price)}</span></div>`).join(''); }
        if(bills.length){ html+='<div class="sr-group">Bills</div>'+bills.map(b=>`<div class="sr-item" data-go="bills-tab"><span class="si-ic"><i class="fa-solid fa-receipt"></i></span><div><div class="si-t">${b.no}</div><div class="si-s">${b.table} · ${b.pay}</div></div><span class="si-meta">${rs(b.amount)}</span></div>`).join(''); }
        if(team.length){ html+='<div class="sr-group">Team</div>'+team.map(e=>`<div class="sr-item" data-go="employees-tab"><span class="si-ic"><i class="fa-solid fa-user"></i></span><div><div class="si-t">${e.name}</div><div class="si-s">${e.role}</div></div></div>`).join(''); }
        if(pages.length){ html+='<div class="sr-group">Go to</div>'+pages.map(p=>`<div class="sr-item" data-go="${p[0]}"><span class="si-ic"><i class="fa-solid fa-${p[2]}"></i></span><div><div class="si-t">${p[1]}</div></div><span class="si-meta">Open</span></div>`).join(''); }
        box.innerHTML = html || '<div class="sr-empty">No results for "'+q+'"</div>';
        box.classList.add('show');
        $$('.sr-item',box).forEach(el=> el.onclick=()=>{ RS.activateTab(el.dataset.go); box.classList.remove('show'); searchInput.value=''; });
      }
      searchInput.addEventListener('input', e=>run(e.target.value));
      searchInput.addEventListener('focus', e=>{ if(e.target.value) run(e.target.value); });
      document.addEventListener('click', e=>{ if(!searchWrap.contains(e.target)) box.classList.remove('show'); });
    }

    /* ===================== NOTIFICATIONS ===================== */
    const bell = $('.tb-icon-btn[aria-label="Notifications"]');
    if(bell){
      let NOTIFS = [];
      const readKey = 'rs:notif-read';
      let notifLoading = false;
      let notifReloadQueued = false;
      let notifCloudUnavailable = false;
      const panel = document.createElement('div'); panel.className='notif-panel';
      function readSet(){ try { return new Set(JSON.parse(localStorage.getItem(readKey) || '[]')); } catch(e){ return new Set(); } }
      function saveRead(set){ try { localStorage.setItem(readKey, JSON.stringify([...set])); } catch(e){} }
      function relTime(v){
        const t = v ? new Date(v).getTime() : 0;
        if(!t || Number.isNaN(t)) return '';
        const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
        if(mins < 1) return 'just now';
        if(mins < 60) return mins + ' min ago';
        const hrs = Math.round(mins / 60);
        if(hrs < 24) return hrs + ' hr ago';
        return new Date(t).toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
      }
      function iconFor(type){
        if(type === 'warning') return ['fa-triangle-exclamation','var(--red-tint)','var(--red)'];
        if(type === 'success') return ['fa-circle-check','var(--green-tint)','var(--green)'];
        if(type === 'billing') return ['fa-receipt','var(--amber-tint)','var(--amber)'];
        if(type === 'order') return ['fa-bowl-rice','var(--orange-tint)','var(--orange)'];
        if(type === 'system') return ['fa-cloud-arrow-down','var(--violet-tint)','var(--violet-soft)'];
        return ['fa-bell','var(--orange-tint)','var(--orange)'];
      }
      async function loadNotifications(){
        if(notifLoading){ notifReloadQueued = true; return; }
        notifLoading = true;
        const read = readSet();
        try {
          const live = [];
          if(Array.isArray(RS.INVENTORY)){
            RS.INVENTORY.filter(i=>Number(i.stock) < Number(i.min)).slice(0,4).forEach(i=>{
              live.push({ id:'low-stock-'+(i.id||i.name), type:'warning', title:`${i.name} is low on stock`, message:`${i.stock || 0} ${i.unit || 'unit'} left, minimum ${i.min || 0}`, timestamp:'', isRead:read.has('low-stock-'+(i.id||i.name)) });
            });
          }
          if(Array.isArray(RS.QR_ORDERS)){
            RS.QR_ORDERS.filter(o=>String(o.status||'').toLowerCase()==='pending').slice(0,4).forEach(o=>{
              const id = 'pending-order-'+(o.id||o.orderId||o.table);
              live.push({ id, type:'order', title:`Pending order ${o.orderId || ''}`.trim(), message:`${o.table || 'Table'} - ${rs(o.total || 0)}`, timestamp:o.time || o.dateTime || '', isRead:read.has(id) });
            });
          }
          if(Array.isArray(RS.BILLS)){
            RS.BILLS.filter(b=>String(b.status||'').toLowerCase()==='refunded').slice(0,2).forEach(b=>{
              const id = 'refund-'+(b.id||b.no);
              live.push({ id, type:'billing', title:`Refund completed ${b.no || ''}`.trim(), message:`${rs(b.amount || 0)} refunded`, timestamp:b.time || '', isRead:read.has(id) });
            });
          }
          if(window.RS_LAST_CLOUD_ERROR){
            live.push({ id:'cloud-sync-warning', type:'warning', title:'Cloud sync needs attention', message:window.RS_LAST_CLOUD_ERROR.message || 'Latest change is saved locally until sync recovers.', timestamp:window.RS_LAST_CLOUD_ERROR.time, isRead:read.has('cloud-sync-warning') });
          }
          if(window.RS_APP_UPDATE){
            const notifId = 'system-update-' + (window.RS_APP_UPDATE.signature ? window.RS_APP_UPDATE.signature.substring(0, 8) : 'latest');
            const timestamp = window.RS_APP_UPDATE.detectedAt || window.RS_APP_UPDATE.releaseInfo?.date || '';
            const msg = window.RS_APP_UPDATE.isPatchOnly 
              ? 'System stability hotfix - Click to apply.'
              : `Version ${window.RS_APP_UPDATE.releaseInfo?.version || 'latest'} - Click to apply.`;
            live.push({ id:notifId, type:'system', title:'System update is ready', message:msg, timestamp, isRead:read.has(notifId) });
          }
          let saved = [];
          if(window.RS_DB){
            if(RS_DB.isCloud && RS_DB.listCloud && !notifCloudUnavailable) {
              try {
                saved = await RS_DB.listCloud('notifications');
                if(RS_DB.writeLocal) await RS_DB.writeLocal('notifications', saved || []);
              } catch(e) {
                notifCloudUnavailable = true;
                saved = RS_DB.listLocal ? await RS_DB.listLocal('notifications') : [];
              }
            } else {
              saved = RS_DB.listLocal ? await RS_DB.listLocal('notifications') : [];
            }
          }
          NOTIFS = [...saved, ...live].map(n=>{
            const [ic,bg,c] = iconFor(n.type);
            return { ...n, ic, bg, c, unread: !n.isRead && !read.has(String(n.id)), time:relTime(n.timestamp || n.createdAt) };
          });
          draw(); updateDot();
        } finally {
          notifLoading = false;
          if(notifReloadQueued){ notifReloadQueued = false; setTimeout(loadNotifications, 0); }
        }
      }
      function draw(){
        const unread = NOTIFS.filter(n=>n.unread).length;
        panel.innerHTML = `<div class="notif-h"><h4>Notifications ${unread?`<span class="pill pill-orange" style="padding:2px 8px;font-size:11px">${unread} new</span>`:''}</h4><button class="btn btn-ghost btn-sm" id="notif-read">Mark all read</button></div>
          <div class="notif-list">${NOTIFS.length ? NOTIFS.map((n,i)=>`<div class="notif-item ${n.unread?'unread':''}" data-i="${i}"><div class="notif-ic" style="background:${n.bg};color:${n.c}"><i class="fa-solid ${n.ic}"></i></div><div style="flex:1"><div class="nt">${safe(n.title)}</div><div class="nd">${safe(n.message)}</div><div class="ntime">${safe(n.time)}</div></div></div>`).join('') : '<div class="sr-empty">No live notifications right now.</div>'}</div>`;
        const markRead = async n => {
          if(!n || !n.id) return;
          n.unread = false; n.isRead = true;
          const read = readSet(); read.add(String(n.id)); saveRead(read);
          if(window.RS_DB && !String(n.id).startsWith('low-stock-') && !String(n.id).startsWith('pending-order-') && !String(n.id).startsWith('refund-') && n.id !== 'cloud-sync-warning' && !String(n.id).startsWith('system-update')) {
            try { await RS_DB.put('notifications', n.id, n); } catch(e){}
          }
          if(String(n.id).startsWith('system-update') && typeof window.RS_SHOW_UPDATE_DIALOG === 'function') {
            window.RS_SHOW_UPDATE_DIALOG();
          }
        };
        panel.querySelector('#notif-read').onclick = async ()=>{ for(const n of NOTIFS) await markRead(n); draw(); updateDot(); };
        $$('.notif-item',panel).forEach(el=> el.onclick=async()=>{ await markRead(NOTIFS[+el.dataset.i]); draw(); updateDot(); });
      }
      function updateDot(){ const d=bell.querySelector('.dot-notif'); if(d) d.style.display = NOTIFS.some(n=>n.unread)?'':'none'; }
      document.body.appendChild(panel); loadNotifications();
      bell.addEventListener('click', e=>{ e.stopPropagation(); panel.classList.toggle('show'); });
      document.addEventListener('click', e=>{ if(!panel.contains(e.target) && !bell.contains(e.target)) panel.classList.remove('show'); });
      document.addEventListener('rs:hydrated', loadNotifications);
      document.addEventListener('rs:pending_orders_synced', loadNotifications);
      document.addEventListener('rs:collection_synced', loadNotifications);
      window.addEventListener('rs:cloud-fallback', loadNotifications);
      document.addEventListener('rs:app_update_available', loadNotifications);
      document.addEventListener('rs:render-inventory', loadNotifications);
    }

    /* ===================== SETTINGS ===================== */
    const SET_NAV = [['profile','Outlet profile','fa-store'],['tax','Taxes & billing','fa-percent'],['printer','Printers & KOT','fa-print'],['gateway','WhatsApp gateway','fa-whatsapp'],['payments','Payments','fa-indian-rupee-sign'],['security','Security & PIN','fa-shield-halved'],['team','Team & roles','fa-user-shield'],['plan','Plan & billing','fa-crown'],['danger','Danger Zone','fa-triangle-exclamation']];
    const skey = s => 'set_'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    function field(label, val, ph){ return `<div><label class="fl">${label}</label><input class="form-input" data-skey="${skey(label)}" value="${val||''}" placeholder="${ph||''}"></div>`; }
    function sel(label, opts, cur){ return `<div><label class="fl">${label}</label><select class="form-input" data-skey="${skey(label)}">${opts.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`; }
    function toggle(t,d,on){ return `<div class="set-row"><div class="si"><div class="st">${t}</div><div class="sd">${d}</div></div><label class="toggle"><input type="checkbox" data-skey="${skey(t)}" ${on?'checked':''}><span></span></label></div>`; }
    // Country & currency helpers -- populated from shared RS_COUNTRIES data
    function countrySelect(cur) {
      const countries = window.RS_COUNTRIES || [];
      if (!countries.length) return `<div><label class="fl">Country</label><input class="form-input" id="set-country" data-skey="set_country" value="${cur||'India'}" placeholder="Outlet country"></div>`;
      const flag = window.RS_countryFlag || (code => '🌐');
      const opts = countries.map(c => `<option value="${c.name}" ${c.name===(cur||'India')?'selected':''}>${flag(c.code)} ${c.name} (+${c.dial})</option>`).join('');
      return `<div><label class="fl">Country</label><select class="form-input" id="set-country" data-skey="set_country">${opts}</select></div>`;
    }
    function currencySelect(cur) {
      const currencies = window.RS_getCurrencies ? window.RS_getCurrencies() : [];
      const defaults = ['INR (₹)','EUR (€)','USD ($)','GBP (£)','AED (د.إ)','SAR (ر.س)','SGD ($)','AUD ($)','CAD ($)','NZD ($)','ZAR (R)'];
      const flag = window.RS_countryFlag || (() => '');
      const opts = (currencies.length ? currencies.map(c => c.currency) : defaults)
        .map(c => `<option ${c===(cur||'INR (₹)')?'selected':''}>${c}</option>`).join('');
      return `<div><label class="fl">Currency</label><select class="form-input" id="set-currency" data-skey="set_currency">${opts}</select></div>`;
    }
    const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
    const defaultOutletName = sessionMeta.tenant_name || sessionMeta.business_name || String(sessionMeta.tenant_slug || sessionStorage.getItem('tenant_slug') || 'Outlet').replace(/[-_]+/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
    const defaultOutletCode = sessionMeta.tenant_slug || sessionMeta.outlet_id || sessionStorage.getItem('tenant_slug') || '';
    const PANES = {
      profile:`<div class="set-section form-grid-2">${field('Business name',defaultOutletName)}${field('Outlet code',defaultOutletCode)}</div>
<div class="set-section" style="margin-top:12px">
  <label class="fl">Business type <span style="font-size:11px;color:var(--orange);font-weight:600;margin-left:6px">SaaS vertical</span></label>
  <select class="form-input" data-skey="set_business_type" style="max-width:320px">
    <option value="restaurant">Restaurant / Café / Food</option>
    <option value="retail">Retail Store</option>
    <option value="salon">Salon / Spa</option>
    <option value="clinic">Clinic / Hospital</option>
  </select>
  <p style="font-size:11.5px;color:var(--text-soft);margin-top:6px">Changing this adapts the dashboard tabs, labels, and features for your business. Save and refresh to apply.</p>
</div>
        <div class="set-section">${field('Address','','Outlet address')}</div>
        <div class="set-section form-grid-2">${field('Phone','','Outlet phone')}${field('Email','','Outlet email')}</div>
        <div class="set-section form-grid-2">${field('GSTIN','','GSTIN if enabled')}${sel('Cuisine',['North Indian','South Indian','Multi-cuisine','Cafe'],'Multi-cuisine')}</div>
        <div class="set-section form-grid-2" id="set-country-currency-row"></div>`,
      tax:`<div class="set-section form-grid-2">
          ${toggle('Calculate taxes','Enable tax calculations on cart and bills',false)}
          ${field('Invoice prefix','INV-')}
        </div>
        <div class="set-section form-grid-2">
          ${field('Tax label','GST','e.g. GST, VAT, Sales Tax')}
          ${field('Tax rate (%)','5','Tax rate percentage')}
        </div>
        ${toggle('Service charge','Add 5% service charge on dine-in',false)}
        ${toggle('Round-off totals','Round bill total to nearest rupee',true)}
        ${toggle('Show HSN codes','Print HSN/SAC codes on GST invoice',true)}
        ${toggle('Inclusive pricing','Menu prices include GST',false)}`,
      printer:`<div class="set-section form-grid-2">${field('Receipt printer','EPSON TM-T82 (USB)')}${sel('Paper size',['58 mm','80 mm'],'80 mm')}</div>
        ${toggle('Auto-print receipt','Print automatically after payment',true)}
        ${toggle('Auto-print KOT','Send KOT to kitchen printer on order',true)}
        <div class="set-section form-grid-2">${sel('KOT copies',['1','2','3'],'2')}${sel('Kitchen printer',['Tandoor station','Main kitchen','Beverages'],'Main kitchen')}</div>`,
      gateway:`<div id="outlet-gateway-status-container"><div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Configure your WhatsApp gateway for this outlet</div></div><span class="pill" style="padding:5px 12px; background: rgba(107, 114, 128, 0.1); color: #6B7280;"><i class="fa-solid fa-spinner fa-spin"></i> Checking...</span></div></div>
        ${toggle('Auto-send receipts','WhatsApp the bill to customer after payment',true)}
        ${sel('WhatsApp bill format',['Text receipt','Thermal PDF receipt'],'Text receipt')}
        ${toggle('Order updates','Notify customer when order is ready',true)}
        ${toggle('Marketing broadcasts','Allow promotional campaigns',true)}
        <div class="set-section"><label class="fl">Receipt message template</label><textarea class="form-input" rows="3">Thanks for dining with us. Your bill is attached.</textarea></div>
        <div class="set-section" style="margin-top:20px; border-top:1px solid var(--stroke-2); padding-top:16px;">
          <label class="fl" style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:8px;">
            <span>Recent WhatsApp Activity Logs</span>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-refresh-client-logs" style="font-size:10px; padding:2px 8px; height:22px; cursor:pointer;"><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>
          </label>
          <div id="client-gateway-logs" style="max-height:160px; overflow-y:auto; background:rgba(0,0,0,0.15); border:1px solid var(--stroke-2); border-radius:var(--r-sm); padding:10px; font-family:monospace; font-size:11px; line-height:1.5; color:var(--text-soft)">
            <div style="text-align:center; padding:12px; color:var(--text-mute)">Loading activity logs...</div>
          </div>
        </div>
        <div class="set-section" style="margin-top:20px; border-top:1px solid var(--stroke-2); padding-top:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
            <div>
              <div style="font-weight:700; font-size:13px; color:var(--text)">Troubleshoot Gateway</div>
              <div style="font-size:11.5px; color:var(--text-soft); margin-top:2px;">If WhatsApp is stuck or not showing a new QR, you can force a fresh reset.</div>
            </div>
            <button type="button" class="btn btn-sm btn-danger" id="btn-gateway-troubleshoot-reset" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); font-size:11px; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:600; white-space:nowrap; transition:all 0.2s">
              <i class="fa-solid fa-triangle-exclamation"></i> Force Reset
            </button>
          </div>
        </div>`,
      team:`<div class="set-row"><div class="si"><div class="st">Team members</div><div class="sd">Manage staff roles and permissions for this outlet</div></div><button class="btn btn-ghost btn-sm" id="set-team-go">Manage team</button></div>
        ${toggle('Require PIN for refunds','Manager PIN needed to issue refunds',true)}
        ${toggle('Cashier can edit prices','Allow price overrides at POS',false)}
        ${toggle('Lock reports for staff','Only admins can view sales reports',true)}`,
      plan:`<div class="panel-head" style="margin-bottom:14px"><h3>Current plan</h3></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
          <div style="flex:1;min-width:200px;border:1.5px solid var(--orange);border-radius:var(--r-md);padding:18px;background:var(--orange-tint)"><div style="font-family:var(--font-display);font-weight:800;font-size:13px;color:var(--orange);text-transform:uppercase;letter-spacing:.06em">Current subscription</div><div style="font-family:var(--font-display);font-weight:800;font-size:30px;margin:6px 0">Active</div><div style="font-size:12.5px;color:var(--text-soft)">Plan details sync from account billing</div></div>
          <div class="crm-stats" style="flex:2;min-width:240px"><div class="cs"><div class="csv">-</div><div class="csl">Devices</div></div><div class="cs"><div class="csv">-</div><div class="csl">Outlets</div></div><div class="cs"><div class="csv">-</div><div class="csl">Bills/mo</div></div></div>
        </div>
        <button class="btn btn-primary"><i class="fa-solid fa-arrow-up"></i> Manage plan</button>`,
      payments:`<div class="panel-head" style="margin-bottom:14px"><h3>Payments</h3><p style="font-size:12.5px;color:var(--text-soft);margin-top:4px">Configure Razorpay Route so customer payments go directly to your bank account.</p></div><div id="rzp-route-container"><div style="display:flex;align-items:center;gap:8px;padding:16px;border:1px solid var(--stroke-2);border-radius:var(--r-sm);background:var(--glass)"><i class="fa-solid fa-spinner fa-spin" style="color:var(--orange)"></i><span style="font-size:13px;color:var(--text-soft)">Checking payment status...</span></div></div>`,
      security:`<div class="panel-head" style="margin-bottom:20px"><h3>Security &amp; PIN</h3><p style="font-size:12.5px;color:var(--text-soft);margin-top:4px">Protect sensitive actions with a 4-digit admin PIN. Staff must enter it for refunds, deletions, and other restricted operations.</p></div><div id="rs-security-panel"></div>`,
      danger:`<div class="panel-head" style="margin-bottom:14px"><h3>Danger Zone</h3></div>
        <div style="border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.03);border-radius:var(--r-md);padding:20px;margin-bottom:18px">
          <h4 style="color:#ef4444;margin-bottom:8px;font-family:var(--font-display);font-weight:800;font-size:14px;"><i class="fa-solid fa-triangle-exclamation"></i> Reset Operational Data</h4>
          <p style="font-size:12.5px;color:var(--text-soft);margin-bottom:16px;line-height:1.5">This will permanently delete all operational data for this outlet including all bills, transactions, customer profiles, custom menu items, staff, and inventory records. Account credentials and settings will be preserved.</p>
          <button class="btn" id="btn-client-reset-data" style="background:#EF4444;color:#fff;border:none;padding:10px 16px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s ease;"><i class="fa-solid fa-trash-can"></i> Reset Outlet Data</button>
        </div>`
    };
    // -- Security & PIN panel --------------------------------------------------
    function initSecurityPanel(body) {
      const container = body.querySelector('#rs-security-panel');
      if (!container) return;

      const hasPIN = window.RSPinModal && RSPinModal.isConfigured();

      // -- Sections: PIN management + Protected operations list -------------
      container.innerHTML = `
        <!-- PIN Status Card -->
        <div style="border:1px solid var(--stroke-2);border-radius:var(--r-md);padding:20px;margin-bottom:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:44px;height:44px;border-radius:50%;background:${hasPIN?'rgba(34,197,94,0.12)':'rgba(255,107,0,0.1)'};display:flex;align-items:center;justify-content:center;font-size:20px;color:${hasPIN?'#22c55e':'#FF6B00'};flex-shrink:0;">
                <i class="fa-solid ${hasPIN?'fa-lock':'fa-lock-open'}"></i>
              </div>
              <div>
                <div style="font-weight:800;font-size:14px;color:var(--text);">${hasPIN?'Admin PIN is active':'No Admin PIN set'}</div>
                <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">${hasPIN?'Protected actions require this PIN to proceed.':'Set a PIN to restrict refunds, deletions &amp; sensitive settings.'}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
              ${hasPIN
                ? `<button id="sec-change-pin" class="btn" style="font-size:12px;padding:8px 14px;"><i class="fa-solid fa-key"></i> Change PIN</button>`
                : `<button id="sec-set-pin" class="btn btn-primary" style="font-size:12px;padding:8px 14px;"><i class="fa-solid fa-shield-halved"></i> Set PIN</button>`
              }
            </div>
          </div>
          ${hasPIN?`
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--stroke-2);display:flex;align-items:center;gap:12px;">
            <button id="sec-remove-pin" style="background:none;border:none;font-size:12px;color:#ef4444;cursor:pointer;font-family:inherit;padding:0;display:flex;align-items:center;gap:5px;"><i class="fa-solid fa-trash-can"></i> Remove PIN</button>
            <span style="color:var(--stroke-2)">|</span>
            <span style="font-size:11.5px;color:var(--text-soft);">Master reset code: <strong style="letter-spacing:.1em;">482916</strong> -- share only with business owner</span>
          </div>` : ''}
        </div>

        <!-- Protected Operations -->
        <div style="border:1px solid var(--stroke-2);border-radius:var(--r-md);padding:20px;margin-bottom:18px;">
          <div style="font-weight:800;font-size:13px;color:var(--text);margin-bottom:4px;"><i class="fa-solid fa-shield-halved" style="color:#FF6B00;margin-right:6px;"></i>PIN-Protected Operations</div>
          <div style="font-size:12px;color:var(--text-soft);margin-bottom:16px;">The following actions always require admin PIN verification.</div>
          ${[
            ['fa-trash-can','Delete Bill','Permanently remove a completed bill from records'],
            ['fa-rotate-left','Refund','Mark a transaction as refunded and log it'],
            ['fa-percent','Discount Override','Apply discount above threshold at POS (coming soon)'],
            ['fa-pen-to-square','Amend Closed Bill','Edit items on a settled bill (coming soon)'],
            ['fa-cash-register','Manual Cash Drawer','Open cash drawer without a transaction (coming soon)'],
            ['fa-triangle-exclamation','Data Reset','Danger Zone operations always require PIN'],
          ].map(([icon,op,desc])=>`
            <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--stroke-2);">
              <div style="width:30px;height:30px;border-radius:8px;background:rgba(255,107,0,0.08);display:flex;align-items:center;justify-content:center;font-size:13px;color:#FF6B00;flex-shrink:0;margin-top:1px;"><i class="fa-solid ${icon}"></i></div>
              <div>
                <div style="font-weight:700;font-size:13px;color:var(--text);">${op}</div>
                <div style="font-size:11.5px;color:var(--text-soft);margin-top:1px;">${desc}</div>
              </div>
              <div style="margin-left:auto;"><span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:rgba(255,107,0,0.1);color:#FF6B00;">PIN Required</span></div>
            </div>
          `).join('')}
        </div>

        <!-- Tips -->
        <div style="border:1px solid rgba(255,107,0,0.2);background:rgba(255,107,0,0.03);border-radius:var(--r-sm);padding:14px 16px;">
          <div style="font-size:12px;color:var(--text-soft);line-height:1.6;">
            <strong style="color:#FF6B00;">Tips:</strong> Share the 4-digit PIN only with managers. The master reset code (shown above) can bypass a forgotten PIN -- keep it in a safe place. PIN attempts are limited to 3 before a 30-second lockout.
          </div>
        </div>
      `;

      // -- Bind buttons ------------------------------------------------------
      container.querySelector('#sec-set-pin')?.addEventListener('click', async () => {
        if (!window.RSPinModal) return;
        const ok = await RSPinModal.setup();
        if (ok) { RS.toast('Admin PIN set successfully','fa-shield-halved'); initSecurityPanel(body); }
      });

      container.querySelector('#sec-change-pin')?.addEventListener('click', async () => {
        if (!window.RSPinModal) return;
        const ok = await RSPinModal.change();
        if (ok) { RS.toast('Admin PIN updated','fa-key'); initSecurityPanel(body); }
      });

      container.querySelector('#sec-remove-pin')?.addEventListener('click', async () => {
        if (!window.RSPinModal) return;
        // Require current PIN first
        const verified = await RSPinModal.request('Confirm PIN removal');
        if (!verified) return;
        if (!confirm('Remove admin PIN? All protected actions will be accessible without verification.')) return;
        if (window.RS_SETTINGS) delete window.RS_SETTINGS.admin_pin_hash;
        if (window.RS && RS.getSettings && RS.saveSettings) {
          const s = await RS.getSettings().catch(()=>({})) || {};
          delete s.admin_pin_hash;
          await RS.saveSettings(s).catch(()=>{});
        }
        RS.toast('Admin PIN removed','fa-lock-open');
        initSecurityPanel(body);
      });
    }

    // -- Razorpay Route onboarding panel --------------------------------------
    async function initRazorpayRoutePanel(body) {
      const container = body.querySelector('#rzp-route-container');
      if (!container) return;

      function renderError(msg) {
        container.innerHTML = `<div style="padding:14px;border:1px solid rgba(239,68,68,0.25);border-radius:var(--r-sm);background:rgba(239,68,68,0.04);color:#ef4444;font-size:13px;">${msg}</div>`;
      }

      function pill(text, color) {
        return `<span class="pill" style="padding:5px 12px;background:rgba(${color},0.12);color:rgb(${color})"><span class="dot" style="background:rgb(${color})"></span>${text}</span>`;
      }

      // Fetch current Route status from edge function
      let status = null;
      try {
        const supabaseUrl = window.__SUPABASE_URL__ || '';
        const supabaseKey = window.__SUPABASE_ANON_KEY__ || '';
        const session = window.RS_API && RS_API.session && RS_API.session();
        const token   = session && (session.access_token || session.token);
        if (!supabaseUrl || !token) throw new Error('Not authenticated');

        const res = await fetch(`${supabaseUrl}/functions/v1/razorpay-route`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'apikey':        supabaseKey,
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify({ action: 'get_account' }),
        });
        status = await res.json();
      } catch(e) {
        renderError('Could not load payment status. Please refresh and try again.');
        return;
      }

      // -- Already activated ----------------------------------------------------
      if (status.razorpay_route_enabled && status.razorpay_kyc_status === 'activated') {
        container.innerHTML = `
          <div class="set-row" style="margin-bottom:16px">
            <div class="si"><div class="st">Razorpay Route</div><div class="sd">Customer payments go directly to your bank account via Razorpay.</div></div>
            ${pill('Active', '16, 185, 129')}
          </div>
          <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;line-height:1.8;">
            <div><span style="color:var(--text-soft)">Linked account:</span> <strong>${status.razorpay_account_id || '--'}</strong></div>
            <div><span style="color:var(--text-soft)">Settlement:</span> <strong>T+2 business days to your registered bank</strong></div>
            <div><span style="color:var(--text-soft)">Customer payment methods:</span> <strong>UPI · Cards · Netbanking · Wallets</strong></div>
          </div>
          <p style="font-size:11.5px;color:var(--text-soft);margin-top:10px;">To change bank account or KYC details, contact Razorpay support directly with account ID above.</p>
        `;
        return;
      }

      // -- KYC submitted, waiting for Razorpay approval -------------------------
      if (status.razorpay_account_id && status.razorpay_kyc_status === 'pending') {
        container.innerHTML = `
          <div class="set-row" style="margin-bottom:16px">
            <div class="si"><div class="st">Razorpay Route</div><div class="sd">KYC submitted and under review by Razorpay.</div></div>
            ${pill('Pending KYC', '234, 179, 8')}
          </div>
          <div style="background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:14px 16px;font-size:13px;">
            <div style="margin-bottom:8px"><span style="color:var(--text-soft)">Linked account ID:</span> <strong>${status.razorpay_account_id}</strong></div>
            <p style="color:var(--text-soft);line-height:1.6;margin:0;">Razorpay typically approves within 1-2 business days. RestroSuite will automatically enable Route payments the moment your account is activated. No action needed from you.</p>
          </div>
        `;
        return;
      }

      // -- Not set up yet -- show onboarding form --------------------------------
      container.innerHTML = `
        <div class="set-row" style="margin-bottom:16px">
          <div class="si">
            <div class="st">Razorpay Route</div>
            <div class="sd">Link your bank account so customer payments settle directly to you -- no UTR codes, no cashier verification.</div>
          </div>
          ${pill('Not connected', '107, 114, 128')}
        </div>

        <div style="background:rgba(255,107,0,0.04);border:1px solid rgba(255,107,0,0.2);border-radius:var(--r-sm);padding:12px 14px;font-size:12.5px;color:var(--text-soft);line-height:1.6;margin-bottom:18px;">
          <i class="fa-solid fa-circle-info" style="color:var(--orange);margin-right:6px"></i>
          <strong style="color:var(--text)">One-time setup.</strong> After connecting, all future QR order payments go directly to your bank via Razorpay. RestroSuite never holds your money.
        </div>

        <div class="form-grid-2" style="gap:12px;" id="rzp-onboard-form">
          <div><label class="fl">Legal Business Name *</label><input class="form-input" id="rzp-biz-name" placeholder="As on PAN card"></div>
          <div><label class="fl">Business Type *</label>
            <select class="form-input" id="rzp-biz-type">
              <option value="restaurant">Restaurant (Proprietorship)</option>
              <option value="individual">Individual</option>
              <option value="partnership">Partnership</option>
              <option value="private_limited">Private Limited</option>
              <option value="public_limited">Public Limited</option>
              <option value="llp">LLP</option>
            </select>
          </div>
          <div><label class="fl">Contact Person Name *</label><input class="form-input" id="rzp-contact-name" placeholder="Owner / Director name"></div>
          <div><label class="fl">Contact Email *</label><input class="form-input" type="email" id="rzp-contact-email" placeholder="business@email.com"></div>
          <div><label class="fl">Mobile Number *</label><input class="form-input" type="tel" id="rzp-contact-mobile" placeholder="10-digit mobile"></div>
          <div><label class="fl">PAN *</label><input class="form-input" id="rzp-pan" placeholder="ABCDE1234F" maxlength="10" style="text-transform:uppercase"></div>
          <div><label class="fl">Bank Account Number *</label><input class="form-input" id="rzp-bank-acc" placeholder="Your business bank account number"></div>
          <div><label class="fl">IFSC Code *</label><input class="form-input" id="rzp-ifsc" placeholder="e.g. HDFC0001234" maxlength="11" style="text-transform:uppercase"></div>
          <div style="grid-column:1/-1"><label class="fl">Account Holder Name *</label><input class="form-input" id="rzp-bank-name" placeholder="Name on bank account"></div>
          <div><label class="fl">City</label><input class="form-input" id="rzp-city" placeholder="City"></div>
          <div><label class="fl">State</label><input class="form-input" id="rzp-state" placeholder="State"></div>
          <div><label class="fl">PIN Code</label><input class="form-input" id="rzp-pin" placeholder="6-digit PIN" maxlength="6"></div>
          <div style="grid-column:1/-1"><label class="fl">Street Address</label><input class="form-input" id="rzp-street" placeholder="Outlet registered address"></div>
        </div>

        <div style="margin-top:18px;display:flex;align-items:center;gap:10px;padding-top:14px;border-top:1px solid var(--stroke-2);">
          <button class="btn btn-primary" id="btn-rzp-submit" style="min-width:160px;">
            <i class="fa-brands fa-razorpay"></i> Connect & Submit KYC
          </button>
          <span style="font-size:11.5px;color:var(--text-soft);">Your details are sent directly to Razorpay over HTTPS. RestroSuite does not store your PAN or bank credentials.</span>
        </div>
        <div id="rzp-submit-result" style="margin-top:12px"></div>
      `;

      // Submit handler
      container.querySelector('#btn-rzp-submit').onclick = async function() {
        const btn = this;
        const result = container.querySelector('#rzp-submit-result');

        const getValue = id => (container.querySelector('#' + id)?.value || '').trim();
        const required = ['rzp-biz-name','rzp-contact-name','rzp-contact-email','rzp-contact-mobile','rzp-pan','rzp-bank-acc','rzp-ifsc','rzp-bank-name'];
        const missing  = required.filter(id => !getValue(id));
        if (missing.length) {
          result.innerHTML = `<p style="color:#ef4444;font-size:13px;">Please fill all required (*) fields.</p>`;
          return;
        }
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(getValue('rzp-pan').toUpperCase())) {
          result.innerHTML = `<p style="color:#ef4444;font-size:13px;">Invalid PAN format (e.g. ABCDE1234F).</p>`;
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting to Razorpay...';
        result.innerHTML = '';

        try {
          const supabaseUrl = window.__SUPABASE_URL__ || '';
          const supabaseKey = window.__SUPABASE_ANON_KEY__ || '';
          const session = window.RS_API && RS_API.session && RS_API.session();
          const token   = session && (session.access_token || session.token);

          const payload = {
            action:               'onboard_account',
            legal_business_name:  getValue('rzp-biz-name'),
            business_type:        container.querySelector('#rzp-biz-type')?.value || 'restaurant',
            contact_name:         getValue('rzp-contact-name'),
            contact_email:        getValue('rzp-contact-email'),
            contact_mobile:       getValue('rzp-contact-mobile'),
            pan:                  getValue('rzp-pan').toUpperCase(),
            bank_account_number:  getValue('rzp-bank-acc'),
            bank_ifsc:            getValue('rzp-ifsc').toUpperCase(),
            bank_beneficiary_name: getValue('rzp-bank-name'),
            address_street:       getValue('rzp-street'),
            address_city:         getValue('rzp-city'),
            address_state:        getValue('rzp-state'),
            address_pin:          getValue('rzp-pin'),
          };

          const res = await fetch(`${supabaseUrl}/functions/v1/razorpay-route`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'apikey':        supabaseKey,
              'Authorization': 'Bearer ' + token,
            },
            body: JSON.stringify(payload),
          });
          const data = await res.json();

          if (data.success) {
            container.innerHTML = `
              <div style="text-align:center;padding:30px 20px;">
                <div style="width:52px;height:52px;border-radius:50%;background:rgba(16,185,129,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;"><i class="fa-solid fa-circle-check" style="font-size:24px;color:#10b981"></i></div>
                <div style="font-weight:800;font-size:15px;margin-bottom:6px;">KYC Submitted Successfully</div>
                <p style="font-size:13px;color:var(--text-soft);line-height:1.6;max-width:380px;margin:0 auto;">Razorpay is reviewing your account. This usually takes <strong>1-2 business days</strong>. RestroSuite will automatically activate Route payments once approved -- no further action needed.</p>
                <div style="margin-top:14px;background:var(--glass);border:1px solid var(--stroke-2);border-radius:var(--r-sm);padding:10px 14px;font-size:12px;display:inline-block;">
                  Account ID: <strong>${data.account_id}</strong>
                </div>
              </div>
            `;
          } else {
            result.innerHTML = `<p style="color:#ef4444;font-size:13px;">${data.error || 'Submission failed. Please try again.'}</p>`;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-brands fa-razorpay"></i> Connect & Submit KYC';
          }
        } catch(e) {
          result.innerHTML = `<p style="color:#ef4444;font-size:13px;">Network error. Please try again.</p>`;
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-brands fa-razorpay"></i> Connect & Submit KYC';
        }
      };
    }

    function renderSettings(){
      const sec = $('#settings-tab');
      sec.innerHTML = `<div class="set-layout">
        <div class="set-nav">${SET_NAV.map((s,i)=>`<button class="${i===0?'active':''}" data-s="${s[0]}"><i class="fa-solid ${s[2]}"></i> ${s[1]}</button>`).join('')}</div>
        <div class="panel panel-pad">
          <div id="set-body"></div>
          <div style="display:flex;gap:10px;margin-top:20px;padding-top:18px;border-top:1px solid var(--stroke)"><div class="grow"></div><button class="btn btn-ghost" id="set-cancel">Cancel</button><button class="btn btn-primary" id="set-save"><i class="fa-solid fa-circle-check"></i> Save changes</button></div>
        </div></div>`;
      const body = $('#set-body');
      let SET_STORE = {};
      let outletGatewayInterval = null;
      async function pollOutletGateway() {
        const container = body.querySelector('#outlet-gateway-status-container');
        if (!container) {
          stopOutletGatewayPolling();
          return;
        }
        const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
        const tenantId = sessionMeta.tenant_id || sessionStorage.getItem('tenant_slug') || 'local-demo';
        
        // 1. Poll Gateway Status
        try {
          const res = await RS_API.data({ operation: 'gateway_status', tenantId: tenantId });
          if (!res || res.error) {
            container.innerHTML = `<div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd" style="color:#ef4444">Failed to fetch status: ${res ? res.error : 'Offline'}</div></div><span class="pill pill-red" style="padding:5px 12px"><span class="dot dot-live" style="background:#ef4444"></span> Offline</span></div>`;
          } else if (res.status === 'ready') {
            container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px"><div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Your WhatsApp account is active and connected.</div></div><span class="pill pill-green" style="padding:5px 12px"><span class="dot dot-live"></span> Ready</span></div><div style="display:flex;align-items:center;justify-content:space-between;background:var(--panel);border:1px solid var(--stroke);padding:12px;border-radius:8px"><div style="font-size:13px">Connected number: <strong>+${res.number || ''}</strong></div><button type="button" class="btn btn-sm btn-danger" id="btn-outlet-gateway-logout" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);font-size:11px;padding:6px 12px;border-radius:6px;cursor:pointer"><i class="fa-solid fa-power-off"></i> Disconnect</button></div></div>`;
            const logoutBtn = container.querySelector('#btn-outlet-gateway-logout');
            if (logoutBtn) {
              logoutBtn.onclick = async () => {
                if (!confirm("Are you sure you want to disconnect this WhatsApp account? You will need to scan a new QR code to re-link it.")) return;
                logoutBtn.disabled = true;
                logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disconnecting...';
                try {
                  await RS_API.data({ operation: 'gateway_logout', tenantId: tenantId });
                  pollOutletGateway();
                  if (typeof window.updateTopbarWhatsAppStatus === 'function') window.updateTopbarWhatsAppStatus();
                } catch (err) {
                  console.error(err);
                  alert("Failed to disconnect: " + err.message);
                  logoutBtn.disabled = false;
                  logoutBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Disconnect';
                }
              };
            }
          } else if (res.status === 'qr') {
            if (res.qr) {
              // Speed up polling while waiting for scan
              if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 3000); }
              container.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px"><div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Scan the QR code below to connect your WhatsApp account.</div></div><span class="pill pill-amber" style="padding:5px 12px"><span class="dot dot-live" style="background:#eab308"></span> Action Required</span></div><div style="display:flex;flex-direction:column;align-items:center;padding:20px 18px 18px;border:1.5px dashed var(--stroke);border-radius:var(--r-md);background:var(--panel);text-align:center"><img src="${res.qr}" alt="Scan QR Code" id="outlet-qr-img" style="width:170px;height:170px;border:4px solid #fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-bottom:12px;transition:opacity 0.4s"/><div style="font-size:12px;color:var(--text-soft);line-height:1.6">1. Open <strong>WhatsApp</strong> on your phone.<br>2. Go to <strong>Settings -> Linked Devices -> Link a Device</strong>.<br>3. Point your camera at this screen to scan the code.</div><div style="margin-top:10px;font-size:11px;color:var(--text-soft);opacity:0.6"><i class="fa-solid fa-rotate fa-spin" style="margin-right:4px"></i>Refreshing automatically...</div></div></div>`;
            } else {
              container.innerHTML = `<div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Generating QR code... please wait.</div></div><span class="pill pill-amber" style="padding:5px 12px"><i class="fa-solid fa-spinner fa-spin" style="margin-right:5px"></i> Generating...</span></div>`;
            }
          } else if (res.status === 'syncing' || res.status === 'authenticated') {
            // QR just scanned -- show animated syncing UI, speed up polling to catch 'ready'
            if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 2000); }
            container.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
              <div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">QR scanned! Syncing your WhatsApp account...</div></div><span class="pill pill-amber" style="padding:5px 12px"><span class="dot dot-live" style="background:#eab308;animation:pulse 0.8s infinite alternate"></span> Syncing</span></div>
              <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 18px;border:1.5px solid rgba(234,179,8,0.3);border-radius:var(--r-md);background:linear-gradient(135deg,rgba(234,179,8,0.04),rgba(234,179,8,0.01));text-align:center">
                <div style="position:relative;width:72px;height:72px">
                  <svg viewBox="0 0 72 72" style="width:72px;height:72px;transform:rotate(-90deg)">
                    <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(234,179,8,0.15)" stroke-width="5"/>
                    <circle cx="36" cy="36" r="30" fill="none" stroke="#eab308" stroke-width="5" stroke-dasharray="188" stroke-dashoffset="50" stroke-linecap="round" style="animation:wa-spin-progress 1.8s linear infinite"/>
                  </svg>
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:#eab308">
                    <i class="fa-brands fa-whatsapp"></i>
                  </div>
                </div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px">Connecting your account...</div>
                  <div style="font-size:12px;color:var(--text-soft);line-height:1.5">WhatsApp is verifying your device.<br>This usually takes 5-15 seconds.</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#22c55e;background:rgba(34,197,94,0.1);padding:4px 10px;border-radius:20px;border:1px solid rgba(34,197,94,0.2)"><i class="fa-solid fa-check"></i> QR Scanned</span>
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#eab308;background:rgba(234,179,8,0.1);padding:4px 10px;border-radius:20px;border:1px solid rgba(234,179,8,0.2)"><i class="fa-solid fa-spinner fa-spin"></i> Authenticating</span>
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-soft);background:var(--panel);padding:4px 10px;border-radius:20px;border:1px solid var(--stroke)"><i class="fa-solid fa-circle-dot"></i> Ready</span>
                </div>
                <div style="margin-top:4px;border-top:1px solid rgba(234,179,8,0.15);padding-top:14px;width:100%">
                  <div style="font-size:11px;color:var(--text-mute);margin-bottom:8px">Stuck? Connection not going through?</div>
                  <button type="button" id="btn-gateway-force-newqr" style="display:inline-flex;align-items:center;gap:6px;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.25);font-size:12px;font-weight:600;padding:7px 16px;border-radius:8px;cursor:pointer;transition:all 0.2s">
                    <i class="fa-solid fa-rotate-right"></i> Force New QR
                  </button>
                </div>
              </div>
            </div>
            <style>@keyframes wa-spin-progress{0%{stroke-dashoffset:188}100%{stroke-dashoffset:0}}</style>`;
            // Wire the Force New QR button
            const forceQrBtn = container.querySelector('#btn-gateway-force-newqr');
            if (forceQrBtn) {
              forceQrBtn.onclick = async () => {
                forceQrBtn.disabled = true;
                forceQrBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
                try {
                  await RS_API.data({ operation: 'gateway_reset', tenantId: tenantId });
                } catch(e) { /* ignore -- gateway restarts itself */ }
                // Wait a moment for gateway to restart then resume normal polling
                setTimeout(() => { if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 3000); } pollOutletGateway(); }, 3000);
              };
            }
          } else if (res.status === 'auth_failure') {
            container.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
              <div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Authentication failed. Please try scanning the QR code again.</div></div><span class="pill" style="padding:5px 12px;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2)"><i class="fa-solid fa-triangle-exclamation"></i> Auth Failed</span></div>
              <div style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid rgba(239,68,68,0.2);border-radius:var(--r-md);background:rgba(239,68,68,0.03)">
                <div style="font-size:22px;color:#ef4444"><i class="fa-solid fa-circle-xmark"></i></div>
                <div style="flex:1;font-size:12.5px;color:var(--text-soft)">WhatsApp rejected the authentication attempt. This can happen if the QR code expired or was used from another device. Click <strong>Retry</strong> to generate a fresh QR code.</div>
                <button type="button" class="btn btn-sm" id="btn-gateway-retry" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);font-size:11px;padding:6px 12px;border-radius:6px;white-space:nowrap"><i class="fa-solid fa-rotate-right"></i> Retry</button>
              </div>
            </div>`;
            const retryBtn = container.querySelector('#btn-gateway-retry');
            if (retryBtn) retryBtn.onclick = () => pollOutletGateway();
          } else if (res.status === 'connecting') {
            // Speed up polling while gateway is starting
            if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 2000); }
            container.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">
              <div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Gateway is starting up -- this usually takes 15-45 seconds.</div></div><span class="pill" style="padding:5px 12px;background:rgba(107,114,128,0.1);color:#6b7280"><i class="fa-solid fa-spinner fa-spin" style="margin-right:5px"></i> Starting up</span></div>
              <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px 18px;border:1.5px solid rgba(107,114,128,0.2);border-radius:var(--r-md);background:rgba(107,114,128,0.03);text-align:center">
                <div style="position:relative;width:56px;height:56px">
                  <svg viewBox="0 0 56 56" style="width:56px;height:56px;transform:rotate(-90deg)">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(107,114,128,0.15)" stroke-width="4"/>
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#6b7280" stroke-width="4" stroke-dasharray="138" stroke-dashoffset="138" stroke-linecap="round" style="animation:gw-conn-spin 1.5s linear infinite"/>
                  </svg>
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;color:#6b7280"><i class="fa-brands fa-whatsapp"></i></div>
                </div>
                <div>
                  <div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:4px">Initialising gateway...</div>
                  <div style="font-size:12px;color:var(--text-soft);line-height:1.5">WhatsApp gateway is booting up.<br>A QR code will appear shortly.</div>
                </div>
                <div style="border-top:1px solid rgba(107,114,128,0.15);padding-top:14px;width:100%;text-align:center">
                  <div style="font-size:11px;color:var(--text-mute);margin-bottom:8px">Stuck on this screen? Try forcing a reset:</div>
                  <button type="button" id="btn-gateway-conn-reset" style="display:inline-flex;align-items:center;gap:6px;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.25);font-size:12px;font-weight:600;padding:7px 16px;border-radius:8px;cursor:pointer;transition:all 0.2s">
                    <i class="fa-solid fa-rotate-right"></i> Force Reset
                  </button>
                </div>
              </div>
            </div>
            <style>@keyframes gw-conn-spin{0%{stroke-dashoffset:138}100%{stroke-dashoffset:0}}</style>`;
            const connResetBtn = container.querySelector('#btn-gateway-conn-reset');
            if (connResetBtn) {
              connResetBtn.onclick = async () => {
                connResetBtn.disabled = true;
                connResetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
                try {
                  await RS_API.data({ operation: 'gateway_reset', tenantId: tenantId });
                } catch(e) { /* ignore */ }
                setTimeout(() => { if (outletGatewayInterval) { clearInterval(outletGatewayInterval); outletGatewayInterval = setInterval(pollOutletGateway, 3000); } pollOutletGateway(); }, 3000);
              };
            }
          } else {
            container.innerHTML = `<div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Unknown status: ${res.status || 'N/A'}</div></div><span class="pill" style="padding:5px 12px;background:rgba(107,114,128,0.1);color:#6b7280"><i class="fa-solid fa-spinner fa-spin"></i> ${res.status ? res.status.toUpperCase() : 'CHECKING'}</span></div>`;
          }
        } catch (e) {
          console.warn('Failed to poll outlet gateway status:', e);
          container.innerHTML = `<div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd" style="color:#ef4444">Failed to fetch status: ${e.message}</div></div><span class="pill pill-red" style="padding:5px 12px"><span class="dot dot-live" style="background:#ef4444"></span> Offline</span></div>`;
        }

        // 2. Poll Gateway Activity Logs securely (for this tenant only)
        const logsContainer = body.querySelector('#client-gateway-logs');
        if (logsContainer) {
          try {
            const logsRes = await RS_API.data({ operation: 'gateway_logs', tenantId: tenantId });
            if (logsRes && logsRes.logs) {
              const logs = logsRes.logs.slice(0, 15);
              if (logs.length === 0) {
                logsContainer.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-mute);">No recent activity logs found.</div>';
              } else {
                logsContainer.innerHTML = logs.map(log => {
                  const logDate = log.created_at ? new Date(log.created_at) : new Date();
                  const timeStr = logDate.toTimeString().slice(0, 8);
                  const msg = log.details?.message || log.details?.error || 'System event';
                  const cls = log.status === 'ok' ? 'color:#22c55e' : (log.status === 'warning' ? 'color:#eab308' : 'color:#ef4444');
                  return `<div style="margin-bottom: 4px;"><span style="color:var(--text-mute);margin-right:8px;">${timeStr}</span><span style="${cls}">[${log.event.toUpperCase()}] ${msg}</span></div>`;
                }).join('');
              }
            } else {
              logsContainer.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-mute);">Failed to retrieve logs.</div>';
            }
          } catch (e) {
            logsContainer.innerHTML = `<div style="text-align: center; padding: 12px; color: #ef4444;">Error loading logs: ${e.message}</div>`;
          }
        }

        // 3. Wire Refresh Button Click
        const refreshBtn = body.querySelector('#btn-refresh-client-logs');
        if (refreshBtn && !refreshBtn.dataset.listenerBound) {
          refreshBtn.dataset.listenerBound = 'true';
          refreshBtn.onclick = () => {
            const icon = refreshBtn.querySelector('i');
            if (icon) icon.classList.add('fa-spin');
            pollOutletGateway().then(() => {
              if (icon) {
                setTimeout(() => icon.classList.remove('fa-spin'), 600);
              }
            });
          };
        }

        // 4. Wire Troubleshoot Force Reset Button Click
        const troubleshootBtn = body.querySelector('#btn-gateway-troubleshoot-reset');
        if (troubleshootBtn && !troubleshootBtn.dataset.listenerBound) {
          troubleshootBtn.dataset.listenerBound = 'true';
          troubleshootBtn.onclick = async () => {
            if (!confirm("Are you sure you want to force reset the WhatsApp gateway? This will clear the current session and generate a new QR code. Any unsent messages in the queue may be lost.")) return;
            troubleshootBtn.disabled = true;
            const originalHtml = troubleshootBtn.innerHTML;
            troubleshootBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
            try {
              await RS_API.data({ operation: 'gateway_reset', tenantId: tenantId });
              toast('Gateway reset command sent', 'fa-circle-check');
            } catch (err) {
              console.error(err);
              alert("Reset failed: " + err.message);
            } finally {
              setTimeout(() => {
                troubleshootBtn.disabled = false;
                troubleshootBtn.innerHTML = originalHtml;
                pollOutletGateway();
              }, 3000);
            }
          };
        }
      }
      function startOutletGatewayPolling() {
        if (outletGatewayInterval) clearInterval(outletGatewayInterval);
        pollOutletGateway();
        outletGatewayInterval = setInterval(pollOutletGateway, 5000);
      }
      function stopOutletGatewayPolling() {
        if (outletGatewayInterval) {
          clearInterval(outletGatewayInterval);
          outletGatewayInterval = null;
        }
      }

      function applyStore(){ $$('[data-skey]', body).forEach(el=>{ const k=el.dataset.skey; if(!(k in SET_STORE))return; if(el.type==='checkbox') el.checked=!!SET_STORE[k]; else el.value=SET_STORE[k]; }); }
      function collect(){ $$('[data-skey]', body).forEach(el=>{ SET_STORE[el.dataset.skey] = el.type==='checkbox'?el.checked:el.value; }); }
      function show(key){
        if(body.querySelector('[data-skey]')) collect();
        body.innerHTML = `<div class="set-pane active">${PANES[key]}</div>`;
        if (key === 'gateway') {
          startOutletGatewayPolling();
        } else {
          stopOutletGatewayPolling();
        }
        // If profile pane: inject country/currency selects dynamically using stored values
        if (key === 'profile') {
          const row = body.querySelector('#set-country-currency-row');
          if (row) {
            const curCountry  = SET_STORE['set_country']  || 'India';
            const curCurrency = SET_STORE['set_currency'] || 'INR (₹)';
            row.innerHTML = countrySelect(curCountry) + currencySelect(curCurrency);
            
            // Helper to update GSTIN label and placeholder dynamically based on country tax label
            const updateGstinLabels = (countryName) => {
              const gstinLabel = body.querySelector('[data-skey="set_gstin"]')?.parentNode?.querySelector('.fl');
              const gstinInput = body.querySelector('[data-skey="set_gstin"]');
              if (gstinLabel && gstinInput) {
                const taxInfo = window.RS_getCountryTaxInfo && window.RS_getCountryTaxInfo(countryName);
                const label = taxInfo ? taxInfo.label : 'GST';
                if (label === 'GST') {
                  gstinLabel.textContent = 'GSTIN';
                  gstinInput.placeholder = 'GSTIN if enabled';
                } else if (label === 'VAT') {
                  gstinLabel.textContent = 'VAT Number';
                  gstinInput.placeholder = 'VAT Number if enabled';
                } else {
                  gstinLabel.textContent = 'Tax ID / EIN';
                  gstinInput.placeholder = 'Tax ID if enabled';
                }
              }
            };

            updateGstinLabels(curCountry);

            // Country -> currency + phone-prefix + tax auto-link
            const countrySel  = body.querySelector('#set-country');
            const currencySel = body.querySelector('#set-currency');
            if (countrySel && currencySel) {
              countrySel.addEventListener('change', () => {
                // Extract real country name (strip flag + dial suffix added to option text)
                const rawVal = countrySel.value;
                const entry = window.RS_getCountryByName && window.RS_getCountryByName(rawVal);
                if (entry && entry.currency) {
                  currencySel.value = entry.currency;
                  // Force-refresh the custom dropdown trigger label
                  const cdTrigger = currencySel.closest('div')?.querySelector('.dropdown-trigger-label');
                  if (cdTrigger) cdTrigger.textContent = entry.currency;
                  currencySel.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (entry && entry.dial) {
                  // Update outlet phone prefix in settings
                  const phoneInput = body.querySelector('[data-skey="set_phone"]');
                  if (phoneInput) {
                    let rawPhone = phoneInput.value.replace(/^\+\d{1,4}\s*/, '').trim();
                    phoneInput.value = `+${entry.dial} ${rawPhone}`;
                    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  // Update cart customer phone prefix picker if it exists
                  const cartPhonePicker = document.querySelector('#cust-input-phone');
                  if (cartPhonePicker && cartPhonePicker.dataset.phonePrefixBuilt) {
                    const pflag = cartPhonePicker.parentElement?.querySelector('.pflag');
                    const pdial = cartPhonePicker.parentElement?.querySelector('.pdial');
                    if (pflag) pflag.textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
                    if (pdial) pdial.textContent = `+${entry.dial}`;
                  }
                }
                const taxInfo = window.RS_getCountryTaxInfo && window.RS_getCountryTaxInfo(rawVal);
                if (taxInfo) {
                  SET_STORE['set_tax_label'] = taxInfo.label;
                  SET_STORE['set_tax_rate_percent'] = taxInfo.rate;
                }
                updateGstinLabels(rawVal);
              });
            }
          }
        }
        applyStore();

        // Localize tax pane dynamically after loading values
        if (key === 'tax') {
          const curCountry = SET_STORE['set_country'] || 'India';
          const taxLabel = SET_STORE['set_tax_label'] || 'GST';
          const isIndiaGst = (taxLabel.toUpperCase() === 'GST') && 
            (curCountry.toLowerCase() === 'india' || curCountry.trim() === '');
          
          const hsnInput = body.querySelector('[data-skey="set_show_hsn_codes"]');
          const hsnRow = hsnInput?.closest('.set-row');
          if (hsnRow) {
            hsnRow.style.display = isIndiaGst ? 'flex' : 'none';
          }
          
          const incInput = body.querySelector('[data-skey="set_inclusive_pricing"]');
          const incDesc = incInput?.closest('.set-row')?.querySelector('.sd');
          if (incDesc) {
            incDesc.textContent = `Menu prices include ${taxLabel}`;
          }

          const taxLabelInput = body.querySelector('[data-skey="set_tax_label"]');
          if (taxLabelInput) {
            taxLabelInput.addEventListener('input', () => {
              const label = taxLabelInput.value || 'Tax';
              if (incDesc) incDesc.textContent = `Menu prices include ${label}`;
              const checkIndiaGst = (label.toUpperCase() === 'GST') && 
                (curCountry.toLowerCase() === 'india' || curCountry.trim() === '');
              if (hsnRow) hsnRow.style.display = checkIndiaGst ? 'flex' : 'none';
            });
          }
        }
        // Upgrade all native selects to custom dropdown widgets for visual consistency
        if (typeof window.RS_wrapAllSelects === 'function') {
          window.RS_wrapAllSelects(body, ['set-country', 'set-currency']);
        }
        // Mount phone prefix picker on the outlet phone field in profile settings
        if (key === 'profile' && window.RS_buildPhonePrefix) {
          const outletPhoneEl = body.querySelector('[data-skey="set_phone"]');
          if (outletPhoneEl && !outletPhoneEl.dataset.phonePrefixBuilt) {
            const settings2 = window.RS_SETTINGS || {};
            let initCode = 'IN';
            if (settings2.set_country && window.RS_getCountryByName) {
              const e2 = window.RS_getCountryByName(settings2.set_country);
              if (e2) initCode = e2.code;
            }
            window.RS_buildPhonePrefix(outletPhoneEl, initCode);
          }
        }
        $$('.set-nav button',sec).forEach(b=>b.classList.toggle('active', b.dataset.s===key));
        const tg=$('#set-team-go'); if(tg) tg.onclick=()=>RS.activateTab('employees-tab');
        const btnReset = $('#btn-client-reset-data');
        if(btnReset) {
          btnReset.onclick = async () => {
            if(!confirm("⚠️ RESET OUTLET DATA?\n\nThis will PERMANENTLY DELETE all of your operational data (bills, menu, inventory, employees, customers, drafts, etc.).\n\nThis action cannot be undone! Proceed?")) return;
            btnReset.disabled = true;
            btnReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';
            try {
              const collections = ['bills', 'menu', 'inventory', 'customers', 'employees', 'drafts', 'pending_orders', 'shifts', 'shift_events', 'attendance', 'leave_requests', 'reservations', 'offers', 'vendors', 'purchase_orders', 'support_tickets'];
              for (const c of collections) {
                const list = await RS_DB.list(c);
                for (const item of list) {
                  const id = (c === 'shifts') ? item.shiftId : (c === 'shift_events') ? item.eventId : item.id;
                  if (id != null) {
                    await RS_DB.del(c, id);
                  }
                }
              }
              RS.toast('All operational data reset successfully!', 'fa-circle-check');
              setTimeout(() => {
                window.location.reload();
              }, 1200);
            } catch(err) {
              console.error(err);
              RS.toast('Error resetting data: ' + err.message, 'fa-circle-exclamation');
              btnReset.disabled = false;
              btnReset.innerHTML = '<i class="fa-solid fa-trash-can"></i> Reset Outlet Data';
            }
          };
        }
      }
      $$('.set-nav button',sec).forEach(b=> b.onclick=()=>show(b.dataset.s));
      $('#set-save').onclick=()=>{ collect(); (RS.saveSettings?RS.saveSettings(SET_STORE):Promise.resolve()).then(()=>{
        const isCloud = RS.dbMode && RS.dbMode()==='cloud';
        if(isCloud){
          RS.toast('Settings saved to cloud','fa-circle-check');
        } else {
          RS.toast('Settings saved locally only — not synced to cloud. Log in to sync across devices.','fa-triangle-exclamation');
        }
        if(window.RS_SAAS){ RS_SAAS.refresh(); RS_SAAS.applyToUI(); }
        if(window.RS && RS.updateStaticCurrencyLabels) RS.updateStaticCurrencyLabels();
        if(window.RS && RS.syncPhoneCombosToSettings) RS.syncPhoneCombosToSettings(SET_STORE);
        if(window.RS && RS.loadReceiptProfile) RS.loadReceiptProfile();
        try{ if(window.RS && RS.renderPOS) RS.renderPOS(); if(window.RS && RS.renderCart) RS.renderCart(); } catch(e){}
      }); };
      $('#set-cancel').onclick=()=>show('profile');
      Promise.resolve(RS.getSettings?RS.getSettings():null).then(saved=>{ if(saved) SET_STORE=saved; show('profile'); });
    }
    RS.titles['settings-tab']=['Settings','Outlet, taxes, printer & gateway configuration'];
    RS.addRenderer('settings-tab', renderSettings);
    const openSet = $('#open-settings'); if(openSet) openSet.addEventListener('click', ()=>RS.activateTab('settings-tab'));

    /* ===================== DB MODE BADGE + SESSION ===================== */
    (function(){
      const pill = document.getElementById('db-mode-pill');
      function updatePill() {
        const cloud = window.RS_DB && window.RS_DB.isCloud;
        if(pill){
          if (cloud) {
            pill.innerHTML = `<span class="dot dot-live"></span> Cloud`;
            pill.style.cssText = '';
            pill.title = 'Connected to Supabase — data syncs to the cloud';
          } else {
            pill.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size:10px;margin-right:3px"></i> Local only`;
            pill.style.cssText = 'background:rgba(245,158,11,0.15);color:#b45309;border:1px solid rgba(245,158,11,0.4)';
            pill.title = 'Local mode — data is saved in this browser only and will NOT sync to other devices. Log in to enable cloud sync.';
          }
        }
      }
      updatePill();
      document.addEventListener('rs:hydrated', updatePill);
      // reflect signed-in user on the sidebar pill, if any
      if(window.RS_DB && RS_DB.session){ Promise.resolve(RS_DB.session()).then(s=>{ if(!s)return; const meta=(s.user&&(s.user.user_metadata||s.user.meta))||s||{}; const un=document.querySelector('.user-pill .un'), ur=document.querySelector('.user-pill .ur'), av=document.querySelector('.user-pill .avatar'); const name=meta.display_name||meta.name||meta.username||s.username||'Outlet User'; const outlet=s.tenant_name||meta.outlet||s.tenant_slug||'Outlet'; const role=s.role||meta.role||'Admin'; const properName=String(name).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); if(un) un.textContent=properName; if(av) av.textContent=properName.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'RS'; if(ur) { if(role==='superadmin') { ur.textContent='SaaS Super-Admin'; } else { ur.textContent=String(outlet).replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())+' · '+(String(role).charAt(0).toUpperCase()+String(role).slice(1)); } } }); }
      // route sign-out through the data layer
      const logout = document.querySelector('.sb-foot-btn.logout');
      if(logout){
        logout.removeAttribute('onclick');
        logout.addEventListener('click', async ()=>{
          if(!confirm("Warning: Logging out will end your session. Any unsaved cart items or local modifications will be cleared if another user logs in on this device. Do you want to proceed?")) return;
          try{ if(window.RS_DB) await RS_DB.signOut(); }catch(e){}
          location.href='login.html';
        });
      }
    })();

    /* ===================== MOBILE "MORE" SHEET ===================== */
    const moreBtn = $('#mnav-more');
    if(moreBtn){
      const MORE = [
        ['floor-tab','Floor & Tables','chair'],
        ['aggregator-tab','Online Orders','bowl-rice'],
        ['tokens-tab','Token Display','bullhorn'],
        ['inventory-tab','Inventory','boxes-stacked'],
        ['editor-tab','Menu Editor','pen-to-square'],
        ['customers-tab','Customers','address-book'],
        ['tax-tab','Tax & GST','file-invoice'],
        ['employees-tab','Employees','users'],
        ['analytics-tab','Advanced Analytics','chart-mixed'],
        ['growth-hub-tab','Growth Hub','rocket'],
        ['settings-tab','Settings','gear'],
        ['logout','Sign Out','right-from-bracket']
      ];
      moreBtn.addEventListener('click', ()=>{
        RSModal.open({ title:'All sections', icon:'fa-grip', size:'sm',
          body:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${MORE.map(m=>{
            const bgClass = m[0] === 'logout' ? 'bg-r' : 'bg-o';
            return `<button class="hub-card" data-go="${m[0]}" style="text-align:left;cursor:pointer;border:1px solid var(--stroke);background:var(--panel)"><div class="hub-ic ${bgClass}" style="width:38px;height:38px;font-size:15px"><i class="fa-solid fa-${m[2]}"></i></div><h4 style="font-size:14px;margin-top:10px">${m[1]}</h4></button>`;
          }).join('')}</div>`,
          onMount(modal, close){
            $$('[data-go]',modal).forEach(b=> b.onclick=()=>{
              if(b.dataset.go === 'logout') {
                if(!confirm("Warning: Logging out will end your session. Any unsaved cart items or local modifications will be cleared if another user logs in on this device. Do you want to proceed?")) return;
                close();
                if(window.RS_DB) {
                  RS_DB.signOut().then(()=>{ location.href='login.html'; });
                } else {
                  location.href='login.html';
                }
              } else {
                RS.activateTab(b.dataset.go);
                close();
              }
            });
          }
        });
      });
    }
    
    // Add topbar status badge polling & click handler
    window.updateTopbarWhatsAppStatus = async function() {
      const textEl = document.getElementById('topbar-whatsapp-status-text');
      const pillEl = document.getElementById('topbar-whatsapp-status-pill');
      if (!textEl || !pillEl) return;
      const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
      const tenantId = sessionMeta.tenant_id || sessionStorage.getItem('tenant_slug') || 'local-demo';
      try {
        const res = await RS_API.data({ operation: 'gateway_status', tenantId: tenantId });
        if (res && res.status === 'ready') {
          textEl.innerHTML = '<i class="fa-brands fa-whatsapp" style="margin-right:4px"></i>WhatsApp Linked';
          pillEl.style.background = 'rgba(34, 197, 94, 0.1)';
          pillEl.style.color = '#22c55e';
          pillEl.style.border = '1px solid rgba(34, 197, 94, 0.2)';
        } else if (res && (res.status === 'syncing' || res.status === 'authenticated')) {
          textEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i>WhatsApp Syncing';
          pillEl.style.background = 'rgba(234, 179, 8, 0.1)';
          pillEl.style.color = '#eab308';
          pillEl.style.border = '1px solid rgba(234, 179, 8, 0.2)';
        } else if (res && res.status === 'qr') {
          textEl.innerHTML = '<i class="fa-solid fa-qrcode" style="margin-right:4px"></i>Scan to Connect';
          pillEl.style.background = 'rgba(234, 179, 8, 0.1)';
          pillEl.style.color = '#eab308';
          pillEl.style.border = '1px solid rgba(234, 179, 8, 0.2)';
        } else if (res && res.status === 'auth_failure') {
          textEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="margin-right:4px"></i>Auth Failed';
          pillEl.style.background = 'rgba(239, 68, 68, 0.1)';
          pillEl.style.color = '#ef4444';
          pillEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
        } else if (res && res.status === 'connecting') {
          textEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i>WhatsApp Starting...';
          pillEl.style.background = 'rgba(107, 114, 128, 0.1)';
          pillEl.style.color = '#6b7280';
          pillEl.style.border = '1px solid rgba(107, 114, 128, 0.2)';
        } else {
          textEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="margin-right:4px"></i>WhatsApp Offline';
          pillEl.style.background = 'rgba(239, 68, 68, 0.1)';
          pillEl.style.color = '#ef4444';
          pillEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
        }
      } catch(err) {
        textEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="margin-right:4px"></i>WhatsApp Offline';
        pillEl.style.background = 'rgba(239, 68, 68, 0.1)';
        pillEl.style.color = '#ef4444';
        pillEl.style.border = '1px solid rgba(239, 68, 68, 0.2)';
      }
    };
    
    let topbarWhatsAppInterval = null;
    window.startTopbarWhatsAppPolling = function() {
      if (topbarWhatsAppInterval) clearInterval(topbarWhatsAppInterval);
      window.updateTopbarWhatsAppStatus();
      topbarWhatsAppInterval = setInterval(window.updateTopbarWhatsAppStatus, 15000);
      
      const pill = document.getElementById('topbar-whatsapp-status-pill');
      if (pill) {
        pill.onclick = () => {
          if (window.RS && typeof RS.activateTab === 'function') {
            RS.activateTab('settings-tab');
          }
          const gatewayBtn = document.querySelector('.set-nav button[data-s="gateway"]');
          if (gatewayBtn) {
            gatewayBtn.click();
          }
        };
      }
    };
    
    RS.syncPhoneCombosToSettings = function(customSettings) {
      const settings = customSettings || window.RS_SETTINGS || {};
      if (!settings.set_country || !window.RS_getCountryByName) return;
      const entry = window.RS_getCountryByName(settings.set_country);
      if (!entry) return;

      // 1. Update settings profile phone input if it exists
      const settingsPhone = document.querySelector('[data-skey="set_phone"]');
      if (settingsPhone && settingsPhone.dataset.phonePrefixBuilt) {
        if (typeof settingsPhone.RS_setCountryCode === 'function') {
          settingsPhone.RS_setCountryCode(entry.code);
        } else {
          const pflag = settingsPhone.parentElement.querySelector('.pflag');
          const pdial = settingsPhone.parentElement.querySelector('.pdial');
          if (pflag) pflag.textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
          if (pdial) pdial.textContent = `+${entry.dial}`;
        }
      }

      // 2. Update cart customer phone prefix picker if it exists
      const cartPhone = document.querySelector('#cust-input-phone');
      if (cartPhone && cartPhone.dataset.phonePrefixBuilt) {
        if (typeof cartPhone.RS_setCountryCode === 'function') {
          cartPhone.RS_setCountryCode(entry.code);
        } else {
          const pflag = cartPhone.parentElement.querySelector('.pflag');
          const pdial = cartPhone.parentElement.querySelector('.pdial');
          if (pflag) pflag.textContent = window.RS_countryFlag ? window.RS_countryFlag(entry.code) : '';
          if (pdial) pdial.textContent = `+${entry.dial}`;
        }
      }
    };
    
    // Sync immediately on load if settings are already loaded
    try {
      RS.syncPhoneCombosToSettings();
    } catch(e){}

    document.addEventListener('rs:hydrated', window.startTopbarWhatsAppPolling);
    if (window.RS_DB && window.RS_DB.session) {
      window.startTopbarWhatsAppPolling();
    }
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
