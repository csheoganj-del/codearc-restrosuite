/* ============================================================
   RestroSuite — App shell: global search, notifications, Settings
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
        box.innerHTML = html || '<div class="sr-empty">No results for “'+q+'”</div>';
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
    const SET_NAV = [['profile','Outlet profile','fa-store'],['tax','Taxes & billing','fa-percent'],['printer','Printers & KOT','fa-print'],['gateway','WhatsApp gateway','fa-whatsapp'],['team','Team & roles','fa-user-shield'],['plan','Plan & billing','fa-crown'],['danger','Danger Zone','fa-triangle-exclamation']];
    const skey = s => 'set_'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    function field(label, val, ph){ return `<div><label class="fl">${label}</label><input class="form-input" data-skey="${skey(label)}" value="${val||''}" placeholder="${ph||''}"></div>`; }
    function sel(label, opts, cur){ return `<div><label class="fl">${label}</label><select class="form-input" data-skey="${skey(label)}">${opts.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`; }
    function toggle(t,d,on){ return `<div class="set-row"><div class="si"><div class="st">${t}</div><div class="sd">${d}</div></div><label class="toggle"><input type="checkbox" data-skey="${skey(t)}" ${on?'checked':''}><span></span></label></div>`; }
    const sessionMeta = (window.RS_API && RS_API.session && RS_API.session()) || {};
    const defaultOutletName = sessionMeta.tenant_name || sessionMeta.business_name || String(sessionMeta.tenant_slug || sessionStorage.getItem('tenant_slug') || 'Outlet').replace(/[-_]+/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
    const defaultOutletCode = sessionMeta.tenant_slug || sessionMeta.outlet_id || sessionStorage.getItem('tenant_slug') || '';
    const PANES = {
      profile:`<div class="set-section form-grid-2">${field('Restaurant name',defaultOutletName)}${field('Outlet code',defaultOutletCode)}</div>
        <div class="set-section">${field('Address','','Outlet address')}</div>
        <div class="set-section form-grid-2">${field('Phone','','Outlet phone')}${field('Email','','Outlet email')}</div>
        <div class="set-section form-grid-2">${field('GSTIN','','GSTIN if enabled')}${sel('Cuisine',['North Indian','South Indian','Multi-cuisine','Cafe'],'Multi-cuisine')}</div>
        <div class="set-section form-grid-2">${field('Country','India','Outlet country')}${sel('Currency',['INR (₹)','EUR (€)','USD ($)','GBP (£)','AED (AED)','SAR (SAR)','SGD ($)','AUD ($)','CAD ($)','NZD ($)','ZAR (R)'],'INR (₹)')}</div>`,
      tax:`<div class="set-section form-grid-2">${sel('Default GST slab',['5%','12%','18%'],'5%')}${field('Invoice prefix','INV-')}</div>
        ${toggle('Service charge','Add 5% service charge on dine-in',false)}
        ${toggle('Round-off totals','Round bill total to nearest rupee',true)}
        ${toggle('Show HSN codes','Print HSN/SAC codes on GST invoice',true)}
        ${toggle('Inclusive pricing','Menu prices include GST',false)}`,
      printer:`<div class="set-section form-grid-2">${field('Receipt printer','EPSON TM-T82 (USB)')}${sel('Paper size',['58 mm','80 mm'],'80 mm')}</div>
        ${toggle('Auto-print receipt','Print automatically after payment',true)}
        ${toggle('Auto-print KOT','Send KOT to kitchen printer on order',true)}
        <div class="set-section form-grid-2">${sel('KOT copies',['1','2','3'],'2')}${sel('Kitchen printer',['Tandoor station','Main kitchen','Beverages'],'Main kitchen')}</div>`,
      gateway:`<div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Configure your WhatsApp gateway for this outlet</div></div><span class="pill pill-green" style="padding:5px 12px"><span class="dot dot-live"></span> Ready</span></div>
        ${toggle('Auto-send receipts','WhatsApp the bill to customer after payment',true)}
        ${toggle('Order updates','Notify customer when order is ready',true)}
        ${toggle('Marketing broadcasts','Allow promotional campaigns',true)}
        <div class="set-section"><label class="fl">Receipt message template</label><textarea class="form-input" rows="3">Thanks for dining with us. Your bill is attached.</textarea></div>`,
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
      danger:`<div class="panel-head" style="margin-bottom:14px"><h3>Danger Zone</h3></div>
        <div style="border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.03);border-radius:var(--r-md);padding:20px;margin-bottom:18px">
          <h4 style="color:#ef4444;margin-bottom:8px;font-family:var(--font-display);font-weight:800;font-size:14px;"><i class="fa-solid fa-triangle-exclamation"></i> Reset Operational Data</h4>
          <p style="font-size:12.5px;color:var(--text-soft);margin-bottom:16px;line-height:1.5">This will permanently delete all operational data for this outlet including all bills, transactions, customer profiles, custom menu items, staff, and inventory records. Account credentials and settings will be preserved.</p>
          <button class="btn" id="btn-client-reset-data" style="background:#EF4444;color:#fff;border:none;padding:10px 16px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s ease;"><i class="fa-solid fa-trash-can"></i> Reset Outlet Data</button>
        </div>`
    };
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
      function applyStore(){ $$('[data-skey]', body).forEach(el=>{ const k=el.dataset.skey; if(!(k in SET_STORE))return; if(el.type==='checkbox') el.checked=!!SET_STORE[k]; else el.value=SET_STORE[k]; }); }
      function collect(){ $$('[data-skey]', body).forEach(el=>{ SET_STORE[el.dataset.skey] = el.type==='checkbox'?el.checked:el.value; }); }
      function show(key){ if(body.querySelector('[data-skey]')) collect(); body.innerHTML = `<div class="set-pane active">${PANES[key]}</div>`; applyStore(); $$('.set-nav button',sec).forEach(b=>b.classList.toggle('active', b.dataset.s===key));
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
      $('#set-save').onclick=()=>{ collect(); (RS.saveSettings?RS.saveSettings(SET_STORE):Promise.resolve()).then(()=>{ RS.toast('Settings saved'+(RS.dbMode&&RS.dbMode()==='cloud'?' to cloud':''),'fa-circle-check'); if(window.RS && RS.updateStaticCurrencyLabels) RS.updateStaticCurrencyLabels(); try{ if (window.renderPOS) renderPOS(); } catch(e){} }); };
      $('#set-cancel').onclick=()=>show('profile');
      Promise.resolve(RS.getSettings?RS.getSettings():null).then(saved=>{ if(saved) SET_STORE=saved; show('profile'); });
    }
    RS.titles['settings-tab']=['Settings','Outlet, taxes, printer & gateway configuration'];
    RS.addRenderer('settings-tab', renderSettings);
    const openSet = $('#open-settings'); if(openSet) openSet.addEventListener('click', ()=>RS.activateTab('settings-tab'));

    /* ===================== DB MODE BADGE + SESSION ===================== */
    (function(){
      const pill = document.getElementById('db-mode-pill');
      const cloud = window.RS_DB && window.RS_DB.isCloud;
      if(pill){ pill.innerHTML = `<span class="dot dot-live"></span> ${cloud?'Cloud':'Local'}`; pill.title = cloud?'Connected to Supabase — data syncs to the cloud':'Local mode — data persists in this browser. Add Supabase keys to sync.'; }
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
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
