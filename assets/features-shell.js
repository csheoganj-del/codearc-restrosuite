/* ============================================================
   RestroSuite — App shell: global search, notifications, Settings
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

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
      const NOTIFS = [
        {ic:'fa-bowl-rice',bg:'var(--orange-tint)',c:'var(--orange)',t:'New Zomato order #Z8842',d:'Butter Chicken, Naan · ₹512',time:'just now',unread:true},
        {ic:'fa-triangle-exclamation',bg:'var(--red-tint)',c:'var(--red)',t:'Butter is low on stock',d:'2 kg left · below minimum',time:'8 min ago',unread:true},
        {ic:'fa-calendar-check',bg:'var(--violet-tint)',c:'var(--violet-soft)',t:'Reservation at 8:30 PM',d:'Corporate dinner · 8 pax · T-08',time:'22 min ago',unread:true},
        {ic:'fa-rotate-left',bg:'var(--amber-tint)',c:'var(--amber)',t:'Refund requested · INV-2037',d:'₹260 · awaiting your approval',time:'1 hr ago',unread:false},
        {ic:'fa-star',bg:'var(--green-tint)',c:'var(--green)',t:'New 5★ review from Aarav M.',d:'“Fastest service in town!”',time:'2 hr ago',unread:false}
      ];
      const panel = document.createElement('div'); panel.className='notif-panel';
      function draw(){
        const unread = NOTIFS.filter(n=>n.unread).length;
        panel.innerHTML = `<div class="notif-h"><h4>Notifications ${unread?`<span class="pill pill-orange" style="padding:2px 8px;font-size:11px">${unread} new</span>`:''}</h4><button class="btn btn-ghost btn-sm" id="notif-read">Mark all read</button></div>
          <div class="notif-list">${NOTIFS.map((n,i)=>`<div class="notif-item ${n.unread?'unread':''}" data-i="${i}"><div class="notif-ic" style="background:${n.bg};color:${n.c}"><i class="fa-solid ${n.ic}"></i></div><div style="flex:1"><div class="nt">${n.t}</div><div class="nd">${n.d}</div><div class="ntime">${n.time}</div></div></div>`).join('')}</div>`;
        panel.querySelector('#notif-read').onclick = ()=>{ NOTIFS.forEach(n=>n.unread=false); draw(); updateDot(); };
        $$('.notif-item',panel).forEach(el=> el.onclick=()=>{ NOTIFS[+el.dataset.i].unread=false; draw(); updateDot(); });
      }
      function updateDot(){ const d=bell.querySelector('.dot-notif'); if(d) d.style.display = NOTIFS.some(n=>n.unread)?'':'none'; }
      document.body.appendChild(panel); draw(); updateDot();
      bell.addEventListener('click', e=>{ e.stopPropagation(); panel.classList.toggle('show'); });
      document.addEventListener('click', e=>{ if(!panel.contains(e.target) && !bell.contains(e.target)) panel.classList.remove('show'); });
    }

    /* ===================== SETTINGS ===================== */
    const SET_NAV = [['profile','Outlet profile','fa-store'],['tax','Taxes & billing','fa-percent'],['printer','Printers & KOT','fa-print'],['gateway','WhatsApp gateway','fa-whatsapp'],['team','Team & roles','fa-user-shield'],['plan','Plan & billing','fa-crown']];
    const skey = s => 'set_'+s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    function field(label, val, ph){ return `<div><label class="fl">${label}</label><input class="form-input" data-skey="${skey(label)}" value="${val||''}" placeholder="${ph||''}"></div>`; }
    function sel(label, opts, cur){ return `<div><label class="fl">${label}</label><select class="form-input" data-skey="${skey(label)}">${opts.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join('')}</select></div>`; }
    function toggle(t,d,on){ return `<div class="set-row"><div class="si"><div class="st">${t}</div><div class="sd">${d}</div></div><label class="toggle"><input type="checkbox" data-skey="${skey(t)}" ${on?'checked':''}><span></span></label></div>`; }
    const PANES = {
      profile:`<div class="set-section form-grid-2">${field('Restaurant name','Royal Dhaba')}${field('Outlet code','royal-dhaba')}</div>
        <div class="set-section">${field('Address','142 MG Road, Bengaluru, KA 560001')}</div>
        <div class="set-section form-grid-2">${field('Phone','+91 99837 21179')}${field('Email','hello@royaldhaba.in')}</div>
        <div class="set-section form-grid-2">${field('GSTIN','27AABCR1234M1Z5')}${sel('Cuisine',['North Indian','South Indian','Multi-cuisine','Cafe'],'North Indian')}</div>`,
      tax:`<div class="set-section form-grid-2">${sel('Default GST slab',['5%','12%','18%'],'5%')}${field('Invoice prefix','INV-')}</div>
        ${toggle('Service charge','Add 5% service charge on dine-in',false)}
        ${toggle('Round-off totals','Round bill total to nearest rupee',true)}
        ${toggle('Show HSN codes','Print HSN/SAC codes on GST invoice',true)}
        ${toggle('Inclusive pricing','Menu prices include GST',false)}`,
      printer:`<div class="set-section form-grid-2">${field('Receipt printer','EPSON TM-T82 (USB)')}${sel('Paper size',['58 mm','80 mm'],'80 mm')}</div>
        ${toggle('Auto-print receipt','Print automatically after payment',true)}
        ${toggle('Auto-print KOT','Send KOT to kitchen printer on order',true)}
        <div class="set-section form-grid-2">${sel('KOT copies',['1','2','3'],'2')}${sel('Kitchen printer',['Tandoor station','Main kitchen','Beverages'],'Main kitchen')}</div>`,
      gateway:`<div class="set-row"><div class="si"><div class="st">Gateway status</div><div class="sd">Connected as +91 99837 21179 · uptime 14d</div></div><span class="pill pill-green" style="padding:5px 12px"><span class="dot dot-live"></span> Online</span></div>
        ${toggle('Auto-send receipts','WhatsApp the bill to customer after payment',true)}
        ${toggle('Order updates','Notify customer when order is ready',true)}
        ${toggle('Marketing broadcasts','Allow promotional campaigns',true)}
        <div class="set-section"><label class="fl">Receipt message template</label><textarea class="form-input" rows="3">Thanks for dining at Royal Dhaba! Your bill is attached. Visit again for 10% off — code REPEAT10.</textarea></div>`,
      team:`<div class="set-row"><div class="si"><div class="st">Team members</div><div class="sd">6 active · 4 roles configured</div></div><button class="btn btn-ghost btn-sm" id="set-team-go">Manage team</button></div>
        ${toggle('Require PIN for refunds','Manager PIN needed to issue refunds',true)}
        ${toggle('Cashier can edit prices','Allow price overrides at POS',false)}
        ${toggle('Lock reports for staff','Only admins can view sales reports',true)}`,
      plan:`<div class="panel-head" style="margin-bottom:14px"><h3>Current plan</h3></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">
          <div style="flex:1;min-width:200px;border:1.5px solid var(--orange);border-radius:var(--r-md);padding:18px;background:var(--orange-tint)"><div style="font-family:var(--font-display);font-weight:800;font-size:13px;color:var(--orange);text-transform:uppercase;letter-spacing:.06em">Growth plan</div><div style="font-family:var(--font-display);font-weight:800;font-size:30px;margin:6px 0">₹749<span style="font-size:14px;color:var(--text-mute)">/mo</span></div><div style="font-size:12.5px;color:var(--text-soft)">Renews 1 Jul 2026</div></div>
          <div class="crm-stats" style="flex:2;min-width:240px"><div class="cs"><div class="csv">1 / 5</div><div class="csl">Devices</div></div><div class="cs"><div class="csv">1</div><div class="csl">Outlet</div></div><div class="cs"><div class="csv">∞</div><div class="csl">Bills/mo</div></div></div>
        </div>
        <button class="btn btn-primary"><i class="fa-solid fa-arrow-up"></i> Upgrade to Chain (₹1,999/mo)</button>`
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
        const tg=$('#set-team-go'); if(tg) tg.onclick=()=>RS.activateTab('employees-tab'); }
      $$('.set-nav button',sec).forEach(b=> b.onclick=()=>show(b.dataset.s));
      $('#set-save').onclick=()=>{ collect(); (RS.saveSettings?RS.saveSettings(SET_STORE):Promise.resolve()).then(()=>RS.toast('Settings saved'+(RS.dbMode&&RS.dbMode()==='cloud'?' to cloud':''),'fa-circle-check')); };
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
      if(window.RS_DB && RS_DB.session){ Promise.resolve(RS_DB.session()).then(s=>{ if(!s)return; const meta=(s.user&&(s.user.user_metadata||s.user.meta))||s||{}; const un=document.querySelector('.user-pill .un'), ur=document.querySelector('.user-pill .ur'); const name=meta.display_name||meta.name||meta.username; const outlet=s.tenant_name||meta.outlet; const role=s.role||meta.role||'Owner'; if(name && un) un.textContent=name.charAt(0).toUpperCase() + name.slice(1); if(ur) { if(role==='superadmin') { ur.textContent='SaaS Super-Admin'; } else { ur.textContent=outlet+' · '+(role.charAt(0).toUpperCase()+role.slice(1)); } } }); }
      // route sign-out through the data layer
      const logout = document.querySelector('.sb-foot-btn.logout');
      if(logout){ logout.removeAttribute('onclick'); logout.addEventListener('click', async ()=>{ try{ if(window.RS_DB) await RS_DB.signOut(); }catch(e){} location.href='login.html'; }); }
    })();

    /* ===================== MOBILE "MORE" SHEET ===================== */
    const moreBtn = $('#mnav-more');
    if(moreBtn){
      const MORE = [['floor-tab','Floor & Tables','chair'],['aggregator-tab','Online Orders','bowl-rice'],['tokens-tab','Token Display','bullhorn'],['inventory-tab','Inventory','boxes-stacked'],['editor-tab','Menu Editor','pen-to-square'],['customers-tab','Customers','address-book'],['tax-tab','Tax & GST','file-invoice'],['employees-tab','Employees','users'],['analytics-tab','Advanced Analytics','chart-mixed'],['growth-hub-tab','Growth Hub','rocket'],['settings-tab','Settings','gear']];
      moreBtn.addEventListener('click', ()=>{
        RSModal.open({ title:'All sections', icon:'fa-grip', size:'sm',
          body:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${MORE.map(m=>`<button class="hub-card" data-go="${m[0]}" style="text-align:left;cursor:pointer;border:1px solid var(--stroke);background:var(--panel)"><div class="hub-ic bg-o" style="width:38px;height:38px;font-size:15px"><i class="fa-solid fa-${m[2]}"></i></div><h4 style="font-size:14px;margin-top:10px">${m[1]}</h4></button>`).join('')}</div>`,
          onMount(modal, close){ $$('[data-go]',modal).forEach(b=> b.onclick=()=>{ RS.activateTab(b.dataset.go); close(); }); }});
      });
    }
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
