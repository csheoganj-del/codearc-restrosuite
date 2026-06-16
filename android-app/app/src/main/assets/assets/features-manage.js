/* ============================================================
   RestroSuite — Inventory & Employees sub-tabs
   ============================================================ */
(function(){
  'use strict';
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    /* ---- segmented sub-tab controller ---- */
    function wireSeg(sectionSel, names){
      const sec = $(sectionSel); if(!sec || sec.dataset.segWired) return; sec.dataset.segWired='1';
      const segBtns = $$('.seg button', sec);
      segBtns.forEach((b,i)=> b.onclick=()=>{ segBtns.forEach(x=>x.classList.toggle('active',x===b)); $$('.subtab-pane', sec).forEach(p=>p.classList.toggle('active', p.dataset.pane===names[i])); });
    }

    /* ============== INVENTORY ============== */
    const SUPPLIERS = [];
    const POS_ORDERS = [];
    const WASTE = [];
    const poPill = {pending:'pill-amber',sent:'pill-violet',received:'pill-green'};

    function enhanceInventory(){
      const sec = $('#inventory-tab'); if(!sec || sec.dataset.enhanced) return; sec.dataset.enhanced='1';
      const stock = sec.querySelector('.panel'); if(stock){ stock.classList.add('subtab-pane','active'); stock.dataset.pane='stock'; }
      const panes = document.createElement('div');
      panes.id = 'inv-panes-wrapper';
      sec.appendChild(panes);

      function drawPanes() {
        panes.innerHTML = `
          <div class="panel panel-pad subtab-pane" data-pane="suppliers">
            <div class="panel-head"><h3>Suppliers</h3><button class="btn btn-primary btn-sm" id="add-sup"><i class="fa-solid fa-plus"></i> Add supplier</button></div>
            <div class="crm-grid">${SUPPLIERS.map(s=>`<div class="crm-card"><div class="crm-top"><div class="crm-av" style="background:${RS.avatarColors[s.name.length%RS.avatarColors.length]}"><i class="fa-solid fa-truck-field" style="font-size:15px"></i></div><div><div class="crm-name">${s.name}</div><div class="crm-phone">${s.cat}</div></div></div><div style="font-size:12.5px;color:var(--text-soft);line-height:1.9"><div><i class="fa-solid fa-phone" style="width:16px;color:var(--text-mute)"></i> ${s.contact}</div><div><i class="fa-solid fa-file-contract" style="width:16px;color:var(--text-mute)"></i> ${s.terms} · ${s.items} items</div><div><i class="fa-solid fa-star" style="width:16px;color:var(--amber)"></i> ${s.rating} rating</div></div></div>`).join('')}</div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="pos">
            <div class="panel-head"><h3>Purchase orders</h3><button class="btn btn-primary btn-sm" id="add-po"><i class="fa-solid fa-plus"></i> Raise PO</button></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>PO No.</th><th>Supplier</th><th>Items</th><th>Value</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            ${POS_ORDERS.map(p=>`<tr><td><b>${p.po}</b></td><td>${p.sup}</td><td>${p.items}</td><td class="td-strong">${rs(p.value)}</td><td>${p.date}</td><td><span class="pill ${poPill[p.status]}" style="padding:3px 9px;text-transform:capitalize">${p.status}</span></td><td><div class="row-actions"><button class="icon-act go" title="View"><i class="fa-solid fa-eye"></i></button><button class="icon-act" title="Print"><i class="fa-solid fa-print"></i></button></div></td></tr>`).join('')}
            </tbody></table></div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="waste">
            <div class="panel-head"><h3>Waste log</h3><div class="row" style="gap:8px"><span class="pill pill-red" style="padding:4px 11px">${rs(WASTE.reduce((a,w)=>a+w.cost,0))} lost</span><button class="btn btn-primary btn-sm" id="add-waste"><i class="fa-solid fa-plus"></i> Log waste</button></div></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Item</th><th>Quantity</th><th>Reason</th><th>Cost lost</th><th>When</th></tr></thead><tbody>
            ${WASTE.map(w=>`<tr><td><b>${w.item}</b></td><td>${w.qty}</td><td><span class="pill" style="padding:3px 9px">${w.reason}</span></td><td class="td-strong" style="color:var(--red)">${rs(w.cost)}</td><td>${w.date}</td></tr>`).join('')}
            </tbody></table></div>
          </div>`;
        const activeBtn = sec.querySelector('.seg button.active');
        if (activeBtn) {
          const tabName = activeBtn.textContent.trim().toLowerCase();
          const paneMap = { stock: 'stock', suppliers: 'suppliers', 'purchase orders': 'pos', 'waste log': 'waste' };
          const activePane = paneMap[tabName] || 'stock';
          $$('.subtab-pane', sec).forEach(p => p.classList.toggle('active', p.dataset.pane === activePane));
        }
        ['add-sup','add-po','add-waste'].forEach(id=>{ const b=$('#'+id); if(b) b.onclick=()=>RS.toast('Opening form…','fa-plus'); });
      }

      // Load from DB
      if (window.RS_DB) {
        Promise.all([RS_DB.list('vendors'), RS_DB.list('purchase_orders')]).then(([vRows, poRows]) => {
          if (vRows && vRows.length) {
            SUPPLIERS.length = 0;
            vRows.forEach(r => {
              SUPPLIERS.push({
                name: r.name,
                cat: r.category,
                contact: r.contact,
                terms: r.terms,
                rating: r.rating,
                items: r.itemsCount
              });
            });
          }

          if (poRows && poRows.length) {
            POS_ORDERS.length = 0;
            poRows.forEach(r => {
              POS_ORDERS.push({
                po: r.poNumber,
                sup: r.supplier,
                items: r.items,
                value: r.value,
                status: r.status,
                date: r.date ? new Date(r.date).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '—'
              });
            });
          }
          drawPanes();
        }).catch(e => {
          console.warn("Failed loading vendors/purchase orders from DB", e);
          drawPanes();
        });
      } else {
        drawPanes();
      }

      wireSeg('#inventory-tab', ['stock','suppliers','pos','waste']);
    }

    /* ============== EMPLOYEES ============== */
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const shiftFor = (i,d)=>{ const pat=[['M','M','M','O','M','M','M'],['M','E','M','E','M','E','O'],['E','E','O','E','E','E','E'],['D','D','D','D','D','O','D'],['E','M','E','M','E','E','O'],['M','M','E','E','M','O','M']][i%6][d]; return pat; };
    const shiftName = {M:'Morning',E:'Evening',D:'Full day',O:'Off'};
    const shiftCls = {M:'pill-amber',E:'pill-violet',D:'pill-green',O:''};
    const ATT = (RS.EMPLOYEES||[]).map((e,i)=>({name:e.name,role:e.role,rc:e.rc,inT:['9:02','9:00','12:58','8:45','13:10','9:30'][i%6],outT:['—','18:05','22:10','17:30','—','18:00'][i%6],status:['present','present','present','present','late','present'][i%6]}));
    const PAY = (RS.EMPLOYEES||[]).map((e,i)=>{ const base=[28000,18000,15000,16000,18000,15000][i%6]; const inc=[6000,2200,1800,1200,2400,1500][i%6]; const ded=[1200,600,500,540,600,500][i%6]; return {name:e.name,role:e.role,rc:e.rc,base,inc,ded,net:base+inc-ded}; });
    const attPill = {present:'pill-green',late:'pill-amber',absent:'pill-red'};

    function enhanceEmployees(){
      const sec = $('#employees-tab'); if(!sec || sec.dataset.enhanced) return; sec.dataset.enhanced='1';
      const grid = sec.querySelector('#emp-grid'); if(grid){ grid.classList.add('subtab-pane','active'); grid.dataset.pane='directory'; }
      const panes = document.createElement('div');
      panes.id = 'emp-panes-wrapper';
      sec.appendChild(panes);

      function drawPanes() {
        panes.innerHTML = `
          <div class="panel panel-pad subtab-pane" data-pane="roster">
            <div class="panel-head"><h3>Weekly shift roster</h3><button class="btn btn-primary btn-sm"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-schedule</button></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>
            ${(RS.EMPLOYEES||[]).map((e,i)=>`<tr><td><b>${e.name}</b><div style="font-size:11px;color:var(--text-mute)">${e.role}</div></td>${DAYS.map((d,di)=>{const s=shiftFor(i,di);return `<td>${s==='O'?'<span style="color:var(--text-faint);font-size:12px">Off</span>':`<span class="pill ${shiftCls[s]}" style="padding:3px 8px;font-size:11px">${shiftName[s]}</span>`}</td>`;}).join('')}</tr>`).join('')}
            </tbody></table></div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="attendance">
            <div class="panel-head"><h3>Today’s attendance</h3><span class="pill pill-green" style="padding:4px 11px">${ATT.filter(a=>a.status!=='absent').length}/${ATT.length} present</span></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Clock in</th><th>Clock out</th><th>Status</th></tr></thead><tbody>
            ${ATT.map(a=>`<tr><td><b>${a.name}</b></td><td><span class="role-tag ${a.rc}">${a.role}</span></td><td class="td-strong">${a.inT}</td><td>${a.outT}</td><td><span class="pill ${attPill[a.status]}" style="padding:3px 9px;text-transform:capitalize">${a.status}</span></td></tr>`).join('')}
            </tbody></table></div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="payroll">
            <div class="panel-head"><h3>Payroll · June 2026</h3><button class="btn btn-primary btn-sm"><i class="fa-solid fa-money-check-dollar"></i> Run payroll</button></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Base</th><th>Incentive</th><th>Deductions</th><th>Net pay</th></tr></thead><tbody>
            ${PAY.map(p=>`<tr><td><b>${p.name}</b></td><td><span class="role-tag ${p.rc}">${p.role}</span></td><td>${rs(p.base)}</td><td style="color:var(--green)">+${rs(p.inc)}</td><td style="color:var(--red)">– ${rs(p.ded)}</td><td class="td-strong">${rs(p.net)}</td></tr>`).join('')}
            <tr><td colspan="5" style="text-align:right"><b style="color:var(--text)">Total payout</b></td><td><b style="color:var(--orange);font-size:15px">${rs(PAY.reduce((a,p)=>a+p.net,0))}</b></td></tr>
            </tbody></table></div>
          </div>`;
        const activeBtn = sec.querySelector('.seg button.active');
        if (activeBtn) {
          const tabName = activeBtn.textContent.trim().toLowerCase();
          const paneMap = { directory: 'directory', roster: 'roster', attendance: 'attendance', payroll: 'payroll' };
          const activePane = paneMap[tabName] || 'directory';
          $$('.subtab-pane', sec).forEach(p => p.classList.toggle('active', p.dataset.pane === activePane));
        }
      }

      // Load from DB
      if (window.RS_DB) {
        RS_DB.list('attendance').then(rows => {
          if (rows && rows.length) {
            ATT.length = 0;
            rows.forEach(r => {
              const emp = (RS.EMPLOYEES||[]).find(e => e.id === r.employeeId) || {};
              ATT.push({
                name: r.employeeName || emp.name || 'Unknown',
                role: emp.role || 'Staff',
                rc: emp.rc || 'r-waiter',
                inT: r.clockInTime || '—',
                outT: r.clockOutTime || '—',
                status: r.status || 'present'
              });
            });
          }
          drawPanes();
        }).catch(e => {
          console.warn("Failed to load attendance", e);
          drawPanes();
        });
      } else {
        drawPanes();
      }

      wireSeg('#employees-tab', ['directory','roster','attendance','payroll']);
    }

    enhanceInventory();
    enhanceEmployees();
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
