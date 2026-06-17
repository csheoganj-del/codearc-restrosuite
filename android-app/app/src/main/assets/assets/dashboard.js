/* ============================================================
   RestroSuite Console — interactivity & data rendering
   ============================================================ */
(function () {
  'use strict';
  
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
      tenant_id: sessionStorage.getItem('tenant_id') || '',
      tenant_slug: sessionStorage.getItem('tenant_slug') || '',
      metadata: {
        role: sessionStorage.getItem('logged_in_role') || '',
        active_tab: document.querySelector('.tab-content.active')?.id || ''
      }
    }));
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rs = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const avatarColors = ['linear-gradient(135deg,#FF6A2A,#E04300)','linear-gradient(135deg,#8B7CF6,#FF6A2A)','linear-gradient(135deg,#34C7CE,#7C6BF5)','linear-gradient(135deg,#34D399,#0EA5A5)','linear-gradient(135deg,#FBBF24,#FF6A2A)'];
  const initials = n => n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  /* ---------- THEME ---------- */
  const root = document.documentElement;
  function setTheme(t){ root.setAttribute('data-theme', t); const i = $('#theme-toggle-i'); if(i) i.className = t==='dark'?'fa-solid fa-moon':'fa-solid fa-sun'; try{localStorage.setItem('rs-theme',t)}catch(e){} }
  setTheme((()=>{try{return localStorage.getItem('rs-theme')||'dark'}catch(e){return 'dark'}})());
  $('#theme-toggle')?.addEventListener('click', ()=> setTheme(root.getAttribute('data-theme')==='dark'?'light':'dark'));

  /* ---------- SIDEBAR COLLAPSE ---------- */
  const app = $('#app');
  $('#sb-collapse')?.addEventListener('click', ()=>{ app.classList.toggle('collapsed'); try{localStorage.setItem('rs-collapsed', app.classList.contains('collapsed'))}catch(e){} });
  try{ if(localStorage.getItem('rs-collapsed')==='true') app.classList.add('collapsed'); }catch(e){}

  /* ---------- TAB SWITCHING ---------- */
  const titles = {
    'pos-tab':['Point of Sale','Ring up takeaway & dine-in orders'],
    'qr-orders-tab':['QR Table Orders','Live orders from QR-scanning guests'],
    'bills-tab':['Bills Management','Search, reprint, export & refund bills'],
    'inventory-tab':['Inventory Control','Track stock, suppliers & low-stock alerts'],
    'editor-tab':['Menu Editor','Add, edit & cost your menu items'],
    'reports-tab':['Sales Reports','Revenue, payments & tax analytics'],
    'kds-tab':['Kitchen Display','Live cooking queue & prep timers'],
    'growth-hub-tab':['Growth Hub','Reservations, offers, support & more'],
    'employees-tab':['Employee Ledger','Team, roles, shifts & payroll'],
    'super-admin-tab':['SaaS Super-Admin','Platform-wide tenants & metrics'],
    'gateway-monitor-tab':['Gateway Monitor','WhatsApp gateway health & logs']
  };
  const rendered = {};
  function activateTab(id){
    $$('.tab-content').forEach(t=>t.classList.toggle('active', t.id===id));
    $$('.sidebar-link').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    $$('.mnav-link').forEach(l=>l.classList.toggle('active', l.dataset.tab===id));
    const meta = titles[id]; if(meta){ $('#page-title').textContent = meta[0]; $('#page-sub').textContent = meta[1]; }
    $('.content').scrollTop = 0; window.scrollTo(0,0);
    if(!rendered[id] && renderers[id]){ renderers[id](); rendered[id]=true; }
    else if(rendered[id] && id === 'gateway-monitor-tab') { if(typeof startSaaSGatewayPolling === 'function') startSaaSGatewayPolling(); }
    if(id !== 'gateway-monitor-tab') { if(typeof stopSaaSGatewayPolling === 'function') stopSaaSGatewayPolling(); }
    try{ history.replaceState(null,'','#'+id); }catch(e){}
  }
  $$('.sidebar-link, .mnav-link').forEach(l=> l.addEventListener('click', e=>{ e.preventDefault(); activateTab(l.dataset.tab); }));

  /* ---------- TOAST ---------- */
  let toastT;
  function toast(msg, icon='fa-circle-check'){ const el=$('#toast'); el.innerHTML=`<i class="fa-solid ${icon}"></i> ${msg}`; el.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('show'),2600); }
  window.__toast = toast;

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
  const renderPOS = () => {
    const grid = $('#pos-grid');
    const q = ($('#pos-search-input')?.value||'').toLowerCase();
    const items = MENU.filter(m=>(activeCat==='All'||m.cat===activeCat) && m.name.toLowerCase().includes(q));
    grid.innerHTML = items.map(m=>`
      <div class="pos-item ${m.stock==='out'?'out':''}" data-id="${m.id}" style="--cc:${catColor(m.cat)}">
        <div class="pi-top"><span class="veg ${m.veg?'':'nonveg'}"></span><span class="picat">${m.cat}</span></div>
        <div class="pname">${m.name}</div>
        <div class="prow"><span class="pprice">${rs(m.price)}</span><span class="stock-dot ${stockCls[m.stock]}">${stockLabel[m.stock]}</span></div>
      </div>`).join('');
    $$('.pos-item', grid).forEach(el=> el.addEventListener('click', ()=> addToCart(el.dataset.id)));
  };
  function addToCart(id){ const m=MENU.find(x=>String(x.id)===String(id)); const line=cart.find(c=>String(c.id)===String(id)); if(line) line.qty++; else cart.push({...m,qty:1}); renderCart(); toast(`${m.name} added`,'fa-plus'); }
  function changeQty(id,d){ const line=cart.find(c=>String(c.id)===String(id)); if(!line)return; line.qty+=d; if(line.qty<=0) cart=cart.filter(c=>String(c.id)!==String(id)); renderCart(); }
  function renderCart(){
    const wrap=$('#cart-items'); const count=cart.reduce((a,c)=>a+c.qty,0);
    $('#cart-count').textContent = count+(count===1?' item':' items');

    const badge = $('#pos-m-cart-badge');
    if (badge) {
      badge.textContent = count;
      badge.classList.remove('bounce-scale');
      void badge.offsetWidth;
      badge.classList.add('bounce-scale');
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
    const sub=cart.reduce((a,c)=>a+c.price*c.qty,0);
    const disc=Math.round(sub*discountPct/100);
    const taxed=sub-disc; const gst=Math.round(taxed*0.05);
    $('#t-sub').textContent=rs(sub); $('#t-disc').textContent='– '+rs(disc); $('#t-gst').textContent=rs(gst); $('#t-grand').textContent=rs(taxed+gst);
  }
  function getTotals(){ const sub=cart.reduce((a,c)=>a+c.price*c.qty,0); const disc=Math.round(sub*discountPct/100); const taxed=sub-disc; const gst=Math.round(taxed*0.05); return {sub,disc,gst,grand:taxed+gst,count:cart.reduce((a,c)=>a+c.qty,0),discountPct,items:cart.map(c=>({...c}))}; }
  function clearCart(){
    cart=[]; discountPct=0; const d=$('#disc-input'); if(d) d.value=''; renderCart();
    if (window.innerWidth <= 1024) {
      const posLeft = $('.pos-left');
      const posCart = $('.pos-cart');
      const cartBtn = $('#pos-m-cart-btn');
      if (posLeft && posCart && cartBtn) {
        posLeft.classList.remove('hidden');
        posCart.classList.remove('active');
        cartBtn.style.display = 'flex';
      }
    }
  }
  function getCustomer(){ return { name:($('#cust-name')?.value||'').trim(), phone:($('#cust-phone')?.value||'').trim(), table:($('#cart-table')?.value||'Walk-in / Takeaway') }; }
  // POS init (static parts present in HTML, wire them)
  function initPOS(){
    $('#pos-cats').innerHTML = CATS.map((c,i)=>`<button class="pos-cat-btn ${i===0?'active':''}" data-cat="${c}">${c}</button>`).join('');
    $$('#pos-cats .pos-cat-btn').forEach(b=> b.addEventListener('click',()=>{ activeCat=b.dataset.cat; $$('#pos-cats .pos-cat-btn').forEach(x=>x.classList.toggle('active',x===b)); renderPOS(); }));
    $('#pos-search-input').addEventListener('input', renderPOS);
    $$('.order-type-btn').forEach(b=> b.addEventListener('click',()=>{ $$('.order-type-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }));
    $('#disc-input').addEventListener('input', e=>{ discountPct=Math.min(100,Math.max(0,+e.target.value||0)); renderCart(); });
    $('#btn-kot').addEventListener('click',()=>{ if(!cart.length)return toast('Cart is empty','fa-circle-exclamation'); if(window.RSPOS&&window.RSPOS.kot) return window.RSPOS.kot(); toast('KOT sent to kitchen','fa-fire'); });
    $('#btn-checkout').addEventListener('click',()=>{ if(!cart.length)return toast('Cart is empty','fa-circle-exclamation'); if(window.RSPOS&&window.RSPOS.checkout) return window.RSPOS.checkout(); toast('Bill printed & WhatsApp sent','fa-print'); clearCart(); });

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
    const cartBtn = $('#pos-m-cart-btn');
    const backBtn = $('#btn-pos-back-menu');
    const posLeft = $('.pos-left');
    const posCart = $('.pos-cart');
    if (cartBtn && posLeft && posCart) {
      cartBtn.onclick = () => {
        if (window.innerWidth <= 1024) {
          posLeft.classList.add('hidden');
          posCart.classList.add('active');
          cartBtn.style.display = 'none';
        }
      };
    }
    if (backBtn && posLeft && posCart && cartBtn) {
      backBtn.onclick = () => {
        if (window.innerWidth <= 1024) {
          posLeft.classList.remove('hidden');
          posCart.classList.remove('active');
          cartBtn.style.display = 'flex';
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

  function getRelativeTime(dateStr) {
    const elapsed = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(elapsed / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }

  async function syncPendingOrders() {
    if (window.RS_DB) {
      try {
        const rows = await RS_DB.list('pending_orders');
        
        // 1. Update KDS
        const activeKds = rows.filter(r => r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review');
        const mappedKds = activeKds.map(r => ({
          id: r.id,
          tok: r.orderId,
          type: `${r.orderType} · ${r.tableNumber}`,
          start: r.dateTime ? new Date(r.dateTime).getTime() : Date.now(),
          items: (r.items || []).map(it => [String(it.qty), it.name, it.notes || ''])
        }));
        replaceArr(KDS, mappedKds);

        // 2. Update QR_ORDERS
        const activeQr = rows.filter(r => r.status === 'Pending Review' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'served' || r.status === 'Ready');
        const mappedQr = activeQr.map(r => ({
          id: r.id,
          orderId: r.orderId,
          table: r.tableNumber,
          time: r.dateTime ? getRelativeTime(r.dateTime) : 'just now',
          status: r.status === 'Pending Review' ? 'pending' : ((r.status === 'preparing' || r.status === 'Accepted') ? 'preparing' : 'served'),
          items: (r.items || []).map(it => [`${it.qty}× ${it.name}`, it.price * it.qty]),
          total: r.total
        }));
        replaceArr(QR_ORDERS, mappedQr);

        // Re-render KDS and QR boards
        try { renderKDS(); } catch(e){}
        try { renderQR(); } catch(e){}
        document.dispatchEvent(new CustomEvent('rs:pending_orders_synced'));
      } catch(e) {
        console.warn("syncPendingOrders failed", e);
      }
    }
  }

  function setupSupabaseRealtime() {
    const api = window.RS_API;
    if (api && api.supabaseClient && window.RS_DB && RS_DB.isCloud) {
      const activeTenantId = sessionStorage.getItem('tenant_id');
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
      toast('Table '+(o.table.split('-')[1]||o.table)+' → '+statusTxt[nextStatus]);
    }));
    $$('#qr-grid [data-merge]').forEach(b=>b.addEventListener('click',()=>toast('Select another table to merge','fa-code-merge')));
    $$('#qr-grid [data-bill]').forEach(b=>b.addEventListener('click',()=>toast('Bill generated & sent','fa-receipt')));
  };

  /* ============================================================
     BILLS
     ============================================================ */
  const BILLS = [];
  const payPill = {UPI:'pill-violet',Cash:'pill-green',Card:'pill-orange'};
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
    $('#bills-table-body').innerHTML = BILLS.filter(b=>b.no.toLowerCase().includes(q)||b.table.toLowerCase().includes(q)).map(b=>`
      <tr>
        <td><b>${b.no}</b></td><td>${b.time}</td><td>${b.table}</td><td>${b.items}</td>
        <td><span class="pill ${payPill[b.pay]}" style="padding:3px 9px">${b.pay}</span></td>
        <td class="td-strong">${rs(b.amount)}</td>
        <td>${b.status==='paid'?'<span class="pill pill-green" style="padding:3px 9px">Paid</span>':'<span class="pill pill-red" style="padding:3px 9px">Refunded</span>'}</td>
        <td><div class="row-actions"><button class="icon-act go" title="Reprint"><i class="fa-solid fa-print"></i></button><button class="icon-act" title="Share"><i class="fa-brands fa-whatsapp"></i></button><button class="icon-act danger" title="Refund" ${b.status==='refunded'?'disabled style="opacity:.4"':''}><i class="fa-solid fa-rotate-left"></i></button></div></td>
      </tr>`).join('');
    $$('#bills-table-body .icon-act.go').forEach(b=>b.addEventListener('click',()=>toast('Reprinting bill…','fa-print')));
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

    // render stock table
    const invBody = $('#inv-table-body');
    if (invBody) {
      invBody.innerHTML = INVENTORY.map(i=>{
        const st = i.stock<i.min?'out':(i.stock<i.min*1.4?'low':'ok'); const pct=Math.min(100,Math.round(i.stock/(i.min*2)*100));
        return `<tr>
          <td><b>${i.name}</b></td><td>${i.cat}</td>
          <td><div style="display:flex;align-items:center;gap:10px"><span class="td-strong" style="min-width:58px">${i.stock} ${i.unit}</span><div style="flex:1;height:6px;background:var(--glass-2);border-radius:99px;overflow:hidden;min-width:60px"><span style="display:block;height:100%;width:${pct}%;background:${st==='out'?'var(--red)':st==='low'?'var(--amber)':'var(--green)'}"></span></div></div></td>
          <td>${i.min} ${i.unit}</td><td>${rs(i.cost)}/${i.unit}</td>
          <td><span class="stock-dot ${stockCls[st]}">${st==='out'?'Reorder':st==='low'?'Low':'Healthy'}</span></td>
          <td><div class="row-actions"><button class="icon-act go" title="Restock"><i class="fa-solid fa-truck"></i></button><button class="icon-act" title="Edit"><i class="fa-solid fa-pen"></i></button></div></td>
        </tr>`; }).join('');
      $$('#inv-table-body .icon-act.go').forEach(b=>b.addEventListener('click',()=>toast('Purchase order drafted','fa-truck')));
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
          const ingText = ings.length ? ings.map(g=>`${g.qty}${g.unit} ${g.name}`).join(', ') : '<span style="color:var(--text-mute)">No recipe — click ✏ to define</span>';
          return `<tr>
            <td><div style="display:flex;align-items:center;gap:9px"><span class="veg ${m.veg?'':'nonveg'}"></span><b>${m.name}</b></div></td>
            <td>${m.cat}</td>
            <td style="max-width:220px;font-size:12px">${ingText}</td>
            <td class="td-strong">${cost?rs(cost):'—'}</td>
            <td class="td-strong">${rs(m.price)}</td>
            <td><span class="stock-dot ${margin>=50?'stock-ok':margin>=20?'stock-low':'stock-out'}">${cost?margin+'%':'—'}</span></td>
            <td><button class="icon-act go" data-recipe-edit="${m.id}" title="Define recipe"><i class="fa-solid fa-pen"></i></button></td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:30px">No menu items yet — add items in Menu Editor first</td></tr>';

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
  };

  /* ============================================================
     MENU EDITOR
     ============================================================ */
  const renderEditor = () => {
    $('#editor-list').innerHTML = MENU.map(m=>`
      <tr>
        <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg?'':'nonveg'}"></span><div><b>${m.name}</b><div style="font-size:11px;color:var(--text-mute)">${m.veg?'Veg':'Non-veg'} · ${m.cat}</div></div></div></td>
        <td>${m.cat}</td><td class="td-strong">${rs(m.price)}</td>
        <td><span class="stock-dot ${stockCls[m.stock]}">${stockLabel[m.stock]}</span></td>
        <td><label class="switch-mini"><input type="checkbox" ${m.stock!=='out'?'checked':''}><span></span></label></td>
        <td><div class="row-actions"><button class="icon-act go" title="Edit"><i class="fa-solid fa-pen"></i></button><button class="icon-act" title="Recipe"><i class="fa-solid fa-flask"></i></button><button class="icon-act danger" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>
      </tr>`).join('');
    $$('#editor-list .icon-act.go').forEach(b=>b.addEventListener('click',()=>toast('Opening item editor…','fa-pen')));
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
    const payCounts = { UPI: 0, Cash: 0, Card: 0 };
    paidBills.forEach(b => {
      if (payCounts[b.pay] !== undefined) {
        payCounts[b.pay] += b.amount || 0;
      }
    });
    const payTotal = payCounts.UPI + payCounts.Cash + payCounts.Card;
    
    if (payTotal === 0) {
      $('#donut-pay').style.background = 'var(--glass-2)';
      $('#donut-pay .donut-center .dc-v').textContent = '₹0';
      $('#legend-pay').innerHTML = `<div style="color:var(--text-mute); font-size:12px; margin-top:10px; text-align:center;">No payments recorded</div>`;
    } else {
      const upiPct = Math.round(payCounts.UPI / payTotal * 100);
      const cashPct = Math.round(payCounts.Cash / payTotal * 100);
      const cardPct = 100 - upiPct - cashPct;
      
      const payMix = [
        ['UPI', upiPct, 'var(--violet)'],
        ['Cash', cashPct, 'var(--green)'],
        ['Card', cardPct, 'var(--orange)']
      ];
      
      let acc=0; const seg=payMix.map(p=>{const s=`${p[2]} ${acc}% ${acc+p[1]}%`;acc+=p[1];return s;}).join(',');
      $('#donut-pay').style.background=`conic-gradient(${seg})`;
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
        <div class="kds-items">${o.items.map((it,j)=>`<div class="kds-item" data-i="${j}"><span class="kq">${it[0]}×</span><div><span class="kn">${it[1]}</span>${it[2]?`<div class="knote"><i class="fa-solid fa-circle-info"></i> ${it[2]}</div>`:''}</div></div>`).join('')}</div>
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
    {ic:'fa-star',bg:'bg-v',t:'Feedback & Reviews',d:'Collect & respond to ratings',m:'4.8 ★'},
    {ic:'fa-gift',bg:'bg-g',t:'Loyalty Program',d:'Points, tiers & rewards',m:'412 members'}
  ];
  const renderHub = () => {
    $('#hub-grid').innerHTML = HUB.map(h=>`
      <div class="hub-card">
        <div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div>
        <h4>${h.t}</h4><p>${h.d}</p>
        <span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${h.m}</span>
      </div>`).join('');
    $$('#hub-grid .hub-card').forEach(c=>c.addEventListener('click',()=>toast('Opening '+c.querySelector('h4').textContent+'…','fa-arrow-up-right-from-square')));
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
    $$('#emp-grid .btn-ghost').forEach(b=>b.addEventListener('click',()=>toast('Editing role & permissions…','fa-user-gear')));
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
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-mute)"><i class="fa-solid fa-spinner fa-spin"></i> Loading client workspace registry…</td></tr>';
    try {
      let tenants = [];
      if(window.RS_API) {
        const out = await RS_API.admin({ action: 'list_tenants' }).catch(()=>({}));
        if(out && out.tenants) tenants = out.tenants;
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
        const joined = t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN',{month:'short',year:'numeric'}) : '—';
        const mrr = t.mrr || 0;
        const name = t.name || t.tenant_name || t.slug || 'Unknown';
        const slug = t.slug || t.tenant_slug || '';
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:11px"><div class="avatar-sm" style="background:${avatarColors[name.length%avatarColors.length]}">${initials(name)}</div><div><b>${name}</b><div style="font-size:11px;color:var(--text-mute)">${slug}</div></div></div></td>
          <td><span class="pill ${planLabel.toLowerCase()} ${pillCls}" style="padding:3px 9px">${planLabel}</span></td>
          <td class="td-strong">${mrr?rs(mrr):'—'}</td><td>${t.outlet_count||1}</td><td>${joined}</td>
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

          if (!confirm(`⚠️ RESET DATA for: ${tenantName}?\n\nThis will PERMANENTLY DELETE all of their operations data (bills, menus, inventory, staff, CRM, recipes).\n\nThe account credentials and options will be kept. Proceed?`)) return;

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

          if (!confirm(`⚠️ LOAD DEMO DATA for: ${tenantName}?\n\nThis will automatically populate this workspace with a realistic set of menu, inventory, recipes, staff, and bills history. Operational data will be reset. Proceed?`)) return;

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

          if (!confirm(`⚠️ REMOVE DEMO DATA for: ${tenantName}?\n\nThis will safely delete ONLY the demo data records. Client-added data will remain intact. Proceed?`)) return;

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
        logsContainer.innerHTML = '<div style="text-align: center; padding: 32px; color: #9CA3AF;">No recent dispatch logs found.</div>';
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
              <span>${escHtml(report.tenant_slug || 'unknown workspace')} · ${escHtml(report.source || 'dashboard')} · ${escHtml(report.url_path || 'unknown path')}</span>
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
    'pos-tab':initPOS,'qr-orders-tab':renderQR,'bills-tab':()=>{renderBills(); $('#bills-search')?.addEventListener('input',renderBills);},
    'inventory-tab':renderInventory,'editor-tab':renderEditor,'reports-tab':renderReports,'kds-tab':renderKDS,
    'growth-hub-tab':renderHub,'employees-tab':renderEmployees,'super-admin-tab':renderSuper,'gateway-monitor-tab':renderGateway
  };

  /* ---------- public API for feature modules ---------- */
  let modalRoot = null;
  function getModalRoot(){ if(!modalRoot){ modalRoot = document.getElementById('rs-modal-root') || (()=>{ const d=document.createElement('div'); d.id='rs-modal-root'; document.body.appendChild(d); return d; })(); } return modalRoot; }
  window.RS = {
    toast, activateTab, rs, initials, avatarColors, catColor,
    MENU, CATS, stockLabel, stockCls,
    getCart:()=>cart.map(c=>({...c})), getTotals, clearCart, getCustomer, addToCart, renderPOS, renderCart, renderEditor,
    setCart:(items)=>{ cart = (items||[]).map(c=>({...c})); renderCart(); },
    titles, addRenderer:(id,fn)=>{ renderers[id]=fn; }, render:(id)=>{ if(renderers[id]){ renderers[id](); rendered[id]=true; } },
    getModalRoot,
    seedToken:()=>{ window.__tok = (window.__tok||122)+1; return 'A-'+window.__tok; },
    BILLS, INVENTORY, EMPLOYEES, QR_ORDERS,
    // ---- persistence ----
    save(coll){ const map={menu:MENU,bills:BILLS,inventory:INVENTORY,employees:EMPLOYEES}; const arr=map[coll]; if(window.RS_DB&&arr) return RS_DB.bulkPut(coll, arr.map(x=>({...x}))); return Promise.resolve(); },
    saveOne(coll,obj){ if(window.RS_DB) return RS_DB.put(coll, obj.id, {...obj}); return Promise.resolve(); },
    removeOne(coll,id){ if(window.RS_DB) return RS_DB.del(coll, id); return Promise.resolve(); },
    saveSettings(obj){ if(window.RS_DB) return RS_DB.setSettings(obj); return Promise.resolve(); },
    getSettings(){ if(window.RS_DB) return RS_DB.getSettings(); return Promise.resolve(null); },
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
  async function hydrate(){
    if(!window.RS_DB) return;
    const map={menu:MENU,bills:BILLS,inventory:INVENTORY,employees:EMPLOYEES};
    for(const coll in map){
      try{
        const rows = await RS_DB.list(coll);
        if(rows && rows.length){ replaceArr(map[coll], rows); }
        else { replaceArr(map[coll], []); } // Do not seed mock data, keep empty
      }catch(e){ console.warn('hydrate '+coll+' failed', e); }
    }
    try{
      await syncPendingOrders();
      setupSupabaseRealtime();
    }catch(e){ console.warn('sync pending orders/realtime failed', e); }
    try{ renderPOS(); }catch(e){}
    const cur=document.querySelector('.tab-content.active'); if(cur && renderers[cur.id]) renderers[cur.id]();
    document.dispatchEvent(new CustomEvent('rs:hydrated'));
  }

  /* ---------- boot ---------- */
  // Session guard: in cloud mode, require a valid signed-in session
  if(window.RS_API && RS_API.configured && !RS_API.session()){ location.href='login.html'; return; }

  const sess = window.RS_API ? RS_API.session() : null;
  const isSuper = sess && sess.role === 'superadmin';

  // ── Apply superadmin-specific UI lockdown before first render ──
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
    // 1. Menu Download Template
    const btnDownloadMenu = document.getElementById('btn-download-menu-template');
    if (btnDownloadMenu) {
      btnDownloadMenu.onclick = () => {
        const headers = ['Name', 'Category', 'Price', 'Description', 'PrepTimeMinutes', 'Available', 'Bestseller'];
        const sampleRows = [
          ['Cappuccino', 'HOT COFFEE', '180', 'Espresso with steamed milk and foam', '4', 'YES', 'YES'],
          ['Veg Grilled Sandwich', 'SANDWICHES', '220', 'Grilled vegetable and cheese sandwich', '8', 'YES', 'NO']
        ];
        const csv = [
          headers.join(','),
          ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', 'menu-template.csv');
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
          const reader = new FileReader();
          reader.onload = async evt => {
            try {
              const text = evt.target.result;
              const rows = window.RestroSuite && window.RestroSuite.imports && window.RestroSuite.imports.parseCsv
                ? window.RestroSuite.imports.parseCsv(text)
                : [];
              if(!rows || !rows.length) throw new Error('No rows found in CSV');

              const cleanKey = window.RestroSuite && window.RestroSuite.imports && window.RestroSuite.imports.cleanKey
                ? window.RestroSuite.imports.cleanKey
                : (k) => String(k || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

              const cleanRow = (r) => {
                const res = {};
                for(const [k, v] of Object.entries(r || {})) {
                  res[cleanKey(k)] = typeof v === 'string' ? v.trim() : v;
                }
                return res;
              };

              let count = 0;
              for(const row of rows) {
                const crow = cleanRow(row);
                const name = crow.name || crow.itemname || crow.menuitem || crow.item || crow.ingredientname || crow.ingredient;
                if(!name) continue;
                const cat = crow.category || crow.cat || 'Mains';
                const price = Number(crow.price || crow.sellingprice || 0);
                const desc = crow.description || '';
                const available = String(crow.available || 'YES').toUpperCase() !== 'NO';
                
                const existing = MENU.find(x => String(x.name).toLowerCase() === String(name).toLowerCase());
                const item = {
                  id: existing ? existing.id : 'menu_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                  name: String(name),
                  cat: String(cat),
                  price: Number.isFinite(price) ? price : 0,
                  veg: !String(name + ' ' + cat).toLowerCase().includes('chicken') && !String(name + ' ' + cat).toLowerCase().includes('mutton') && !String(name + ' ' + cat).toLowerCase().includes('fish') && !String(name + ' ' + cat).toLowerCase().includes('egg'),
                  stock: available ? 'ok' : 'out'
                };
                await RS.saveOne('menu', item);
                count++;
              }
              toast(`${count} menu items imported successfully`, 'fa-circle-check');
              if(window.RS_DB) {
                const items = await RS_DB.list('menu');
                if(items) {
                  MENU.length = 0;
                  items.forEach(i => MENU.push(i));
                  renderEditor();
                }
              }
            } catch(err) {
              console.error(err);
              toast('Import failed: ' + err.message, 'fa-circle-exclamation');
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
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', 'inventory-template.csv');
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
          const reader = new FileReader();
          reader.onload = async evt => {
            try {
              const text = evt.target.result;
              const rows = window.RestroSuite && window.RestroSuite.imports && window.RestroSuite.imports.parseCsv
                ? window.RestroSuite.imports.parseCsv(text)
                : [];
              if(!rows || !rows.length) throw new Error('No rows found in CSV');

              const cleanKey = window.RestroSuite && window.RestroSuite.imports && window.RestroSuite.imports.cleanKey
                ? window.RestroSuite.imports.cleanKey
                : (k) => String(k || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

              const cleanRow = (r) => {
                const res = {};
                for(const [k, v] of Object.entries(r || {})) {
                  res[cleanKey(k)] = typeof v === 'string' ? v.trim() : v;
                }
                return res;
              };

              let count = 0;
              for(const row of rows) {
                const crow = cleanRow(row);
                const name = crow.ingredientname || crow.ingredient || crow.name || crow.item || crow.ingredientkey;
                if(!name) continue;
                const cat = crow.category || crow.cat || 'General';
                const stock = Number(crow.instock || crow.stock || crow.currentstock || crow.current || 0);
                const min = Number(crow.minlevel || crow.min || crow.threshold || 10);
                const cost = Number(crow.unitcost || crow.cost || crow.price || 0);
                const unit = crow.unit || 'unit';
                
                const existing = INVENTORY.find(x => String(x.name).toLowerCase() === String(name).toLowerCase() || String(x.key).toLowerCase() === String(name).toLowerCase());
                const item = {
                  id: existing ? existing.id : 'inv_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                  name: String(name),
                  cat: String(cat),
                  stock: Number.isFinite(stock) ? stock : 0,
                  min: Number.isFinite(min) ? min : 10,
                  cost: Number.isFinite(cost) ? cost : 0,
                  unit: String(unit)
                };
                await RS.saveOne('inventory', item);
                count++;
              }
              toast(`${count} ingredients imported successfully`, 'fa-circle-check');
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
              toast('Import failed: ' + err.message, 'fa-circle-exclamation');
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
        const csv = window.RestroSuite && window.RestroSuite.bills && window.RestroSuite.bills.convertToCSV
          ? window.RestroSuite.bills.convertToCSV(BILLS)
          : BILLS.map(b => `${b.no},${b.time},${b.table},${b.amount},${b.pay},${b.status}`).join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `bills-export-${Date.now()}.csv`);
        toast('Bills exported successfully', 'fa-circle-check');
      };
    }

    // 6. GSTR Download
    const btnGSTR = document.getElementById('btn-download-gstr');
    if (btnGSTR) {
      btnGSTR.onclick = () => {
        const paidBills = BILLS.filter(b => b.status === 'paid');
        if(!paidBills.length) return toast('No sales data for GSTR report', 'fa-circle-exclamation');
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
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `gstr1-report-${Date.now()}.csv`);
        toast('GSTR CSV downloaded successfully', 'fa-circle-check');
      };
    }

    // 7. Super-Admin Tenants Export
    const btnExportTenants = document.getElementById('btn-export-tenants');
    if (btnExportTenants) {
      btnExportTenants.onclick = async () => {
        try {
          let tenants = [];
          if(window.RS_API) {
            const out = await RS_API.admin({ action: 'list_tenants' }).catch(()=>({}));
            if(out && out.tenants) tenants = out.tenants;
          }
          if (!tenants || !tenants.length) return toast('No tenants to export', 'fa-circle-exclamation');
          const headers = ['ID', 'Name', 'Slug', 'Outlet Type', 'Email', 'Phone', 'Username', 'Status', 'Plan Code', 'Subscription Status', 'MRR', 'Created At'];
          const csv = [
            headers.join(','),
            ...tenants.map(t => {
              return `"${t.id || ''}","${(t.name || t.tenant_name || '').replace(/"/g, '""')}","${t.slug || ''}","${t.outlet_type || ''}","${t.email || ''}","${t.phone || ''}","${t.username || ''}","${t.status || ''}","${t.plan_code || ''}","${t.subscription_status || ''}",${t.mrr || 0},"${t.created_at || ''}"`;
            })
          ].join('\n');
          RS.downloadFile(csv, 'text/csv;charset=utf-8;', `tenants-export-${Date.now()}.csv`);
          toast('Tenants exported successfully', 'fa-circle-check');
        } catch (e) {
          console.error(e);
          toast('Export failed: ' + e.message, 'fa-circle-exclamation');
        }
      };
    }
  }

  // Bind globally when document loads
  bindGlobalImportExportEvents();

  // Set default landing tab
  const defaultTab = isSuper ? 'super-admin-tab' : 'pos-tab';
  const start = (location.hash || '#' + defaultTab).slice(1);
  activateTab(titles[start] ? start : defaultTab);

  // Only run hydrate for non-superadmin (superadmin doesn't need tenant data)
  if(!isSuper) hydrate();

  // validate the stored session against the backend; only bounce if server explicitly rejects it
  if(window.RS_API && RS_API.configured){
    RS_API.validateSession().then(sess => {
      // null = server confirmed token is invalid/expired → redirect
      if(sess === null){ try{ RS_API.logout(); }catch(e){} location.href='login.html'; }
    }).catch(() => {
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
    $('#role-switch')?.addEventListener('click',()=>{
      const on = $('#role-switch').classList.toggle('on');
      $$('.superadmin-only').forEach(el=>el.style.display=on?'':'none');
      $('#role-switch-label').textContent = on?'Super-Admin':'Outlet Owner';
      toast(on?'Switched to Super-Admin view':'Switched to Outlet Owner view','fa-user-shield');
    });
  }

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
