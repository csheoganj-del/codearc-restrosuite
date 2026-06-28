/* ============================================================
   RestroSuite -- Inventory & Employees sub-tabs
   ============================================================ */
(function(){
  'use strict';
  // HTML escaping -- prevents XSS when inserting DB-sourced strings into innerHTML
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
                body: `<input class="form-input" id="ing-q" placeholder="Search ingredient..." style="margin-bottom:12px">
                      <div id="ing-pick" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto"></div>`,
                onMount(subModal, subClose) {
                  const q = subModal.querySelector('#ing-q'), box = subModal.querySelector('#ing-pick');
                  function draw() {
                    const t = (q.value || '').toLowerCase();
                    box.innerHTML = list.filter(i => i.name.toLowerCase().includes(t)).map(i => `<div class="sr-item" data-n="${esc(i.name)}" data-u="${esc(i.unit)}"><span class="si-ic"><i class="fa-solid fa-cube"></i></span><div><div class="si-t">${esc(i.name)}</div><div class="si-s">${esc(i.cat)} · ${rs(i.cost)}/${esc(i.unit)}</div></div><span class="si-meta">+ add</span></div>`).join('') || '<div class="sr-empty">No match</div>';
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
                <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg?'':'nonveg'}"></span><b>${esc(m.name)}</b></div></td>
                <td>${esc(m.cat)}</td>
                <td class="td-strong">${rs(cost)}</td>
                <td>
                  ${ings.length 
                    ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${ings.map(g => `<span class="pill" style="font-size:11.5px;padding:2px 7px;background:var(--hover);border-color:var(--border)">${esc(g.name)} (${esc(g.qty)} ${esc(g.unit)})</span>`).join('')}</div>`
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
              const m = RS.MENU.find(x => String(x.id) === String(b.dataset.editRec));
              if (m) {
                openRecipeEditModal(m);
              }
            };
          });
        }

        const btnAddSup = $('#add-sup');
        if (btnAddSup) {
          btnAddSup.onclick = () => {
            if (!window.RSModal) return RS.toast('Modal utility not available', 'fa-circle-exclamation');
            const body = `
              <div style="display:flex;flex-direction:column;gap:12px">
                <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Supplier Name</label>
                    <input type="text" id="sup-name" class="form-control" placeholder="e.g. Fresh Veggies Ltd." style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Category</label>
                    <input type="text" id="sup-cat" class="form-control" placeholder="e.g. Vegetables" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                </div>
                <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Contact Email/Phone</label>
                    <input type="text" id="sup-contact" class="form-control" placeholder="e.g. contact@fresh.com" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Payment Terms</label>
                    <input type="text" id="sup-terms" class="form-control" value="Net 30" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Rating (1-5)</label>
                  <select id="sup-rating" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                    <option value="4" selected>⭐⭐⭐⭐ (4)</option>
                    <option value="3">⭐⭐⭐ (3)</option>
                    <option value="2">⭐⭐ (2)</option>
                    <option value="1">⭐ (1)</option>
                  </select>
                </div>
              </div>
            `;
            RSModal.open({
              title: 'Add New Supplier',
              sub: 'Register a wholesale vendor',
              icon: 'fa-truck',
              size: 'sm',
              body,
              foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Add Supplier</button>`,
              onMount(modal, close) {
                modal.querySelector('[data-cancel]').onclick = close;
                modal.querySelector('[data-confirm]').onclick = async () => {
                  const name = modal.querySelector('#sup-name').value || '';
                  if (!name) return RS.toast('Supplier name is required', 'fa-circle-exclamation');
                  const category = modal.querySelector('#sup-cat').value || 'General';
                  const contact = modal.querySelector('#sup-contact').value || '';
                  const terms = modal.querySelector('#sup-terms').value || 'Net 30';
                  const rating = Number(modal.querySelector('#sup-rating').value) || 4;

                  const supId = 'sup_' + Date.now().toString().slice(-6);
                  const newSup = { id: supId, name, category, contact, terms, rating, itemsCount: 0 };
                  close();
                  if (RS.saveOne) {
                    await RS.saveOne('vendors', newSup);
                    RS.toast('Supplier added successfully', 'fa-circle-check');
                    if (RS.render) RS.render('inventory-tab');
                  }
                };
              }
            });
          };
        }

        const btnAddPo = $('#add-po');
        if (btnAddPo) {
          btnAddPo.onclick = () => {
            if (!window.RSModal) return RS.toast('Modal utility not available', 'fa-circle-exclamation');
            const supplierOptions = SUPPLIERS.map(s => `<option value="${s.name}">${s.name}</option>`).join('') || `<option value="General Supplier">General Supplier Ltd.</option>`;
            const body = `
              <div style="display:flex;flex-direction:column;gap:12px">
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Select Supplier</label>
                  <select id="po-add-supplier" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    ${supplierOptions}
                  </select>
                </div>
                <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Items Description</label>
                    <input type="text" id="po-add-items" class="form-control" placeholder="e.g. 50kg Sugar, 20L Oil" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Total Value (₹)</label>
                    <input type="number" id="po-add-value" class="form-control" value="1000" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                </div>
              </div>
            `;
            RSModal.open({
              title: 'Raise Purchase Order',
              sub: 'Draft a new supply order',
              icon: 'fa-file-invoice',
              size: 'sm',
              body,
              foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-plus"></i> Raise PO</button>`,
              onMount(modal, close) {
                modal.querySelector('[data-cancel]').onclick = close;
                modal.querySelector('[data-confirm]').onclick = async () => {
                  const supplier = modal.querySelector('#po-add-supplier').value || 'General Supplier';
                  const items = modal.querySelector('#po-add-items').value || 'Supply items';
                  const value = Number(modal.querySelector('#po-add-value').value) || 0;

                  const poNum = 'PO-' + Date.now().toString().slice(-6);
                  const newPo = {
                    id: poNum,
                    poNumber: poNum,
                    supplier,
                    items,
                    value,
                    date: new Date().toISOString(),
                    status: 'pending'
                  };
                  close();
                  if (RS.saveOne) {
                    await RS.saveOne('purchase_orders', newPo);
                    RS.toast('Purchase order raised successfully', 'fa-circle-check');
                    if (RS.render) RS.render('inventory-tab');
                  }
                };
              }
            });
          };
        }

        const btnAddWaste = $('#add-waste');
        if (btnAddWaste) {
          btnAddWaste.onclick = () => {
            if (!window.RSModal) return RS.toast('Modal utility not available', 'fa-circle-exclamation');
            const body = `
              <div style="display:flex;flex-direction:column;gap:12px">
                <div class="form-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Ingredient/Item</label>
                    <input type="text" id="waste-item" class="form-control" placeholder="e.g. Tomato" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                  <div>
                    <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Quantity Wasted</label>
                    <input type="text" id="waste-qty" class="form-control" placeholder="e.g. 2 kg" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                  </div>
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Reason for Waste</label>
                  <select id="waste-reason" class="form-control" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                    <option value="Spoiled">Spoiled / Expired</option>
                    <option value="Dropped">Dropped / Spilled</option>
                    <option value="Incorrect prep">Incorrect preparation</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            `;
            RSModal.open({
              title: 'Log Kitchen Waste',
              sub: 'Track inventory loss and spoilage',
              icon: 'fa-trash-can',
              size: 'sm',
              body,
              foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="fa-solid fa-circle-check"></i> Log Loss</button>`,
              onMount(modal, close) {
                modal.querySelector('[data-cancel]').onclick = close;
                modal.querySelector('[data-confirm]').onclick = () => {
                  const item = modal.querySelector('#waste-item').value || '';
                  if (!item) return RS.toast('Item name is required', 'fa-circle-exclamation');
                  const qty = modal.querySelector('#waste-qty').value || '';
                  const reason = modal.querySelector('#waste-reason').value || '';
                  close();
                  RS.toast(`Logged waste: ${qty} of ${item} (${reason})`, 'fa-circle-check');
                };
              }
            });
          };
        }

        const activeBtn = sec.querySelector('.seg button.active');
        if (activeBtn) {
          const tabName = activeBtn.textContent.trim().toLowerCase();
          const paneMap = { stock: 'stock', recipes: 'recipes', suppliers: 'suppliers', 'purchase orders': 'pos', 'waste log': 'waste' };
          const activePane = paneMap[tabName] || 'stock';
          $$('.subtab-pane', sec).forEach(p => p.classList.toggle('active', p.dataset.pane === activePane));
        }
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
                date: r.date ? new Date(r.date).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : '--'
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
              outT:['--','18:05','22:10','17:30','--','18:00'][i%6],
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
              outT:['--','18:05','22:10','17:30','--','18:00'][i%6],
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
            <div class="panel-head"><h3>Today's attendance</h3><span class="pill pill-green" style="padding:4px 11px">${ATT.filter(a=>a.status!=='absent').length}/${ATT.length} present</span></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Clock in</th><th>Clock out</th><th>Status</th></tr></thead><tbody>
            ${ATT.map(a=>`<tr><td><b>${a.name}</b></td><td><span class="role-tag ${a.rc}">${a.role}</span></td><td class="td-strong">${a.inT}</td><td>${a.outT}</td><td><span class="pill ${attPill[a.status]}" style="padding:3px 9px;text-transform:capitalize">${a.status}</span></td></tr>`).join('')}
            </tbody></table></div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="payroll">
            <div class="panel-head"><h3>Payroll · June 2026</h3><button class="btn btn-primary btn-sm"><i class="fa-solid fa-money-check-dollar"></i> Run payroll</button></div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Base</th><th>Incentive</th><th>Deductions</th><th>Net pay</th></tr></thead><tbody>
            ${currentPay.map(p=>`<tr><td><b>${p.name}</b></td><td><span class="role-tag ${p.rc}">${p.role}</span></td><td>${rs(p.base)}</td><td style="color:var(--green)">+${rs(p.inc)}</td><td style="color:var(--red)">- ${rs(p.ded)}</td><td class="td-strong">${rs(p.net)}</td></tr>`).join('')}
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
                inT: r.clockInTime || '--',
                outT: r.clockOutTime || '--',
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

      wireSeg('#employees-tab', ['directory','roster','attendance','payroll','logins']);

      // -- Staff Logins subtab ----------------------------------------------
      const STAFF_ROLES = [
        { key:'manager',   label:'Manager',           color:'#7c3aed', icon:'fa-user-tie'     },
        { key:'cashier',   label:'Cashier',           color:'#0891b2', icon:'fa-cash-register' },
        { key:'waiter',    label:'Waiter',            color:'#059669', icon:'fa-utensils'      },
        { key:'captain',   label:'Captain',           color:'#2563eb', icon:'fa-star'          },
        { key:'kitchen',   label:'Kitchen Staff',     color:'#dc2626', icon:'fa-fire-burner'   },
        { key:'inventory', label:'Inventory Manager', color:'#b45309', icon:'fa-boxes-stacked' },
      ];

      // Cache for loaded staff users
      let staffUsers = [];
      let staffUsage = {};

      async function loadStaffUsers() {
        const loginPane = sec.querySelector('[data-pane="logins"]');
        if (!loginPane) return;
        if (!window.RS_API || !RS_API.staffUsers) {
          loginPane.innerHTML = '<div class="sr-empty">Staff account management requires cloud mode.</div>';
          return;
        }
        loginPane.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-mute)"><i class="fa-solid fa-spinner fa-spin"></i> Loading staff accounts...</div>';
        try {
          const res = await RS_API.staffUsers({ action: 'list_users' });
          staffUsers = res.users || [];
          staffUsage = res.usage || {};
          renderStaffLogins(loginPane);
        } catch(e) {
          loginPane.innerHTML = `<div class="sr-empty" style="color:var(--red)"><i class="fa-solid fa-circle-exclamation"></i> ${e.message}</div>`;
        }
      }

      function renderStaffLogins(loginPane) {
        const used = staffUsage.active_staff || staffUsers.length;
        const max  = staffUsage.max_staff || '--';
        loginPane.innerHTML = `
          <div class="panel-head" style="margin-bottom:16px">
            <div>
              <h3>Staff Login Accounts</h3>
              <div style="font-size:12px;color:var(--text-mute);margin-top:2px">${used} of ${max} accounts used</div>
            </div>
            <button class="btn btn-primary btn-sm" id="sl-add-btn"><i class="fa-solid fa-user-plus"></i> Add staff account</button>
          </div>
          ${staffUsers.length === 0
            ? `<div class="sr-empty">No staff accounts yet. Add one to let staff log in with their own credentials.</div>`
            : `<div class="table-scroll"><table class="data-table">
                <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
                <tbody>
                ${staffUsers.map((u,i) => {
                  const rd = STAFF_ROLES.find(r=>r.key===u.role) || { label: u.role, color:'#888', icon:'fa-user' };
                  const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : 'Never';
                  return `<tr>
                    <td><b>${safe(u.display_name || u.username)}</b></td>
                    <td style="font-family:monospace;font-size:13px;color:var(--text-soft)">${safe(u.username)}</td>
                    <td><span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:${rd.color}"><i class="fa-solid ${rd.icon}"></i>${rd.label}</span></td>
                    <td><span class="pill ${u.status==='active'?'pill-green':'pill-red'}" style="padding:2px 9px;font-size:11px">${u.status}</span></td>
                    <td style="font-size:12px;color:var(--text-mute)">${lastLogin}</td>
                    <td>
                      <div style="display:flex;gap:6px;justify-content:flex-end">
                        <button class="btn btn-ghost btn-sm sl-edit-btn" data-idx="${i}" title="Edit role / status"><i class="fa-solid fa-pen"></i></button>
                        <button class="icon-act sl-pwd-btn" data-idx="${i}" title="Reset password"><i class="fa-solid fa-key"></i></button>
                        <button class="icon-act ${u.status==='active'?'danger':''} sl-toggle-btn" data-idx="${i}" data-status="${u.status}" title="${u.status==='active'?'Suspend':'Reactivate'}">
                          <i class="fa-solid ${u.status==='active'?'fa-ban':'fa-circle-check'}"></i>
                        </button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
                </tbody>
              </table></div>`
          }`;

        // -- Add account --
        loginPane.querySelector('#sl-add-btn')?.addEventListener('click', () => openAddStaffModal(loginPane));

        // -- Edit role/status --
        loginPane.querySelectorAll('.sl-edit-btn').forEach(b => b.addEventListener('click', () => openEditStaffModal(loginPane, +b.dataset.idx)));

        // -- Reset password --
        loginPane.querySelectorAll('.sl-pwd-btn').forEach(b => b.addEventListener('click', () => openResetPwdModal(loginPane, +b.dataset.idx)));

        // -- Suspend / reactivate --
        loginPane.querySelectorAll('.sl-toggle-btn').forEach(b => b.addEventListener('click', async () => {
          const u = staffUsers[+b.dataset.idx];
          const newStatus = b.dataset.status === 'active' ? 'suspended' : 'active';
          const verb = newStatus === 'suspended' ? 'Suspend' : 'Reactivate';
          if (!confirm(`${verb} account for ${u.display_name || u.username}?`)) return;
          try {
            await RS_API.staffUsers({ action:'update_user', user_id:u.id, status:newStatus });
            RS.toast(`${u.display_name || u.username} ${newStatus}`, newStatus==='active'?'fa-circle-check':'fa-ban');
            loadStaffUsers();
          } catch(e) { RS.toast(e.message,'fa-circle-exclamation'); }
        }));
      }

      function openAddStaffModal(loginPane) {
        const body = `
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="form-group">
              <label class="form-label">Display name</label>
              <input id="sl-dname" class="form-control" placeholder="e.g. Ravi Kumar" autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-label">Username <span style="color:var(--text-mute);font-size:11px">(staff will type this to log in)</span></label>
              <input id="sl-uname" class="form-control" placeholder="e.g. ravi.kumar" autocomplete="off" style="font-family:monospace">
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="sl-role-grid">
                ${STAFF_ROLES.map(r=>`
                  <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:9px;border:1px solid var(--stroke-2);cursor:pointer;background:var(--glass)" class="sl-role-opt">
                    <input type="radio" name="sl-role" value="${r.key}" style="display:none">
                    <i class="fa-solid ${r.icon}" style="color:${r.color};font-size:13px;width:16px;text-align:center"></i>
                    <span style="font-size:13px;font-weight:600">${r.label}</span>
                  </label>`).join('')}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Temporary password <span style="color:var(--text-mute);font-size:11px">(min 10 chars -- share with staff)</span></label>
              <input id="sl-pwd" class="form-control" type="text" placeholder="e.g. Welcome@2025" autocomplete="new-password">
            </div>
            <div id="sl-add-err" style="color:var(--red);font-size:12.5px;display:none"></div>
          </div>`;

        if (!window.RSModal) {
          const name = prompt('Display name?'); if (!name) return;
          const uname = prompt('Username?'); if (!uname) return;
          const roleIdx = prompt('Role:\n'+STAFF_ROLES.map((r,i)=>`${i+1}. ${r.label}`).join('\n')+'\nEnter number:');
          const role = STAFF_ROLES[parseInt(roleIdx,10)-1]?.key; if (!role) return;
          const pwd = prompt('Temporary password (min 10 chars)?'); if (!pwd || pwd.length < 10) return;
          RS_API.staffUsers({ action:'create_user', display_name:name, username:uname, role, password:pwd })
            .then(() => { RS.toast(`${name} added`,'fa-user-plus'); loadStaffUsers(); })
            .catch(e => alert(e.message));
          return;
        }

        RSModal.open({
          title:'Add staff account', icon:'fa-user-plus', body,
          foot:`<button class="btn btn-ghost" id="sl-cancel-add">Cancel</button>
                <button class="btn btn-primary" id="sl-confirm-add"><i class="fa-solid fa-user-plus"></i> Create account</button>`,
          onOpen: el => {
            // Role picker highlight
            el.querySelectorAll('.sl-role-opt').forEach(opt => {
              opt.addEventListener('click', () => {
                el.querySelectorAll('.sl-role-opt').forEach(o => { o.style.borderColor=''; o.style.background='var(--glass)'; });
                opt.style.borderColor='var(--orange)'; opt.style.background='var(--orange-tint)';
                opt.querySelector('input').checked = true;
              });
            });
            el.querySelector('#sl-cancel-add').onclick = () => RSModal.close();
            el.querySelector('#sl-confirm-add').onclick = async () => {
              const errEl = el.querySelector('#sl-add-err');
              const name  = el.querySelector('#sl-dname').value.trim();
              const uname = el.querySelector('#sl-uname').value.trim();
              const role  = el.querySelector('input[name="sl-role"]:checked')?.value;
              const pwd   = el.querySelector('#sl-pwd').value;
              if (!name)  { errEl.textContent='Display name is required.'; errEl.style.display='block'; return; }
              if (!uname) { errEl.textContent='Username is required.'; errEl.style.display='block'; return; }
              if (!role)  { errEl.textContent='Select a role.'; errEl.style.display='block'; return; }
              if (pwd.length < 10) { errEl.textContent='Password must be at least 10 characters.'; errEl.style.display='block'; return; }
              const btn = el.querySelector('#sl-confirm-add');
              btn.disabled = true; btn.textContent = 'Creating...';
              try {
                await RS_API.staffUsers({ action:'create_user', display_name:name, username:uname, role, password:pwd });
                RSModal.close();
                RS.toast(`${name} account created`,'fa-user-plus');
                loadStaffUsers();
              } catch(e) {
                errEl.textContent = e.message; errEl.style.display='block';
                btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-user-plus"></i> Create account';
              }
            };
          }
        });
      }

      function openEditStaffModal(loginPane, idx) {
        const u = staffUsers[idx]; if (!u) return;
        const curRole = u.role;
        const body = `
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="form-group">
              <label class="form-label">Display name</label>
              <input id="sle-dname" class="form-control" value="${safe(u.display_name||u.username)}">
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                ${STAFF_ROLES.map(r=>`
                  <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:9px;border:1px solid ${r.key===curRole?'var(--orange)':'var(--stroke-2)'};cursor:pointer;background:${r.key===curRole?'var(--orange-tint)':'var(--glass)'}" class="sl-role-opt">
                    <input type="radio" name="sle-role" value="${r.key}" ${r.key===curRole?'checked':''} style="display:none">
                    <i class="fa-solid ${r.icon}" style="color:${r.color};font-size:13px;width:16px;text-align:center"></i>
                    <span style="font-size:13px;font-weight:600">${r.label}</span>
                  </label>`).join('')}
              </div>
            </div>
            <div id="sle-err" style="color:var(--red);font-size:12.5px;display:none"></div>
          </div>`;

        if (!window.RSModal) {
          const newRole = prompt('Role:\n'+STAFF_ROLES.map((r,i)=>`${i+1}. ${r.label}`).join('\n')+'\nEnter number:');
          const role = STAFF_ROLES[parseInt(newRole,10)-1]?.key; if (!role) return;
          RS_API.staffUsers({ action:'update_user', user_id:u.id, role })
            .then(() => { RS.toast('Role updated','fa-user-check'); loadStaffUsers(); })
            .catch(e => alert(e.message));
          return;
        }

        RSModal.open({
          title:`Edit -- ${u.display_name||u.username}`, icon:'fa-user-gear', body,
          foot:`<button class="btn btn-ghost" id="sle-cancel">Cancel</button>
                <button class="btn btn-primary" id="sle-save"><i class="fa-solid fa-check"></i> Save changes</button>`,
          onOpen: el => {
            el.querySelectorAll('.sl-role-opt').forEach(opt => {
              opt.addEventListener('click', () => {
                el.querySelectorAll('.sl-role-opt').forEach(o => { o.style.borderColor=''; o.style.background='var(--glass)'; });
                opt.style.borderColor='var(--orange)'; opt.style.background='var(--orange-tint)';
                opt.querySelector('input').checked = true;
              });
            });
            el.querySelector('#sle-cancel').onclick = () => RSModal.close();
            el.querySelector('#sle-save').onclick = async () => {
              const errEl = el.querySelector('#sle-err');
              const dname = el.querySelector('#sle-dname').value.trim();
              const role  = el.querySelector('input[name="sle-role"]:checked')?.value;
              if (!dname) { errEl.textContent='Name required.'; errEl.style.display='block'; return; }
              if (!role)  { errEl.textContent='Select a role.'; errEl.style.display='block'; return; }
              try {
                await RS_API.staffUsers({ action:'update_user', user_id:u.id, role, display_name:dname });
                RSModal.close(); RS.toast('Staff account updated','fa-user-check'); loadStaffUsers();
              } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
            };
          }
        });
      }

      function openResetPwdModal(loginPane, idx) {
        const u = staffUsers[idx]; if (!u) return;
        const body = `
          <div style="display:flex;flex-direction:column;gap:14px">
            <div style="font-size:13px;color:var(--text-soft)">Set a new temporary password for <b>${safe(u.display_name||u.username)}</b>. Share it with them -- they can change it after login.</div>
            <div class="form-group">
              <label class="form-label">New password <span style="color:var(--text-mute);font-size:11px">(min 10 chars)</span></label>
              <input id="slp-pwd" class="form-control" type="text" placeholder="e.g. NewPass@2025" autocomplete="new-password">
            </div>
            <div id="slp-err" style="color:var(--red);font-size:12.5px;display:none"></div>
          </div>`;

        if (!window.RSModal) {
          const pwd = prompt('New password (min 10 chars)?'); if (!pwd || pwd.length < 10) return;
          RS_API.staffUsers({ action:'reset_password', user_id:u.id, password:pwd })
            .then(() => RS.toast('Password reset','fa-key'))
            .catch(e => alert(e.message));
          return;
        }

        RSModal.open({
          title:`Reset password -- ${u.display_name||u.username}`, icon:'fa-key', body,
          foot:`<button class="btn btn-ghost" id="slp-cancel">Cancel</button>
                <button class="btn btn-primary" id="slp-confirm"><i class="fa-solid fa-key"></i> Reset password</button>`,
          onOpen: el => {
            el.querySelector('#slp-cancel').onclick = () => RSModal.close();
            el.querySelector('#slp-confirm').onclick = async () => {
              const errEl = el.querySelector('#slp-err');
              const pwd = el.querySelector('#slp-pwd').value;
              if (pwd.length < 10) { errEl.textContent='Min 10 characters.'; errEl.style.display='block'; return; }
              try {
                await RS_API.staffUsers({ action:'reset_password', user_id:u.id, password:pwd });
                RSModal.close(); RS.toast('Password reset successfully','fa-key');
              } catch(e) { errEl.textContent=e.message; errEl.style.display='block'; }
            };
          }
        });
      }

      // Load staff logins when that subtab becomes active
      sec.addEventListener('click', e => {
        const btn = e.target.closest('.seg button');
        if (btn && btn.textContent.trim().toLowerCase() === 'logins') {
          setTimeout(() => loadStaffUsers(), 50);
        }
      });
    }

    enhanceInventory();
    enhanceEmployees();
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
