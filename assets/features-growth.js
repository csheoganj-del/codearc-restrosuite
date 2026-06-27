/* ============================================================
   RestroSuite -- Growth Hub screens + parity tabs
   (Online aggregator orders, Customers/CRM, Floor & tables)
   ============================================================ */
(function(){
  'use strict';
  // HTML escaping -- prevents XSS when inserting DB-sourced strings into innerHTML
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    /* ===================== FLOOR & TABLES ===================== */
    const DEFAULT_TABLES = [
      {n:'01',cap:2}, {n:'02',cap:4}, {n:'03',cap:4}, {n:'04',cap:2},
      {n:'05',cap:6}, {n:'06',cap:4}, {n:'07',cap:2}, {n:'08',cap:8},
      {n:'09',cap:4}, {n:'10',cap:2}, {n:'11',cap:4}, {n:'12',cap:6}
    ];
    let TABLES = [];

    async function loadTablesList() {
      try {
        const settings = window.RS_DB ? await window.RS_DB.getSettings().catch(() => null) : null;
        if (settings && Array.isArray(settings.custom_tables)) {
          return settings.custom_tables.map(t => ({ ...t, state: t.state || 'free' }));
        }
      } catch(e) {
        console.warn("Failed to load custom tables from settings", e);
      }
      return DEFAULT_TABLES.map(t => ({ ...t, state: 'free' }));
    }

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

    async function renderFloor(){
      const sec = $('#floor-tab');
      if(!sec) return;
      
      TABLES = await loadTablesList();
      
      if (window.RS_DB) {
        sec.innerHTML = '<div class="sr-empty">Loading tables...</div>';
        RS_DB.list('pending_orders').then(rows => {
          TABLES.forEach(t => {
            const activeOrder = rows.find(r => 
              (r.tableNumber === `Table ${t.n}` || r.tableNumber === t.n || r.tableNumber === `0${parseInt(t.n)}` || r.tableNumber === t.name) &&
              (r.status === 'DineIn Active' || r.status === 'Accepted' || r.status === 'preparing' || r.status === 'Pending Review' || r.status === 'Billed')
            );
            if (activeOrder) {
              t.state = activeOrder.status === 'Billed' ? 'billed' : 'occupied';
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
        </div><div class="grow"></div><button class="btn btn-ghost btn-sm" id="btn-manage-seating" style="margin-right:8px;"><i class="fa-solid fa-chair"></i> Edit Tables</button><button class="btn btn-ghost btn-sm" id="btn-print-floor-qrs" style="margin-right:8px;"><i class="fa-solid fa-qrcode"></i> Print Table QRs</button><span class="pill"><i class="fa-solid fa-location-dot"></i> Ground floor</span></div>
        <div class="floor-grid">${TABLES.map(t=>`
          <div class="table-card ${t.state}" data-n="${t.n}">
            <span class="tdot" style="background:${stateDot[t.state]}"></span>
            <div class="tnum2">Table ${t.n}</div><div class="tcap"><i class="fa-solid fa-user-group" style="font-size:10px"></i> ${t.cap} seats</div>
            <div class="tstate">${stateTxt[t.state]}</div>
            ${t.amt?`<div class="tamt">${rs(t.amt)}</div><div class="tcap">${t.since}</div>`:'<div class="tcap" style="margin-top:auto">Tap to seat</div>'}
          </div>`).join('')}</div>`;
      $$('.table-card', sec).forEach(c=> c.onclick=()=> tableModal(TABLES.find(t=>t.n===c.dataset.n)));
      const btnPrint = $('#btn-print-floor-qrs', sec);
      if (btnPrint) btnPrint.onclick = () => showAllTableQRs();
      const btnManage = $('#btn-manage-seating', sec);
      if (btnManage) btnManage.onclick = () => openManageSeatingModal();
    }

    function openManageSeatingModal() {
      const modalBody = `
        <div style="display:flex; flex-direction:column; gap:10px; max-height:380px; overflow-y:auto; padding:4px;" id="seating-manage-list">
          ${TABLES.map((t, idx) => `
            <div class="seating-manage-row" style="display:flex; align-items:center; gap:8px; background:var(--glass); border:1px solid var(--stroke-2); padding:8px; border-radius:var(--r-sm);">
              <div style="flex:2; display:flex; flex-direction:column; gap:2px;">
                <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Table Name/No</label>
                <input type="text" class="form-input table-manage-name" value="${t.name || t.n}" style="height:32px; font-size:12px; padding:4px 8px;">
              </div>
              <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
                <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Seats</label>
                <input type="number" class="form-input table-manage-cap" value="${t.cap}" style="height:32px; font-size:12px; padding:4px 8px;" min="1">
              </div>
              <button class="btn btn-ghost btn-sm btn-delete-table" style="color:var(--red); padding:4px 8px; margin-top:16px; border:1px solid rgba(239, 68, 68, 0.25);" title="Delete Table">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `).join('')}
        </div>
      `;
      
      const modalFoot = `
        <button class="btn btn-ghost" id="btn-add-manage-table"><i class="fa-solid fa-plus"></i> Add Table</button>
        <button class="btn btn-primary" id="btn-save-seating" style="margin-left:auto;"><i class="fa-solid fa-check"></i> Save Layout</button>
      `;
      
      RSModal.open({
        title: 'Manage Seating Layout',
        sub: 'Add, edit or remove dine-in tables',
        icon: 'fa-chair',
        size: 'sm',
        body: modalBody,
        foot: modalFoot,
        onMount(modal, close) {
          const list = modal.querySelector('#seating-manage-list');
          
          list.addEventListener('click', e => {
            const btn = e.target.closest('.btn-delete-table');
            if (btn) {
              btn.closest('.seating-manage-row').remove();
            }
          });
          
          modal.querySelector('#btn-add-manage-table').onclick = () => {
            const count = list.children.length + 1;
            const newRowHtml = `
              <div class="seating-manage-row" style="display:flex; align-items:center; gap:8px; background:var(--glass); border:1px solid var(--stroke-2); padding:8px; border-radius:var(--r-sm);">
                <div style="flex:2; display:flex; flex-direction:column; gap:2px;">
                  <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Table Name/No</label>
                  <input type="text" class="form-input table-manage-name" value="${count < 10 ? '0' + count : count}" style="height:32px; font-size:12px; padding:4px 8px;">
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
                  <label style="font-size:10px; font-weight:700; color:var(--text-soft)">Seats</label>
                  <input type="number" class="form-input table-manage-cap" value="4" style="height:32px; font-size:12px; padding:4px 8px;" min="1">
                </div>
                <button class="btn btn-ghost btn-sm btn-delete-table" style="color:var(--red); padding:4px 8px; margin-top:16px; border:1px solid rgba(239, 68, 68, 0.25);" title="Delete Table">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            `;
            list.insertAdjacentHTML('beforeend', newRowHtml);
            list.scrollTop = list.scrollHeight;
          };
          
          modal.querySelector('#btn-save-seating').onclick = async () => {
            const rows = list.querySelectorAll('.seating-manage-row');
            const newTables = [];
            rows.forEach(row => {
              const nameInput = row.querySelector('.table-manage-name');
              const capInput = row.querySelector('.table-manage-cap');
              if (nameInput && capInput) {
                const name = nameInput.value.trim();
                const cap = Number(capInput.value) || 4;
                if (name) {
                  newTables.push({
                    n: name,
                    name: name,
                    cap: cap,
                    state: 'free'
                  });
                }
              }
            });
            
            if (window.RS_DB) {
              try {
                const settings = await window.RS_DB.getSettings().catch(() => ({})) || {};
                settings.custom_tables = newTables;
                await window.RS_DB.setSettings(settings);
                
                RS.toast('Seating layout updated', 'fa-circle-check');
                close();
                
                renderFloor();
                document.dispatchEvent(new Event('rs:tables-updated'));
              } catch(e) {
                console.warn("Failed saving seating settings", e);
                RS.toast('Save failed', 'fa-circle-exclamation');
              }
            }
          };
        }
      });
    }

    function tableModal(t){
      const body = t.state==='free'
        ? `<p style="color:var(--text-soft);font-size:14.5px">Table ${t.n} is available (${t.cap} seats). Seat guests and start a new order on the POS.</p>`
        : `<div class="crm-stats" style="margin-bottom:6px"><div class="cs"><div class="csv">${rs(t.amt)}</div><div class="csl">Running bill</div></div><div class="cs"><div class="csv">${t.since}</div><div class="csl">Seated for</div></div><div class="cs"><div class="csv">${t.cap}</div><div class="csl">Seats</div></div></div>`;
      const foot = t.state==='free'
        ? `<button class="btn btn-ghost" id="tbl-view-qr" style="padding:0 12px;margin-right:8px" title="View Table QR"><i class="fa-solid fa-qrcode"></i></button><button class="btn btn-ghost" style="flex:1" data-x>Close</button><button class="btn btn-primary" style="flex:1" data-pos><i class="fa-solid fa-cash-register"></i> Seat & order</button>`
        : `<button class="btn btn-ghost" id="tbl-view-qr" style="padding:0 12px;margin-right:8px" title="View Table QR"><i class="fa-solid fa-qrcode"></i></button><button class="btn btn-ghost" style="flex:1" data-pos><i class="fa-solid fa-plus"></i> Add items</button><button class="btn btn-primary" style="flex:1" data-bill><i class="fa-solid fa-print"></i> ${t.state==='billed'?'Settle payment':'Print bill'}</button>`;
      RSModal.open({ title:'Table '+t.n, sub:stateTxt[t.state], icon:'fa-chair', size:'sm', body, foot,
        onMount(modal,close){ modal.querySelector('[data-x]')&&(modal.querySelector('[data-x]').onclick=close);
          modal.querySelector('[data-pos]').onclick=()=>{ close(); RS.activateTab('pos-tab'); RS.toast('Table '+t.n+' selected on POS','fa-cash-register'); };
          const qrBtn = modal.querySelector('#tbl-view-qr');
          if (qrBtn) {
            qrBtn.onclick = () => {
              close();
              showSingleTableQR(t);
            };
          }
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

    function showSingleTableQR(t) {
      if (!window.RSModal) return;
      const tenantName = sessionStorage.getItem('tenant_name') || 'Doppio Cafe';
      const tenantSlug = sessionStorage.getItem('tenant_slug') || 'doppiocl';
      const orderUrl = `https://restrosuite.codearc.co.in/qr-order.html?tenant=${tenantSlug}&table=${t.n}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(orderUrl)}`;
      
      const body = `
        <div style="text-align: center; padding: 10px 0;">
          <div style="font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 2px;">${tenantName}</div>
          <div style="font-size: 12px; color: var(--text-soft); margin-bottom: 16px;">Scan to view menu and place order</div>
          <div style="display: inline-block; padding: 12px; border: 1px solid var(--stroke-2); border-radius: 12px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.03); margin-bottom: 16px;">
            <img src="${qrCodeUrl}" style="width: 180px; height: 180px; display: block;" alt="Table ${t.n} QR Code">
          </div>
          <div style="font-size: 18px; font-weight: 800; color: #FF6B00; margin-bottom: 6px;">Table ${t.n}</div>
          <div style="font-size: 11px; word-break: break-all; color: var(--text-soft); background: var(--bg-soft); padding: 8px 10px; border-radius: 6px; font-family: monospace; border: 1px solid var(--stroke-2);">${orderUrl}</div>
        </div>
      `;
      
      const foot = `
        <button class="btn btn-ghost" style="flex:1" data-x>Close</button>
        <button class="btn btn-primary" style="flex:1" id="btn-print-single-qr"><i class="fa-solid fa-print"></i> Print Card</button>
      `;
      
      RSModal.open({
        title: 'Table QR Code',
        sub: `Table ${t.n} ordering link`,
        icon: 'fa-qrcode',
        size: 'sm',
        body,
        foot,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('#btn-print-single-qr').onclick = () => {
            const printHtml = `
              <div style="max-width: 320px; margin: 20px auto; text-align: center; border: 2px solid #111; padding: 30px 20px; border-radius: 16px; background: #fff;">
                <div style="font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-weight: 800; font-size: 24px; color: #111; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${tenantName}</div>
                <div style="font-size: 12px; color: #555; margin-bottom: 24px;">Scan to view menu & order instantly</div>
                <div style="display: inline-block; padding: 12px; border: 1px solid #ddd; border-radius: 12px; background: #fff; margin-bottom: 24px;">
                  <img src="${qrCodeUrl}" style="width: 200px; height: 200px; display: block;" />
                </div>
                <div style="font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-weight: 800; font-size: 32px; color: #FF6B00; margin-bottom: 8px;">TABLE ${t.n}</div>
                <div style="font-size: 11px; color: #777;">Powered by RestroSuite</div>
              </div>
            `;
            if (typeof window.RSPrint === 'function') {
              window.RSPrint(printHtml, `Table ${t.n} QR`);
            } else {
              const win = window.open('', '_blank');
              win.document.write(`<html><head><title>Print Table ${t.n} QR</title></head><body>${printHtml}<script>
                window.onload = function() {
                  const imgs = Array.from(document.getElementsByTagName('img'));
                  if (imgs.length === 0) {
                    window.print(); window.close();
                  } else {
                    let loaded = 0;
                    const done = () => {
                      loaded++;
                      if (loaded === imgs.length) {
                        setTimeout(() => { window.print(); window.close(); }, 300);
                      }
                    };
                    imgs.forEach(img => {
                      if (img.complete) done();
                      else { img.onload = done; img.onerror = done; }
                    });
                  }
                };
              </script></body></html>`);
              win.document.close();
            }
          };
        }
      });
    }

    function showAllTableQRs() {
      const tenantName = sessionStorage.getItem('tenant_name') || 'Doppio Cafe';
      const tenantSlug = sessionStorage.getItem('tenant_slug') || 'doppiocl';
      
      const cardsHtml = TABLES.map(t => {
        const orderUrl = `https://restrosuite.codearc.co.in/qr-order.html?tenant=${tenantSlug}&table=${t.n}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(orderUrl)}`;
        return `
          <div class="qr-print-card" style="text-align: center; border: 1.5px solid #111; padding: 24px 15px; border-radius: 12px; background: #fff; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-weight: 800; font-size: 18px; color: #111; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">${tenantName}</div>
            <div style="font-size: 10px; color: #555; margin-bottom: 15px;">Scan to view menu & order</div>
            <div style="display: inline-block; padding: 8px; border: 1px solid #ddd; border-radius: 8px; background: #fff; margin-bottom: 15px;">
              <img src="${qrCodeUrl}" style="width: 140px; height: 140px; display: block;" />
            </div>
            <div style="font-family: 'Plus Jakarta Sans', 'Inter', sans-serif; font-weight: 800; font-size: 24px; color: #FF6B00; margin-bottom: 4px;">TABLE ${t.n}</div>
            <div style="font-size: 9px; color: #777;">Powered by RestroSuite</div>
          </div>
        `;
      }).join('');

      const printStyle = `
        <style>
          @media print {
            body { padding: 0; margin: 0; background: #fff; }
          }
          .qr-print-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            padding: 10px;
          }
        </style>
      `;

      const printHtml = `
        ${printStyle}
        <div class="qr-print-grid">
          ${cardsHtml}
        </div>
      `;

      if (typeof window.RSPrint === 'function') {
        window.RSPrint(printHtml, 'Outlet Table QRs');
      } else {
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>Print Table QRs</title></head><body>${printHtml}<script>
          window.onload = function() {
            const imgs = Array.from(document.getElementsByTagName('img'));
            if (imgs.length === 0) {
              window.print(); window.close();
            } else {
              let loaded = 0;
              const done = () => {
                loaded++;
                if (loaded === imgs.length) {
                  setTimeout(() => { window.print(); window.close(); }, 300);
                }
              };
              imgs.forEach(img => {
                if (img.complete) done();
                else { img.onload = done; img.onerror = done; }
              });
            }
          };
        </script></body></html>`);
        win.document.close();
      }
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
      const totalDues = CUSTOMERS.reduce((a,c)=>a+(c.dues||0),0);
      sec.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-ic bg-o"><i class="fa-solid fa-users"></i></div><div><div class="sv">${CUSTOMERS.length}</div><div class="sl">Total customers</div><div class="sd" style="display:none"></div></div></div>
          <div class="stat-card"><div class="stat-ic bg-g"><i class="fa-solid fa-repeat"></i></div><div><div class="sv">${repeat}%</div><div class="sl">Repeat rate</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-v"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv">${rs(Math.round(totalSpend/total))}</div><div class="sl">Avg lifetime spend</div></div></div>
          <div class="stat-card"><div class="stat-ic bg-a" style="background: rgba(255, 79, 0, 0.1); color: var(--orange);"><i class="fa-solid fa-indian-rupee-sign"></i></div><div><div class="sv" id="crm-total-dues">${rs(totalDues)}</div><div class="sl">Total Outstanding Dues</div></div></div>
        </div>
        <div class="toolbar-row"><div class="pos-search grow" style="max-width:320px;padding:9px 14px"><i class="fa-solid fa-magnifying-glass"></i><input id="crm-search" placeholder="Search name or phone..."></div><div class="grow"></div><button class="btn btn-ghost btn-sm"><i class="fa-brands fa-whatsapp"></i> Broadcast</button><button class="btn btn-primary btn-sm" id="btn-add-customer"><i class="fa-solid fa-user-plus"></i> Add customer</button></div>
        <div class="crm-grid" id="crm-grid"></div>`;
      const grid = $('#crm-grid');
      function draw(q=''){ const t=q.toLowerCase();
        grid.innerHTML = CUSTOMERS.filter(c=>c.name.toLowerCase().includes(t)||c.phone.includes(t)).map((c,i)=>`
          <div class="crm-card" data-i="${CUSTOMERS.indexOf(c)}">
            <div class="crm-top"><div class="crm-av" style="background:${RS.avatarColors[c.name.length%RS.avatarColors.length]}">${RS.initials(c.name)}</div><div style="flex:1"><div class="crm-name">${esc(c.name)} <span class="tier-badge ${esc(tierCls[c.tier||'silver'])}">${esc(c.tier||'silver')}</span>${c.dues > 0 ? `<span class="pill pill-orange" style="margin-left:6px; font-size:10px; padding: 2px 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Due: ${rs(c.dues)}</span>` : ''}</div><div class="crm-phone">${esc(c.phone)}</div></div></div>
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
              let duplicatesCount = 0;
              rows.forEach((row, index) => {
                const name = String(getValue(row, ['name','customername'])).trim();
                const phone = String(getValue(row, ['phone','mobile','contact','customerphone'])).replace(/\D/g,'').slice(-10);
                if(!name || phone.length !== 10) { skipped.push(`Row ${index + 2}: name and valid 10-digit phone required`); return; }
                const existing = CUSTOMERS.find(x => String(x.phone) === String(phone));
                if (existing) duplicatesCount++;
                records.push({
                  _existing: existing,
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
              const res = await (RS.importPreview ? RS.importPreview({ 
                title: 'Import customers CSV', 
                summary: 'Customer rows will update loyalty profiles for this outlet and sync to Supabase when cloud is available.', 
                rows: records.length, 
                skipped, 
                duplicatesCount 
              }) : Promise.resolve({ proceed: window.confirm(`${records.length} customers ready. Continue import?`), behavior: 'overwrite' }));
              
              if(!res || !res.proceed) return;

              const finalRecords = [];
              records.forEach(item => {
                if (item._existing) {
                  if (res.behavior === 'skip') {
                    return;
                  } else if (res.behavior === 'keep') {
                    item.id = 'cust-' + item.phone + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                    // Suffix phone dynamically to allow unique database insertion
                    item.phone = item.phone.slice(0, 7) + Math.floor(100 + Math.random() * 900);
                  } else {
                    item.id = item._existing.id;
                  }
                } else {
                  item.id = 'cust-' + item.phone;
                }
                delete item._existing;
                finalRecords.push(item);
              });

              if(!finalRecords.length) {
                RS.toast('No new customers imported (duplicates skipped)', 'fa-circle-check');
                return;
              }

              const before = window.RS_LAST_CLOUD_ERROR && window.RS_LAST_CLOUD_ERROR.time;
              let saved = 0;
              if (window.RS && RS.setOperationStatus) {
                RS.setOperationStatus(`Importing 1/${finalRecords.length} customers...`, 'running', (1 / finalRecords.length) * 100);
              }
              for(let i = 0; i < finalRecords.length; i++) {
                const c = finalRecords[i];
                await RS.saveOne('customers', c);
                saved++;
                if (window.RS && RS.setOperationStatus) {
                  RS.setOperationStatus(`Importing ${saved}/${finalRecords.length} customers...`, 'running', (saved / finalRecords.length) * 100);
                }
              }
              if (window.RS && RS.finishOperationStatus) {
                RS.finishOperationStatus(`${saved} customers imported`);
              }
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
    function showSettleDuesModal(c, closeParentModal) {
      RSModal.open({
        title: 'Settle Dues',
        sub: `${c.name} · Outstanding: ${rs(c.dues || 0)}`,
        icon: 'fa-hand-holding-dollar',
        size: 'sm',
        body: `
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div class="form-group">
              <label style="font-weight:700; font-size:13px; color:var(--text-soft); display:block; margin-bottom:6px;">Settlement Amount</label>
              <input type="number" class="form-input" id="settle-amount" value="${c.dues || 0}" min="1" max="${c.dues || 0}" step="any" style="width:100%;">
            </div>
            <div class="form-group">
              <label style="font-weight:700; font-size:13px; color:var(--text-soft); display:block; margin-bottom:6px;">Payment Method</label>
              <select class="form-input" id="settle-method" style="width:100%;">
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
              </select>
            </div>
          </div>
        `,
        foot: `
          <button class="btn btn-ghost" style="flex:1" data-close-settle>Cancel</button>
          <button class="btn btn-primary" style="flex:1; background:var(--orange); border-color:var(--orange);" id="btn-confirm-settle">Confirm Payment</button>
        `,
        onMount(modal, closeSettle) {
          modal.querySelector('[data-close-settle]').onclick = closeSettle;
          modal.querySelector('#btn-confirm-settle').onclick = async () => {
            const amountInput = modal.querySelector('#settle-amount');
            const methodSelect = modal.querySelector('#settle-method');
            const settleAmt = parseFloat(amountInput.value);
            const method = methodSelect.value;
            
            if (isNaN(settleAmt) || settleAmt <= 0) {
              return RS.toast('Please enter a valid amount', 'fa-circle-exclamation');
            }
            if (settleAmt > (c.dues || 0)) {
              return RS.toast('Settlement amount cannot exceed outstanding dues', 'fa-circle-exclamation');
            }
            
            try {
              // Update customer dues
              c.dues = Math.max(0, (c.dues || 0) - settleAmt);
              if (window.RS_DB) {
                await RS_DB.put('customers', c.id, c);
              }
              
              // Log settlement transaction in bills
              const now = new Date();
              const yyyymmdd = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
              const hhmmss = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
              const billNo = `RS-SETTLE-${yyyymmdd}-${hhmmss}`;
              const billTime = now.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
              });
              const billRow = {
                id: billNo,
                orderId: billNo,
                no: billNo,
                time: billTime,
                dateTime: new Date().toISOString(),
                table: 'Dues Settlement',
                items: 1,
                amount: settleAmt,
                pay: method,
                paymentMethod: method,
                total: settleAmt,
                status: 'paid',
                customerName: c.name,
                customerPhone: c.phone,
                subtotal: settleAmt,
                gst: 0,
                cgst: 0,
                sgst: 0,
                _items: [{ name: 'Dues Settlement Payment', qty: 1, price: settleAmt }]
              };
              
              if (window.RS && Array.isArray(RS.BILLS)) {
                RS.BILLS.unshift(billRow);
              }
              if (window.RS_DB && RS_DB.put) {
                await RS_DB.put('bills', billNo, billRow);
              }
              
              RS.toast(`Settled ${rs(settleAmt)} dues successfully`, 'fa-circle-check');
              
              // Auto-trigger Receipt preview/print/WhatsApp modal
              if (window.RSReceipt && typeof window.RSReceipt.show === 'function') {
                const receiptBill = {
                  no: billRow.no,
                  time: billRow.time,
                  table: billRow.table,
                  customer: billRow.customerName,
                  customerPhone: billRow.customerPhone,
                  items: billRow._items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
                  sub: billRow.subtotal,
                  disc: 0,
                  gst: 0,
                  grand: billRow.total,
                  tenders: [{ method: billRow.paymentMethod, amount: billRow.total }],
                  change: 0
                };
                window.RSReceipt.show(receiptBill);
              }
              
              // Refresh views
              closeSettle();
              closeParentModal();
              renderCustomers();
            } catch (err) {
              console.error("Failed to settle dues", err);
              RS.toast('Error settling dues', 'fa-circle-exclamation');
            }
          };
        }
      });
    }

    function customerModal(c){
      const custBills = (RS.BILLS || []).filter(b => b.customerPhone === c.phone || (b.customerName && b.customerName !== 'Walk-in Guest' && b.customerName === c.name));
      const history = custBills.map(b => [b.time, (b._items || []).map(i => `${i.name} x${i.qty}`).join(', '), b.amount]);

      const avgVisit = c.visits > 0 ? Math.round(c.spend/c.visits) : 0;
      const points = c.spend > 0 ? Math.round(c.spend/100) : 0;

      RSModal.open({ title:c.name, sub:c.phone+' · '+c.tier.toUpperCase()+' member', icon:'fa-user', size:'md',
        body:`<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">${c.visits}</div><div class="csl">Visits</div></div><div class="cs"><div class="csv">${rs(c.spend)}</div><div class="csl">Lifetime</div></div><div class="cs"><div class="csv">${rs(avgVisit)}</div><div class="csl">Avg ₹/visit</div></div><div class="cs"><div class="csv" style="color:var(--orange)">${points}</div><div class="csl">Points</div></div></div>
          ${c.dues > 0 ? `
          <div style="background:var(--orange-tint); border:1px solid rgba(255,107,0,0.3); border-radius:12px; padding:10px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:13px; color:var(--text); font-weight:700;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--orange); margin-right:6px;"></i> Outstanding dues: <span style="color:var(--orange); font-size:15px; font-weight:800;">${rs(c.dues)}</span></div>
            <button class="btn btn-sm btn-primary" style="background:var(--orange); border-color:var(--orange); font-size:11px;" id="modal-settle-dues-btn">Settle now</button>
          </div>` : ''}
          <div class="panel-head" style="margin-bottom:10px"><h3 style="font-size:14px">Recent orders</h3></div>
          <table class="data-table"><tbody>${history.length > 0 ? history.map(h=>`<tr><td>${h[0]}</td><td style="color:var(--text-soft)">${h[1]}</td><td class="td-strong" style="text-align:right">${rs(h[2])}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-mute)">No order history</td></tr>'}</tbody></table>`,
        foot:`<button class="btn btn-ghost" style="flex:1" data-wa><i class="fa-brands fa-whatsapp"></i> Message</button>
              ${c.dues > 0 ? `<button class="btn btn-primary" style="flex:1; background:var(--orange); border-color:var(--orange);" id="modal-settle-dues-foot"><i class="fa-solid fa-hand-holding-dollar"></i> Settle Dues</button>` : ''}
              <button class="btn btn-ghost" style="flex:1; border:1px solid var(--stroke-2)" data-offer><i class="fa-solid fa-tags"></i> Send offer</button>`,
        onMount(modal,close){
          modal.querySelector('[data-wa]').onclick=()=>{
            window.open(`https://wa.me/${String(c.phone||'').replace(/\D/g,'')}?text=${encodeURIComponent('Hi '+c.name+', thank you for dining with us.')}`, '_blank', 'noopener,noreferrer');
            close();
            RS.toast('WhatsApp message ready for '+c.name,'fa-whatsapp');
          };
          modal.querySelector('[data-offer]').onclick=()=>{close();RS.toast('Offer campaigns are not connected yet','fa-tags');};
          const settleBtn = modal.querySelector('#modal-settle-dues-btn');
          if (settleBtn) {
            settleBtn.onclick = () => {
              showSettleDuesModal(c, close);
            };
          }
          const settleFoot = modal.querySelector('#modal-settle-dues-foot');
          if (settleFoot) {
            settleFoot.onclick = () => {
              showSettleDuesModal(c, close);
            };
          }
        }});
    }
    RS.titles['customers-tab']=['Customers','CRM, loyalty & order history']; RS.addRenderer('customers-tab', renderCustomers);
    RS.showCustomerProfile = customerModal;

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
    async function hubScreen(name){
      let body='', size='md', icon='fa-rocket', sub='';
      let records = [];

      if(name==='Reservations'){ 
        icon='fa-calendar-check'; sub='Today's bookings'; size='lg';
        if (window.RS_DB) {
          try { records = await RS_DB.list('reservations'); } catch(e){}
        }
        body = records && records.length 
          ? table(['Time','Guest','Pax','Table','Status'], records.map(r=>`<tr><td class="td-strong">${r.time || '--'}</td><td>${r.guestName || '--'}</td><td>${r.pax || 2}</td><td>${r.tableNumber || '--'}</td><td><span class="pill ${r.status==='confirmed'?'pill-green':r.status==='pending'?'pill-amber':'pill-violet'}" style="padding:3px 10px;text-transform:capitalize">${r.status || 'confirmed'}</span></td></tr>`).join('')) 
          : '<div class="sr-empty">No reservations for today</div>'; 
      }
      else if(name==='Support Tickets'){ 
        icon='fa-headset'; sub='Open customer issues';
        if (window.RS_DB) {
          try { records = await RS_DB.list('support_tickets'); } catch(e){}
        }
        body = records && records.length 
          ? table(['Ticket','Subject','Customer','Priority','Status'], records.map(r=>`<tr><td><b>${r.ticketNumber}</b></td><td>${r.subject}</td><td>${r.customerName}</td><td><span class="pill ${r.priority==='high'?'pill-red':r.priority==='medium'?'pill-amber':''}" style="padding:3px 10px;text-transform:capitalize">${r.priority}</span></td><td><span class="pill ${r.status==='open'?'pill-orange':'pill-green'}" style="padding:3px 10px;text-transform:capitalize">${r.status}</span></td></tr>`).join('')) 
          : '<div class="sr-empty">No open support tickets</div>'; 
      }
      else if(name==='Recipe Costing'){ 
        icon='fa-flask-vial'; sub='Plate cost & margin across the menu'; size='lg';
        const rows = RS.MENU.slice(0,10).map(m=>{ 
          const ing=m.ingredients||[]; 
          const cost=ing.reduce((a,g)=>{const inv=(RS.INVENTORY||[]).find(x=>x.name===g.name);return a+(inv?g.qty*inv.cost:0);},0); 
          const c=cost||Math.round(m.price*0.32); 
          const margin=Math.round((1-c/m.price)*100); 
          return `<tr><td><b>${m.name}</b></td><td>${m.cat}</td><td class="td-strong">${rs(m.price)}</td><td>${rs(c)}</td><td style="color:var(--green)">${margin}%</td></tr>`; 
        }).join('');
        body = rows.length ? table(['Item','Category','Sells at','Plate cost','Margin'], rows) : '<div class="sr-empty">No menu items to calculate costing</div>'; 
      }
      else if(name==='Offers & Coupons'){ 
        icon='fa-tags'; sub='Active promotions';
        if (window.RS_DB) {
          try { records = await RS_DB.list('offers'); } catch(e){}
        }
        body = records && records.length 
          ? table(['Code','Offer','Usage','Status'], records.map(r=>`<tr><td><b>${r.code}</b></td><td>${r.description || 'Discount'}</td><td>${r.usageCount || 0}</td><td><span class="pill ${r.status==='active'?'pill-green':'pill-amber'}" style="padding:3px 10px;text-transform:capitalize">${r.status}</span></td></tr>`).join('')) 
          : '<div class="sr-empty">No active coupons or offers</div>'; 
      }
      else if(name==='Loyalty Program'){ 
        icon='fa-gift'; sub='Members & rewards';
        const crm = window.RS_DB ? await RS_DB.list('customers').catch(() => []) : [];
        const totalMembers = crm.length;
        const totalPoints = crm.reduce((sum, c) => sum + (c.points || 0), 0);
        body = `<div class="crm-stats" style="margin-bottom:16px"><div class="cs"><div class="csv">${totalMembers}</div><div class="csl">Members</div></div><div class="cs"><div class="csv">${totalPoints}</div><div class="csl">Points issued</div></div><div class="cs"><div class="csv">${Math.round(totalPoints * 0.1)}</div><div class="csl">Rewards claimed</div></div></div>`
          + table(['Tier','Members','Earn rate','Perk'], [
              ['VIP', crm.filter(c => c.spend >= 10000).length, '3× points', 'Free dessert monthly'],
              ['Gold', crm.filter(c => c.spend >= 5000 && c.spend < 10000).length, '2× points', 'Priority seating'],
              ['Silver', crm.filter(c => c.spend < 5000).length, '1× point', 'Birthday treat']
            ].map(r=>`<tr><td><span class="tier-badge ${r[0]==='VIP'?'tier-vip':r[0]==='Gold'?'tier-gold':'tier-silver'}">${r[0]}</span></td><td>${r[1]}</td><td>${r[2]}</td><td style="color:var(--text-soft)">${r[3]}</td></tr>`).join('')); 
      }
      else if(name==='WhatsApp Campaigns'){ 
        icon='fa-bullhorn'; sub='Broadcast performance';
        body = '<div class="sr-empty">No campaigns run yet</div>'; 
      }
      else if(name==='Feedback & Reviews'){ 
        icon='fa-star'; sub='Recent ratings';
        body = '<div class="sr-empty">No reviews collected yet</div>'; 
      }
      else if(name==='Purchase Orders'){ 
        RS.activateTab('inventory-tab'); 
        setTimeout(()=>{ const b=$$('#inventory-tab .seg button')[2]; b&&b.click(); },80); 
        RS.toast('Opening purchase orders','fa-truck-ramp-box'); 
        return; 
      }
      else { body = `<p style="color:var(--text-soft)">${name} module.</p>`; }

      const hideNewBtn = ['Recipe Costing', 'Loyalty Program', 'WhatsApp Campaigns', 'Feedback & Reviews'].includes(name);

      RSModal.open({ title:name, sub, icon, size, body,
        foot: hideNewBtn ? `<div class="grow"></div><button class="btn btn-ghost" data-cancel>Close</button>` : `<div class="grow"></div><button class="btn btn-primary" data-x><i class="fa-solid fa-plus"></i> New</button>`,
        onMount(modal,close){ 
          const cancelBtn = modal.querySelector('[data-cancel]');
          if (cancelBtn) cancelBtn.onclick = close;

          const newBtn = modal.querySelector('[data-x]');
          if (newBtn) {
            newBtn.onclick = () => {
              close();
              if (name === 'Reservations') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Guest Name</label>
                        <input type="text" id="res-guest" class="form-control" placeholder="e.g. John Doe" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Time</label>
                        <input type="text" id="res-time" class="form-control" value="07:30 PM" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Pax (Guests)</label>
                        <input type="number" id="res-pax" class="form-control" value="4" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Table Number</label>
                        <input type="text" id="res-table" class="form-control" value="Table 05" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                  </div>
                `;
                RSModal.open({
                  title: 'New Reservation',
                  sub: 'Create a table booking',
                  icon: 'fa-calendar-check',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Book Table</button>`,
                  onMount(resModal, resClose) {
                    resModal.querySelector('[data-cancel]').onclick = resClose;
                    resModal.querySelector('[data-confirm]').onclick = async () => {
                      const guestName = resModal.querySelector('#res-guest').value || '';
                      if (!guestName) return RS.toast('Guest name is required', 'fa-circle-exclamation');
                      const time = resModal.querySelector('#res-time').value || '07:30 PM';
                      const pax = Number(resModal.querySelector('#res-pax').value) || 2;
                      const tableNumber = resModal.querySelector('#res-table').value || '';

                      const id = 'res_' + Date.now().toString().slice(-6);
                      const resRow = { id, time, guestName, pax, tableNumber, status: 'confirmed' };
                      resClose();
                      if (RS.saveOne) {
                        await RS.saveOne('reservations', resRow);
                        RS.toast('Reservation booked successfully', 'fa-circle-check');
                        hubScreen('Reservations');
                      }
                    };
                  }
                });
              } else if (name === 'Support Tickets') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div>
                      <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Customer Name</label>
                      <input type="text" id="tkt-cust" class="form-control" placeholder="e.g. Jane Smith" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    </div>
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Subject</label>
                        <input type="text" id="tkt-subject" class="form-control" placeholder="e.g. Double charged" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Priority</label>
                        <select id="tkt-priority" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                          <option value="high">High</option>
                          <option value="medium" selected>Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                    </div>
                  </div>
                `;
                RSModal.open({
                  title: 'New Support Ticket',
                  sub: 'Log a customer issue',
                  icon: 'fa-headset',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Open Ticket</button>`,
                  onMount(tktModal, tktClose) {
                    tktModal.querySelector('[data-cancel]').onclick = tktClose;
                    tktModal.querySelector('[data-confirm]').onclick = async () => {
                      const customerName = tktModal.querySelector('#tkt-cust').value || 'Guest';
                      const subject = tktModal.querySelector('#tkt-subject').value || '';
                      if (!subject) return RS.toast('Subject is required', 'fa-circle-exclamation');
                      const priority = tktModal.querySelector('#tkt-priority').value || 'medium';

                      const tktNum = 'TKT-' + Date.now().toString().slice(-6);
                      const tktRow = { id: tktNum, ticketNumber: tktNum, subject, customerName, priority, status: 'open' };
                      tktClose();
                      if (RS.saveOne) {
                        await RS.saveOne('support_tickets', tktRow);
                        RS.toast('Support ticket opened successfully', 'fa-circle-check');
                        hubScreen('Support Tickets');
                      }
                    };
                  }
                });
              } else if (name === 'Offers & Coupons') {
                const formBody = `
                  <div style="display:flex;flex-direction:column;gap:12px">
                    <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Coupon Code</label>
                        <input type="text" id="off-code" class="form-control" placeholder="e.g. WELCOME100" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                      <div>
                        <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Description</label>
                        <input type="text" id="off-desc" class="form-control" placeholder="e.g. ₹100 discount" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                      </div>
                    </div>
                  </div>
                `;
                RSModal.open({
                  title: 'New Offer Coupon',
                  sub: 'Create a discount code',
                  icon: 'fa-tags',
                  size: 'sm',
                  body: formBody,
                  foot: `<button class="btn btn