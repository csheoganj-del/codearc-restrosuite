/* ============================================================
   RestroSuite — Growth Hub screens + parity tabs
   (Online aggregator orders, Customers/CRM, Floor & tables)
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    /* ===================== FLOOR & TABLES ===================== */
    const TABLES = [
      {n:'01',cap:2,state:'free'},{n:'02',cap:4,state:'free'},
      {n:'03',cap:4,state:'free'},{n:'04',cap:2,state:'free'},
      {n:'05',cap:6,state:'free'},{n:'06',cap:4,state:'free'},
      {n:'07',cap:2,state:'free'},{n:'08',cap:8,state:'free'},
      {n:'09',cap:4,state:'free'},{n:'10',cap:2,state:'free'},
      {n:'11',cap:4,state:'free'},{n:'12',cap:6,state:'free'}
    ];
    const stateDot = {free:'var(--green)',occupied:'var(--orange)',billed:'var(--violet-soft)'};
    const stateTxt = {free:'Available',occupied:'Dining',billed:'Bill printed'};
    function parseLocalTimestamp(dateStr) {
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
    function getElapsedDesc(dateStr) {
      const ts = parseLocalTimestamp(dateStr);
      if (!ts) return 'just now';
      const elapsed = Date.now() - ts;
      const mins = Math.floor(elapsed / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }

    function renderFloor(){
      const sec = $('#floor-tab');
      if(!sec) return;
      if (window.RS_DB) {
        sec.innerHTML = '<div class="sr-empty">Loading tables...</div>';
        RS_DB.list('pending_orders').then(rows => {
          TABLES.forEach(t => {
            const activeOrder = rows.find(r => 
              (r.tableNumber === `Table ${t.n}` || r.tableNumber === t.n || r.tableNumber === `0${parseInt(t.n)}`) &&
              (r.status === 'DineIn Active' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review')
            );
            if (activeOrder) {
              t.state = 'occupied';
              t.amt = activeOrder.total || 0;
              t.since = activeOrder.dateTime ? getElapsedDesc(activeOrder.dateTime) : 'just now';
              t.orderId = activeOrder.orderId;
              t.dbId = activeOrder.id;
            } else {
              t.state = 'free';
              t.amt = 0;
              t.since = '';
              t.orderId = null;
              t.dbId = null;
            }
          });
          drawFloorUI(sec);
        }).catch(e => {
          console.warn("Failed loading floor tables from DB", e);
          drawFloorUI(sec);
        });
      } else {
        drawFloorUI(sec);
      }
    }

    function drawFloorUI(sec){
      const occ = TABLES.filter(t=>t.state!=='free').length;
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-chair"></i></div><div><div class="sv">${TABLES.length-occ}</div><div class="sl">Free tables</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-utensils"></i></div><div><div class="sv">${TABLES.filter(t=>t.state==='occupied').length}</div><div class="sl">Dining now</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-file-invoice"></i></div><div><div class="sv">${TABLES.filter(t=>t.state==='billed').length}</div><div class="sl">Awaiting payment</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(TABLES.reduce((a,t)=>a+(t.amt||0),0))}</div><div class="sl">Open table value</div></div></div>
        </div>
        <div class="toolbar-row"><div class="floor-legend">
          <span class="lg"><span class="sw" style="background:var(--green)"></span> Available</span>
          <span class="lg"><span class="sw" style="background:var(--orange)"></span> Dining</span>
          <span class="lg"><span class="sw" style="background:var(--violet-soft)"></span> Bill printed</span>
        </div><div class="grow"></div><span class="pill"><i class="fa-solid fa-location-dot"></i> Ground floor</span></div>
        <div class="floor-grid">${TABLES.map(t=>`
          <div class="table-card ${t.state}" data-n="${t.n}">
            <span class="tdot" style="background:${stateDot[t.state]}"></span>
            <div class="tnum2">Table ${t.n}</div><div class="tcap"><i class="fa-solid fa-user-group" style="font-size:10px"></i> ${t.cap} seats</div>
            <div class="tstate">${stateTxt[t.state]}</div>
            ${t.amt?`<div class="tamt">${rs(t.amt)}</div><div class="tcap">${t.since}</div>`:'<div class="tcap" style="margin-top:auto">Tap to seat</div>'}
          </div>`).join('')}</div>`;
      $$('.table-card', sec).forEach(c=> c.onclick=()=> tableModal(TABLES.find(t=>t.n===c.dataset.n)));
    }

    function tableModal(t){
      const body = t.state==='free'
        ? `<p style="color:var(--text-soft);font-size:14.5px">Table ${t.n} is available (${t.cap} seats). Seat guests and start a new order on the POS.</p>`
        : `<div class="crm-stats" style="margin-bottom:6px"><div class="cs"><div class="csv">${rs(t.amt)}</div><div class="csl">Running bill</div></div><div class="cs"><div class="csv">${t.since}</div><div class="csl">Seated for</div></div><div class="cs"><div class="csv">${t.cap}</div><div class="csl">Seats</div></div></div>`;
      const foot = t.state==='free'
        ? `<button class="btn btn-ghost" style="flex:1" data-x>Close</button><button class="btn btn-primary" style="flex:1" data-pos><i class="fa-solid fa-cash-register"></i> Seat & order</button>`
        : `<button class="btn btn-ghost" style="flex:1" data-pos><i class="fa-solid fa-plus"></i> Add items</button><button class="btn btn-primary" style="flex:1" data-bill><i class="fa-solid fa-print"></i> ${t.state==='billed'?'Settle payment':'Print bill'}</button>`;
      RSModal.open({ title:'Table '+t.n, sub:stateTxt[t.state], icon:'fa-chair', size:'sm', body, foot,
        onMount(modal,close){ modal.querySelector('[data-x]')&&(modal.querySelector('[data-x]').onclick=close);
          modal.querySelector('[data-pos]').onclick=()=>{ close(); RS.activateTab('pos-tab'); RS.toast('Table '+t.n+' selected on POS','fa-cash-register'); };
          const bb=modal.querySelector('[data-bill]'); if(bb) bb.onclick=async ()=>{
            close();
            if (t.state === 'billed' || t.state === 'occupied') {
              if (t.dbId && window.RS_DB) {
                try {
                  await RS_DB.del('pending_orders', t.dbId);
                  RS.toast('Table '+t.n+' settled / bill cleared','fa-check');
                  renderFloor();
                } catch(e) {
                  console.warn("Failed to delete table order", e);
                }
              } else {
                RS.toast('Table '+t.n+(t.state==='billed'?' settled':' bill printed'),'fa-print');
              }
            }
          };
        }});
    }
    RS.titles['floor-tab']=['Floor & Tables','Live table status & seating']; RS.addRenderer('floor-tab', renderFloor);

    /* ===================== ONLINE / AGGREGATOR ORDERS ===================== */
    const ONLINE = [];
    const platName = {zomato:'Zomato',swiggy:'Swiggy',ondc:'ONDC'};
    function renderAgg(){
      const sec = $('#aggregator-tab');
      // Update Online Orders sidebar badge dynamically
      const newAndPrep = ONLINE.filter(o => o.status === 'new' || o.status === 'preparing').length;
      const onlineBadge = document.querySelector('.sidebar-link[data-tab="aggregator-tab"] .badge-count');
      if (onlineBadge) {
        onlineBadge.textContent = newAndPrep;
        onlineBadge.style.display = newAndPrep > 0 ? '' : 'none';
      }
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-bowl-rice"></i></div><div><div class="sv">${ONLINE.filter(o=>o.status==='new').length}</div><div class="sl">New orders</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-fire-burner"></i></div><div><div class="sv">${ONLINE.filter(o=>o.status==='preparing').length}</div><div class="sl">Preparing</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-bell-concierge"></i></div><div><div class="sv">${ONLINE.filter(o=>o.status==='ready').length}</div><div class="sl">Ready for pickup</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(ONLINE.reduce((a,o)=>a+o.total,0))}</div><div class="sl">Online sales (open)</div></div></div>
        </div>
        <div class="toolbar-row"><span class="eyebrow">Live aggregator feed</span><div class="grow"></div><span class="pill pill-green"><span class="dot dot-live"></span> Auto-accept on</span></div>
        <div class="agg-grid">${ONLINE.map((o,i)=>`
          <div class="agg-card" data-i="${i}">
            <div class="agg-top ${o.plat}"><i class="fa-solid ${o.plat==='ondc'?'fa-network-wired':'fa-bowl-food'}"></i><span class="plat">${platName[o.plat]}</span><span class="oid">${o.oid}</span></div>
            <div class="agg-body">
              <div class="agg-cust"><div><div class="cn">${o.cust}</div><div class="ct">${o.area}</div></div><span class="pill ${o.status==='new'?'pill-amber':o.status==='preparing'?'pill-orange':'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${o.status}</span></div>
              <div class="agg-items">${o.items.join('<br>')}</div>
              <div class="agg-foot"><span class="at">${rs(o.total)}</span>
                ${o.status==='new'?`<button class="btn btn-ghost btn-sm" data-rej="${i}">Reject</button><button class="btn btn-primary btn-sm" data-acc="${i}"><i class="fa-solid fa-check"></i> Accept</button>`
                : o.status==='preparing'?`<span class="agg-prep"><i class="fa-solid fa-clock"></i> ${o.prep}m left</span><button class="btn btn-primary btn-sm" data-ready="${i}">Mark ready</button>`
                :`<button class="btn btn-ghost btn-sm" data-rider="${i}"><i class="fa-solid fa-motorcycle"></i> Rider assigned</button>`}
              </div>
            </div>
          </div>`).join('')}</div>`;
      $$('[data-acc]',sec).forEach(b=>b.onclick=()=>{ ONLINE[+b.dataset.acc].status='preparing'; ONLINE[+b.dataset.acc].prep=10; renderAgg(); RS.toast('Order accepted · KOT fired','fa-check'); });
      $$('[data-ready]',sec).forEach(b=>b.onclick=()=>{ ONLINE[+b.dataset.ready].status='ready'; renderAgg(); RS.toast('Marked ready for pickup','fa-bell-concierge'); });
      $$('[data-rej]',sec).forEach(b=>b.onclick=()=>RS.toast('Order rejected','fa-xmark'));
      $$('[data-rider]',sec).forEach(b=>b.onclick=()=>RS.toast('Rider on the way','fa-motorcycle'));
    }
    RS.titles['aggregator-tab']=['Online Orders','Zomato, Swiggy & ONDC orders']; RS.addRenderer('aggregator-tab', renderAgg);

    /* ===================== CUSTOMERS / CRM ===================== */
    const CUSTOMERS = [];
    const tierCls = {vip:'tier-vip',gold:'tier-gold',silver:'tier-silver'};
    function renderCustomers(){
      const sec = $('#customers-tab');
      if(!sec) return;
      if(window.RS_DB){
        sec.innerHTML = '<div class="sr-empty">Loading customers...</div>';
        RS_DB.list('customers').then(rows => {
          if (rows && rows.length) {
            CUSTOMERS.length = 0;
            rows.forEach(r => CUSTOMERS.push(r));
          }
          drawCustomersUI(sec);
        }).catch(e => {
          console.warn("Failed loading customers from DB", e);
          drawCustomersUI(sec);
        });
      } else {
        drawCustomersUI(sec);
      }
    }

    function drawCustomersUI(sec){
      // Calculate visits and spend dynamically for each customer from RS.BILLS
      const bills = RS.BILLS || [];
      CUSTOMERS.forEach(c => {
        const cBills = bills.filter(b => b.customerPhone === c.phone || (b.customerName && b.customerName !== 'Walk-in Guest' && b.customerName === c.name));
        c.visits = cBills.length;
        c.spend = cBills.reduce((sum, b) => sum + (b.amount || 0), 0);
        c.last = cBills.length > 0 ? cBills[0].time : 'never';
      });

      const total = CUSTOMERS.length || 1;
      const repeat = Math.round(CUSTOMERS.filter(c=>c.visits>1).length/total*100);
      const totalSpend = CUSTOMERS.reduce((a,c)=>a+(c.spend||0),0);
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-users"></i></div><div><div class="sv">${CUSTOMERS.length}</div><div class="sl">Total customers</div><div class="sd" style="display:none"></div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-repeat"></i></div><div><div class="sv">${repeat}%</div><div class="sl">Repeat rate</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(Math.round(totalSpend/total))}</div><div class="sl">Avg lifetime spend</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a"><i class="fa-solid fa-gift"></i></div><div><div class="sv">${CUSTOMERS.length}</div><div class="sl">Loyalty members</div></div></div>
        </div>
        <div class="toolbar-row"><div class="pos-search grow" style="max-width:320px;padding:9px 14px"><i class="fa-solid fa-magnifying-glass"></i><input id="crm-search" placeholder="Search name or phone…"></div><div class="grow"></div><button class="btn btn-ghost btn-sm"><i class="fa-brands fa-whatsapp"></i> Broadcast</button><button class="btn btn-primary btn-sm" id="btn-add-customer"><i class="fa-solid fa-user-plus"></i> Add customer</button></div>
        <div class="crm-grid" id="crm-grid"></div>`;
      const grid = $('#crm-grid');
      function draw(q=''){ const t=q.toLowerCase();
        grid.innerHTML = CUSTOMERS.filter(c=>c.name.toLowerCase().includes(t)||c.phone.includes(t)).map((c,i)=>`
          <div class="crm-card" data-i="${CUSTOMERS.indexOf(c)}">
            <div class="crm-top"><div class="crm-av" style="background:${RS.avatarColors[c.name.length%RS.avatarColors.length]}">${RS.initials(c.name)}</div><div style="flex:1"><div class="crm-name">${c.name} <span class="tier-badge ${tierCls[c.tier||'silver']}">${c.tier||'silver'}</span></div><div class="crm-phone">${c.phone}</div></div></div>
            <div class="crm-stats"><div class="cs"><div class="csv">${c.visits||0}</div><div class="csl">Visits</div></div><div class="cs"><div class="csv">${rs(c.spend||0)}</div><div class="csl">Spent</div></div><div class="cs"><div class="csv" style="font-size:12px">${c.last||'never'}</div><div class="csl">Last order</div></div></div>
          </div>`).join('') || '<div class="sr-empty">No customers found</div>';
        $$('.crm-card',grid).forEach(el=> el.onclick=()=> customerModal(CUSTOMERS[+el.dataset.i]));
      }
      draw(); $('#crm-search').addEventListener('input', e=>draw(e.target.value));
      const addCustomerBtn = $('#btn-add-customer');
      if(addCustomerBtn && !$('#btn-import-customers')) {
        addCustomerBtn.insertAdjacentHTML('beforebegin', '<button class="btn btn-ghost btn-sm" id="btn-import-customers"><i class="fa-solid fa-file-import"></i> Import CSV</button><button class="btn btn-ghost btn-sm" id="btn-export-customers"><i class="fa-solid fa-file-csv"></i> Export CSV</button>');
      }
      const broadcastBtn = $$('.toolbar-row .btn-ghost', sec).find(b => b.textContent.trim() === 'Broadcast');
      if(broadcastBtn) broadcastBtn.onclick = () => RS.toast('Broadcast campaigns are not connected yet', 'fa-bullhorn');

      const exportCustomers = $('#btn-export-customers');
      if(exportCustomers) exportCustomers.onclick = () => {
        if(!CUSTOMERS.length) return RS.toast('No customers to export', 'fa-circle-exclamation');
        const csv = [
          'Name,Phone,Email,Visits,TotalSpend,Tier,LastVisit',
          ...CUSTOMERS.map(c => [c.name,c.phone,c.email||'',c.visits||0,c.spend||0,c.tier||'silver',c.last||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))
        ].join('\n');
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', `customers-export-${Date.now()}.csv`);
        RS.toast('Customers exported as CSV', 'fa-circle-check');
      };

      const importCustomers = $('#btn-import-customers');
      if(importCustomers) importCustomers.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
          const file = e.target.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = async evt => {
            try {
              const rows = window.RestroSuite?.imports?.parseCsv ? window.RestroSuite.imports.parseCsv(evt.target.result) : [];
              if(!rows.length) throw new Error('No rows found in CSV');
              const cleanKey = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g,'');
              const getValue = (row, keys) => {
                const wanted = keys.map(cleanKey);
                for(const [key, value] of Object.entries(row || {})) {
                  if(wanted.includes(cleanKey(key)) && value !== '') return value;
                }
                return '';
              };
              const records = [];
              const skipped = [];
              rows.forEach((row, index) => {
                const name = String(getValue(row, ['name','customername'])).trim();
                const phone = String(getValue(row, ['phone','mobile','contact','customerphone'])).replace(/\D/g,'').slice(-10);
                if(!name || phone.length !== 10) { skipped.push(`Row ${index + 2}: name and valid 10-digit phone required`); return; }
                records.push({
                  id:'cust-' + phone,
                  name,
                  phone,
                  email:String(getValue(row, ['email'])).trim(),
                  visits:Number(getValue(row, ['visits'])) || 0,
                  spend:Number(getValue(row, ['totalspend','spend'])) || 0,
                  last:new Date().toISOString(),
                  tier:'silver'
                });
              });
              if(!records.length) throw new Error('No valid customer rows found');
              const ok = window.RSModal ? await new Promise(resolve => {
                RSModal.open({
                  title:'Import customers CSV', sub:'Review before saving to database', icon:'fa-file-import', size:'sm',
                  body:`<div class="crm-stats"><div class="cs"><div class="csv">${records.length}</div><div class="csl">Rows ready</div></div><div class="cs"><div class="csv">${skipped.length}</div><div class="csl">Skipped</div></div></div>${skipped.length?`<div class="sr-empty" style="text-align:left;margin-top:12px">First skipped row: ${skipped[0]}</div>`:''}`,
                  foot:`<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-database"></i> Import</button>`,
                  onMount(modal, close) {
                    modal.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
                    modal.querySelector('[data-confirm]').onclick = () => { close(); resolve(true); };
                  }
                });
              }) : window.confirm(`${records.length} customers ready. Continue import?`);
              if(!ok) return;
              const before = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
              let saved = 0;
              for(const c of records) { await RS.saveOne('customers', c); saved++; }
              const fallback = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time !== before && window.RS_LAST_CLOUD_ERROR.collection === 'customers';
              RS.toast(fallback ? `${saved} customers saved locally. Cloud sync pending.` : `${saved} customers imported and synced`, fallback ? 'fa-cloud-arrow-up' : 'fa-circle-check');
              renderCustomers();
            } catch(err) {
              console.warn('Customer import failed', err);
              RS.toast('Import failed: '+err.message, 'fa-circle-exclamation');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      };

      $('#btn-add-customer').onclick = () => {
        RSModal.open({
          title: 'Add customer', sub: 'Create new loyalty profile', icon: 'fa-user-plus', size: 'sm',
          body: `<div style="display:flex;flex-direction:column;gap:12px">
            <div class="form-group"><label>Full Name</label><input class="form-input" id="add-cust-name" placeholder="John Doe"></div>
            <div class="form-group"><label>Phone Number</label><input class="form-input" id="add-cust-phone" placeholder="+91 99999 99999"></div>
            <div class="form-group"><label>Email Address</label><input class="form-input" id="add-cust-email" placeholder="john@example.com"></div>
          </div>`,
          foot: `<button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" id="btn-save-new-cust"><i class="fa-solid fa-check"></i> Save Customer</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = close;
            modal.querySelector('#btn-save-new-cust').onclick = async () => {
              const name = modal.querySelector('#add-cust-name').value.trim();
              const phone = modal.querySelector('#add-cust-phone').value.trim();
              const email = modal.querySelector('#add-cust-email').value.trim();
              if (!name || !phone) {
                RS.toast('Name and phone are required', 'fa-circle-exclamation');
                return;
              }
              if (window.RS_DB) {
                try {
                  const newCust = {
                    id: 'cust-' + Date.now(),
                    name, phone, email,
                    visits: 1, spend: 0, last: 'Today', tier: 'silver'
                  };
                  await RS_DB.put('customers', newCust.id, newCust);
                  RS.toast('Customer saved successfully', 'fa-circle-check');
                  close();
                  renderCustomers();
                } catch(e) {
                  console.warn("Failed saving customer", e);
                  RS.toast('Customer save failed: '+e.message, 'fa-circle-exclamation');
                }
              } else {
                close();
              }
            };
          }
        });
      };
    }
    function customerModal(c){
      const custBills = (RS.BILLS || []).filter(b => b.customerPhone === c.phone || (b.customerName && b.customerName !== 'Walk-in Guest' && b.customerName === c.name));
      const history = custBills.map(b => [b.time, (b._items || []).map(i => `${i.name} x${i.qty}`).join(', '), b.amount]);

      const avgVisit = c.visits > 0 ? Math.round(c.spend/c.visits) : 0;
      const points = c.spend > 0 ? Math.round(c.spend/100) : 0;

      RSModal.open({ title:c.name, sub:c.phone+' · '+c.tier.toUpperCase()+' member', icon:'fa-user', size:'md',
        body:`<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">${c.visits}</div><div class="csl">Visits</div></div><div class="cs"><div class="csv">${rs(c.spend)}</div><div class="csl">Lifetime</div></div><div class="cs"><div class="csv">${rs(avgVisit)}</div><div class="csl">Avg ₹/visit</div></div><div class="cs"><div class="csv" style="color:var(--orange)">${points}</div><div class="csl">Points</div></div></div>
          <div class="panel-head" style="margin-bottom:10px"><h3 style="font-size:14px">Recent orders</h3></div>
          <table class="data-table"><tbody>${history.length > 0 ? history.map(h=>`<tr><td>${h[0]}</td><td style="color:var(--text-soft)">${h[1]}</td><td class="td-strong" style="text-align:right">${rs(h[2])}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-mute)">No order history</td></tr>'}</tbody></table>`,
        foot:`<button class="btn btn-ghost" style="flex:1" data-wa><i class="fa-brands fa-whatsapp"></i> Message</button><button class="btn btn-primary" style="flex:1" data-offer><i class="fa-solid fa-tags"></i> Send offer</button>`,
        onMount(modal,close){
          modal.querySelector('[data-wa]').onclick=()=>{
            window.open(`https://wa.me/${String(c.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent('Hi '+c.name+', thank you for dining with us.')}`, '_blank', 'noopener,noreferrer');
            close();
            RS.toast('WhatsApp message ready for '+c.name,'fa-whatsapp');
          };
          modal.querySelector('[data-offer]').onclick=()=>{close();RS.toast('Offer campaigns are not connected yet','fa-tags');};
        }});
    }
    RS.titles['customers-tab']=['Customers','CRM, loyalty & order history']; RS.addRenderer('customers-tab', renderCustomers);

    /* ===================== GROWTH HUB SCREENS ===================== */
    const HUB = [
      {ic:'fa-calendar-check',bg:'bg-o',t:'Reservations',d:'Manage table bookings & waitlist',m:'8 today'},
      {ic:'fa-headset',bg:'bg-v',t:'Support Tickets',d:'Customer queries & complaints',m:'2 open'},
      {ic:'fa-truck-ramp-box',bg:'bg-t',t:'Purchase Orders',d:'Raise & track supplier POs',m:'3 pending'},
      {ic:'fa-flask-vial',bg:'bg-g',t:'Recipe Costing',d:'Plate cost & margin calculator',m:'live'},
      {ic:'fa-tags',bg:'bg-a',t:'Offers & Coupons',d:'Build promos & festival deals',m:'4 live'},
      {ic:'fa-bullhorn',bg:'bg-o',t:'WhatsApp Campaigns',d:'Broadcast to your customer list',m:'3.1k reach'},
      {ic:'fa-star',bg:'bg-v',t:'Feedback & Reviews',d:'Collect & respond to ratings',m:'4.8 rating'},
      {ic:'fa-gift',bg:'bg-g',t:'Loyalty Program',d:'Points, tiers & rewards',m:'412 members'}
    ];
    function renderHub(){
      const grid = $('#hub-grid');
      grid.innerHTML = HUB.map((h,i)=>`<div class="hub-card" data-i="${i}"><div class="hub-ic ${h.bg}"><i class="fa-solid ${h.ic}"></i></div><h4>${h.t}</h4><p>${h.d}</p><span class="hub-meta"><span class="dot" style="color:var(--orange)"></span>${h.m}</span></div>`).join('');
      $$('.hub-card',grid).forEach(c=> c.onclick=()=> hubScreen(HUB[+c.dataset.i].t));
    }
    function table(head, rows){ return `<div class="table-scroll"><table class="data-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; }
    function hubScreen(name){
      let body='', size='md', icon='fa-rocket', sub='';
      if(name==='Reservations'){ icon='fa-calendar-check'; sub='Today’s bookings'; size='lg';
        const R=[];
        body = R.length ? table(['Time','Guest','Pax','Table','Status'], R.map(r=>`<tr><td class="td-strong">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td><span class="pill ${r[4]==='confirmed'?'pill-green':r[4]==='pending'?'pill-amber':'pill-violet'}" style="padding:3px 10px;text-transform:capitalize">${r[4]}</span></td></tr>`).join('')) : '<div class="sr-empty">No reservations for today</div>'; }
      else if(name==='Support Tickets'){ icon='fa-headset'; sub='Open customer issues';
        const T=[];
        body = T.length ? table(['Ticket','Subject','Customer','Priority','Status'], T.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td><span class="pill ${r[3]==='high'?'pill-red':r[3]==='medium'?'pill-amber':''}" style="padding:3px 10px;text-transform:capitalize">${r[3]}</span></td><td><span class="pill ${r[4]==='open'?'pill-orange':'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${r[4]}</span></td></tr>`).join('')) : '<div class="sr-empty">No open support tickets</div>'; }
      else if(name==='Recipe Costing'){ icon='fa-flask-vial'; sub='Plate cost & margin across the menu'; size='lg';
        const rows = RS.MENU.slice(0,10).map(m=>{ const ing=m.ingredients||[]; const cost=ing.reduce((a,g)=>{const inv=(RS.INVENTORY||[]).find(x=>x.name===g.name);return a+(inv?g.qty*inv.cost:0);},0); const c=cost||Math.round(m.price*0.32); const margin=Math.round((1-c/m.price)*100); return `<tr><td><b>${m.name}</b></td><td>${m.cat}</td><td class="td-strong">${rs(m.price)}</td><td>${rs(c)}</td><td style="color:var(--green)">${margin}%</td></tr>`; }).join('');
        body = rows.length ? table(['Item','Category','Sells at','Plate cost','Margin'], rows) : '<div class="sr-empty">No menu items to calculate costing</div>'; }
      else if(name==='Offers & Coupons'){ icon='fa-tags'; sub='Active promotions';
        const O=[];
        body = O.length ? table(['Code','Offer','Usage','Status'], O.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td><span class="pill ${r[3]==='active'?'pill-green':'pill-amber'}" style="padding:3px 10px;text-transform:capitalize">${r[3]}</span></td></tr>`).join('')) : '<div class="sr-empty">No active coupons or offers</div>'; }
      else if(name==='Loyalty Program'){ icon='fa-gift'; sub='Members & rewards';
        body = `<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">0</div><div class="csl">Members</div></div><div class="cs"><div class="csv">0</div><div class="csl">Points issued</div></div><div class="cs"><div class="csv">0</div><div class="csl">Rewards claimed</div></div></div>`
          + table(['Tier','Members','Earn rate','Perk'], [['VIP','0','3× points','Free dessert monthly'],['Gold','0','2× points','Priority seating'],['Silver','0','1× point','Birthday treat']].map(r=>`<tr><td><span class="tier-badge ${r[0]==='VIP'?'tier-vip':r[0]==='Gold'?'tier-gold':'tier-silver'}">${r[0]}</span></td><td>${r[1]}</td><td>${r[2]}</td><td style="color:var(--text-soft)">${r[3]}</td></tr>`).join('')); }
      else if(name==='WhatsApp Campaigns'){ icon='fa-bullhorn'; sub='Broadcast performance';
        const C=[];
        body = C.length ? table(['Campaign','Reach','Open rate','Status'], C.map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td><span class="pill ${r[3]==='active'?'pill-green':''}" style="padding:3px 10px;text-transform:capitalize">${r[3]}</span></td></tr>`).join('')) : '<div class="sr-empty">No campaigns run yet</div>'; }
      else if(name==='Feedback & Reviews'){ icon='fa-star'; sub='Recent ratings';
        const F=[];
        body = F.length ? F.map(r=>`<div class="set-row"><div class="si"><div class="st">${r[0]} <span style="color:var(--amber)">${'★'.repeat(r[1])}${'☆'.repeat(5-r[1])}</span></div><div class="sd">${r[2]}</div></div></div>`).join('') : '<div class="sr-empty">No reviews collected yet</div>'; }
      else if(name==='Purchase Orders'){ RSModal && RS.activateTab('inventory-tab'); setTimeout(()=>{ const b=$$('#inventory-tab .seg button')[2]; b&&b.click(); },80); RS.toast('Opening purchase orders','fa-truck-ramp-box'); return; }
      else { body = `<p style="color:var(--text-soft)">${name} module.</p>`; }
      RSModal.open({ title:name, sub, icon, size, body,
        foot:`<div class="grow"></div><button class="btn btn-primary" data-x><i class="fa-solid fa-plus"></i> New</button>`,
        onMount(modal,close){ modal.querySelector('[data-x]').onclick=()=>{close();RS.toast('Opening '+name+' form…','fa-plus');}; }});
    }
    RS.addRenderer('growth-hub-tab', renderHub);
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
