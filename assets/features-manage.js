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

      document.addEventListener('rs:render-inventory', drawPanes);

      function openRecipeEditModal(m) {
        let draft = (m.ingredients || []).map(g => ({ ...g }));
        
        function drawDraft(modalBody) {
          const listEl = modalBody.querySelector('#rec-modal-list');
          listEl.innerHTML = draft.map((g, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;font-weight:600;font-size:14px">${g.name}</span>
              <input class="form-input" type="number" step="any" min="0" value="${g.qty}" data-qty-i="${i}" style="width:80px;padding:5px 8px;font-size:13px;text-align:right">
              <span style="width:40px;color:var(--text-mute);font-size:12.5px">${g.unit}</span>
              <button class="icon-act danger" data-del-i="${i}" style="width:30px;height:30px"><i class="fa-solid fa-trash"></i></button>
            </div>
          `).join('') || `<div style="text-align:center;padding:20px 0;color:var(--text-mute);font-style:italic">No ingredients in recipe. Click Add to link.</div>`;
          
          listEl.querySelectorAll('[data-qty-i]').forEach(inp => {
            inp.oninput = () => {
              const idx = +inp.dataset.qtyI;
              draft[idx].qty = Number(inp.value) || 0;
            };
          });
          
          listEl.querySelectorAll('[data-del-i]').forEach(btn => {
            btn.onclick = () => {
              const idx = +btn.dataset.delI;
              draft.splice(idx, 1);
              drawDraft(modalBody);
            };
          });
        }

        RSModal.open({
          title: `Recipe: ${m.name}`,
          sub: 'Define raw materials and quantities',
          icon: 'fa-flask',
          size: 'md',
          body: `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div id="rec-modal-list" style="max-height:260px;overflow:auto"></div>
              <button class="btn btn-ghost btn-block" id="rec-modal-add" style="border-style:dashed"><i class="fa-solid fa-plus"></i> Add Ingredient</button>
            </div>
          `,
          foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-circle-check"></i> Save Recipe</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = close;
            modal.querySelector('#rec-modal-add').onclick = () => {
              const list = RS.INVENTORY || [];
              RSModal.open({
                title: 'Add ingredient',
                sub: 'Link a raw material to this recipe',
                icon: 'fa-flask',
                size: 'sm',
                body: `<input class="form-input" id="ing-q" placeholder="Search ingredient…" style="margin-bottom:12px">
                      <div id="ing-pick" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto"></div>`,
                onMount(subModal, subClose) {
                  const q = subModal.querySelector('#ing-q'), box = subModal.querySelector('#ing-pick');
                  function draw() {
                    const t = (q.value || '').toLowerCase();
                    box.innerHTML = list.filter(i => i.name.toLowerCase().includes(t)).map(i => `<div class="sr-item" data-n="${i.name}" data-u="${i.unit}"><span class="si-ic"><i class="fa-solid fa-cube"></i></span><div><div class="si-t">${i.name}</div><div class="si-s">${i.cat} · ${rs(i.cost)}/${i.unit}</div></div><span class="si-meta">+ add</span></div>`).join('') || '<div class="sr-empty">No match</div>';
                    box.querySelectorAll('[data-n]').forEach(el => {
                      el.onclick = () => {
                        const exists = draft.find(g => g.name === el.dataset.n);
                        if (!exists) {
                          draft.push({ name: el.dataset.n, qty: 0.1, unit: el.dataset.u });
                        }
                        subClose();
                        drawDraft(modal);
                      };
                    });
                  }
                  q.addEventListener('input', draw);
                  draw();
                  q.focus();
                }
              });
            };
            
            modal.querySelector('[data-ok]').onclick = async () => {
              m.ingredients = draft;
              if (RS.saveOne) await RS.saveOne('menu', m);
              close();
              drawPanes();
              RS.toast(`Recipe for "${m.name}" updated`, 'fa-circle-check');
            };
            
            drawDraft(modal);
          }
        });
      }

      function drawPanes() {
        panes.innerHTML = `
          <div class="panel panel-pad subtab-pane" data-pane="recipes">
            <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;">
              <h3>Menu Recipes</h3>
              <div style="font-size:12.5px;color:var(--text-soft)">Link raw ingredients to menu items for stock deduction</div>
            </div>
            <div class="table-scroll"><table class="data-table">
              <thead><tr><th>Menu Item</th><th>Category</th><th>Plate Cost</th><th>Linked Ingredients</th><th>Actions</th></tr></thead>
              <tbody id="recipe-list-body"></tbody>
            </table></div>
          </div>
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

        const recipeListBody = $('#recipe-list-body', panes);
        if (recipeListBody) {
          recipeListBody.innerHTML = (RS.MENU || []).map(m => {
            const ings = m.ingredients || [];
            const cost = ings.reduce((sum, g) => {
              const inv = (RS.INVENTORY || []).find(i => i.name === g.name);
              return sum + (g.qty * (inv ? inv.cost : 0));
            }, 0);
            return `
              <tr data-id="${m.id}">
                <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg?'':'nonveg'}"></span><b>${m.name}</b></div></td>
                <td>${m.cat}</td>
                <td class="td-strong">${rs(cost)}</td>
                <td>
                  ${ings.length 
                    ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${ings.map(g => `<span class="pill" style="font-size:11.5px;padding:2px 7px;background:var(--hover);border-color:var(--border)">${g.name} (${g.qty} ${g.unit})</span>`).join('')}</div>`
                    : `<span style="color:var(--text-mute);font-style:italic">No ingredients linked</span>`
                  }
                </td>
                <td>
                  <button class="btn btn-ghost btn-sm" data-edit-rec="${m.id}" style="padding:4px 10px;font-size:12px;gap:4px;"><i class="fa-solid fa-flask"></i> Edit Recipe</button>
                </td>
              </tr>`;
          }).join('');

          recipeListBody.querySelectorAll('[data-edit-rec]').forEach(b => {
            b.onclick = () => {
              const m = RS.MENU.find(x => x.id === +b.dataset.editRec);
              if (m) {
                openRecipeEditModal(m);
              }
            };
          });
        }

        const activeBtn = sec.querySelector('.seg button.active');
        if (activeBtn) {
          const tabName = activeBtn.textContent.trim().toLowerCase();
          const paneMap = { stock: 'stock', recipes: 'recipes', suppliers: 'suppliers', 'purchase orders': 'pos', 'waste log': 'waste' };
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

      wireSeg('#inventory-tab', ['stock','recipes','suppliers','pos','waste']);
    }

    /* ============== EMPLOYEES ============== */
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const shiftFor = (i,d)=>{ const pat=[['M','M','M','O','M','M','M'],['M','E','M','E','M','E','O'],['E','E','O','E','E','E','E'],['D','D','D','D','D','O','D'],['E','M','E','M','E','E','O'],['M','M','E','E','M','O','M']][i%6][d]; return pat; };
    const shiftName = {M:'Morning',E:'Evening',D:'Full day',O:'Off'};
    const shiftCls = {M:'pill-amber',E:'pill-violet',D:'pill-green',O:''};
    let ATT = [];
    let PAY = [];
    const attPill = {present:'pill-green',late:'pill-amber',absent:'pill-red'};

    function enhanceEmployees(){
      const sec = $('#employees-tab'); if(!sec || sec.dataset.enhanced) return; sec.dataset.enhanced='1';
      const grid = sec.querySelector('#emp-grid'); if(grid){ grid.classList.add('subtab-pane','active'); grid.dataset.pane='directory'; }
      const panes = document.createElement('div');
      panes.id = 'emp-panes-wrapper';
      sec.appendChild(panes);

      document.addEventListener('rs:render-employees', () => {
        // Redraw on employees update
        if (RS.EMPLOYEES) {
          ATT.length = 0;
          RS.EMPLOYEES.forEach((e,i)=>{
            ATT.push({
              name:e.name,role:e.role,rc:e.rc,
              inT:['9:02','9:00','12:58','8:45','13:10','9:30'][i%6],
              outT:['—','18:05','22:10','17:30','—','18:00'][i%6],
              status:['present','present','present','present','late','present'][i%6]
            });
          });
        }
        drawPanes();
      });

      function drawPanes() {
        const currentEmployees = RS.EMPLOYEES || [];

        if (ATT.length === 0 && currentEmployees.length > 0) {
          currentEmployees.forEach((e,i)=>{
            ATT.push({
              name:e.name,role:e.role,rc:e.rc,
              inT:['9:02','9:00','12:58','8:45','13:10','9:30'][i%6],
              outT:['—','18:05','22:10','17:30','—','18:00'][i%6],
              status:['present','present','present','present','late','present'][i%6]
            });
          });
        }

        const currentPay = currentEmployees.map((e,i)=>{
          const base=[28000,18000,15000,16000,18000,15000][i%6];
          const inc=[6000,2200,1800,1200,2400,1500][i%6];
          const ded=[1200,600,500,540,600,500][i%6];
          return {name:e.name,role:e.role,rc:e.rc,base,inc,ded,net:base+inc-ded};
        });

        panes.innerHTML = `
          <div class="panel panel-pad subtab-pane" data-pane="roster">
            <div class="panel-head"><h3>Weekly shift roster</h3><button class="btn btn-primary btn-sm"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-schedule</button></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th>${DAYS.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>
            ${currentEmployees.map((e,i)=>`<tr><td><b>${e.name}</b><div style="font-size:11px;color:var(--text-mute)">${e.role}</div></td>${DAYS.map((d,di)=>{const s=shiftFor(i,di);return `<td>${s==='O'?'<span style="color:var(--text-faint);font-size:12px">Off</span>':`<span class="pill ${shiftCls[s]}" style="padding:3px 8px;font-size:11px">${shiftName[s]}</span>`}</td>`;}).join('')}</tr>`).join('')}
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
            ${currentPay.map(p=>`<tr><td><b>${p.name}</b></td><td><span class="role-tag ${p.rc}">${p.role}</span></td><td>${rs(p.base)}</td><td style="color:var(--green)">+${rs(p.inc)}</td><td style="color:var(--red)">– ${rs(p.ded)}</td><td class="td-strong">${rs(p.net)}</td></tr>`).join('')}
            <tr><td colspan="5" style="text-align:right"><b style="color:var(--text)">Total payout</b></td><td><b style="color:var(--orange);font-size:15px">${rs(currentPay.reduce((a,p)=>a+p.net,0))}</b></td></tr>
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
