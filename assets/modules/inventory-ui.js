/* ============================================================
   RestroSuite — Inventory stock/recipes UI (Wave 7 code-split)
   Extracted from dashboard.js — operates on RS.INVENTORY / RS.MENU.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  const _e = esc;
  function $(sel) {
    return document.querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }
  function getMenu() {
    return (global.RS && RS.MENU) || [];
  }
  function stockCls() {
    return (global.RS && RS.stockCls) || { ok: 'stock-ok', low: 'stock-low', out: 'stock-out' };
  }
  function nextLogicalNo(prefix) {
    if (global.RS && typeof RS.nextLogicalNo === 'function') return RS.nextLogicalNo(prefix);
    return prefix + '-' + Date.now().toString(36).toUpperCase();
  }
  function setOperationStatus(msg, state) {
    if (global.RS && typeof RS.setOperationStatus === 'function') return RS.setOperationStatus(msg, state);
  }
  function finishOperationStatus(msg, state) {
    if (global.RS && typeof RS.finishOperationStatus === 'function') return RS.finishOperationStatus(msg, state);
  }
  function getModalRoot() {
    if (global.RS && typeof RS.getModalRoot === 'function') return RS.getModalRoot();
    let root = document.getElementById('rs-modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'rs-modal-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function isLowStock(i) {
    return Number(i.stock) < Number(i.min);
  }
  function reorderQty(i) {
    const min = Math.max(0, Number(i.min) || 0);
    const stock = Math.max(0, Number(i.stock) || 0);
    return Math.max(1, Math.ceil(min * 2 - stock));
  }
  function lineValue(i, qty) {
    return Math.round(Math.max(0, Number(qty) || 0) * Math.max(0, Number(i.cost) || 0));
  }
  function lowStockItems() {
    return getInventory().filter(isLowStock);
  }
  function paintInventoryBadge() {
    const n = lowStockItems().length;
    global.__rsLowStockCount = n;
    document
      .querySelectorAll('.sidebar-link[data-tab="inventory-tab"], .mnav-link[data-tab="inventory-tab"]')
      .forEach((link) => {
        let badge = link.querySelector('.badge-count');
        if (!badge && n > 0) {
          badge = document.createElement('span');
          badge.className = 'badge-count';
          link.appendChild(badge);
        }
        if (badge) {
          badge.textContent = String(n);
          badge.style.display = n > 0 ? '' : 'none';
          badge.classList.toggle('badge-urgent', n > 0);
          badge.title = n ? n + ' below min stock' : '';
        }
      });
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') RS.updateTabAttentionBlinking();
    } catch (_) {}
  }
  function buildPoRowsFromLow(items) {
    const bySup = {};
    (items || []).forEach((i) => {
      const sup = (i.supplier || i.vendor || i.cat || 'General') + '';
      if (!bySup[sup]) bySup[sup] = [];
      bySup[sup].push(i);
    });
    const rows = [];
    Object.entries(bySup).forEach(([sup, list]) => {
      const lines = list.map((i) => {
        const qty = reorderQty(i);
        return {
          name: i.name,
          unit: i.unit || 'unit',
          qty,
          cost: Number(i.cost) || 0,
          value: lineValue(i, qty),
          stock: Number(i.stock) || 0,
          min: Number(i.min) || 0,
          invId: i.id,
        };
      });
      const value = lines.reduce((a, l) => a + l.value, 0);
      const slug = String(sup)
        .replace(/[^a-z0-9]+/gi, '')
        .slice(0, 4)
        .toUpperCase() || 'GEN';
      const poNum = nextLogicalNo('PO') + '-' + slug;
      rows.push({
        id: poNum,
        poNumber: poNum,
        supplier: /supplier/i.test(sup) ? sup : sup + ' Supplier',
        lines,
        items: lines.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(', '),
        value,
        date: new Date().toISOString(),
        status: 'pending',
        channel: 'auto_reorder',
      });
    });
    return rows;
  }
  async function savePurchaseOrder(poRow) {
    if (global.RS && typeof RS.saveOne === 'function') {
      return RS.saveOne('purchase_orders', poRow);
    }
    if (global.RS_DB && RS_DB.put) {
      return RS_DB.put('purchase_orders', poRow.id, poRow);
    }
    throw new Error('No save path for purchase orders');
  }
  function printPurchaseOrder(po) {
    const lines = (po.lines || [])
      .map(
        (l) =>
          `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed #ddd"><span>${esc(l.qty)} ${esc(l.unit)} · ${esc(l.name)}</span><span>${rs(l.value)}</span></div>`
      )
      .join('');
    const html = `<div style="max-width:360px;margin:0 auto;font-family:system-ui,sans-serif">
      <div style="text-align:center;font-weight:800;font-size:18px">PURCHASE ORDER</div>
      <div style="text-align:center;font-size:12px;color:#666;margin:4px 0 12px">${esc(po.poNumber || po.id)}</div>
      <div style="font-size:12px;margin-bottom:8px"><b>Supplier:</b> ${esc(po.supplier)}</div>
      <div style="font-size:12px;margin-bottom:10px"><b>Date:</b> ${esc(new Date(po.date || Date.now()).toLocaleString())}</div>
      ${lines || `<div style="font-size:13px">${esc(po.items || '')}</div>`}
      <div style="display:flex;justify-content:space-between;font-weight:800;margin-top:12px;font-size:15px"><span>Total</span><span>${rs(po.value)}</span></div>
      <div style="text-align:center;font-size:11px;color:#888;margin-top:14px">RestroSuite · ${esc(po.status || 'pending')}</div>
    </div>`;
    if (typeof global.RSPrint === 'function') global.RSPrint(html, 'PO ' + (po.poNumber || po.id));
    else if (global.RSPrintBridge && RSPrintBridge.printHtml) RSPrintBridge.printHtml(html, 'PO');
  }
  function exportLowStockCsv() {
    const low = lowStockItems();
    if (!low.length) {
      toast('No low-stock items to export', 'fa-circle-check');
      return;
    }
    const lines = [
      ['name', 'category', 'stock', 'min', 'unit', 'unit_cost', 'reorder_qty', 'est_value', 'supplier'].join(','),
    ];
    low.forEach((i) => {
      const qty = reorderQty(i);
      const row = [
        i.name,
        i.cat || '',
        i.stock,
        i.min,
        i.unit || '',
        i.cost || 0,
        qty,
        lineValue(i, qty),
        i.supplier || i.vendor || (i.cat ? i.cat + ' Supplier' : ''),
      ].map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"');
      lines.push(row.join(','));
    });
    const csv = lines.join('\n');
    const name = 'low-stock-' + new Date().toISOString().slice(0, 10) + '.csv';
    if (global.RS && typeof RS.downloadFile === 'function') {
      RS.downloadFile(csv, 'text/csv;charset=utf-8;', name);
    } else {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = name;
      a.click();
    }
    toast('Low-stock CSV · ' + low.length + ' items', 'fa-file-csv');
  }
  async function confirmAndDraftPos() {
    const lowItems = lowStockItems();
    if (!lowItems.length) return toast('All inventory levels are healthy', 'fa-circle-check');
    const drafts = buildPoRowsFromLow(lowItems);
    const totalVal = drafts.reduce((a, p) => a + (p.value || 0), 0);
    const preview = drafts
      .map(
        (p) =>
          `<div style="padding:10px 0;border-bottom:1px solid var(--stroke)">
            <div style="font-weight:800;font-size:13px">${esc(p.poNumber)} · ${esc(p.supplier)}</div>
            <div style="font-size:12px;color:var(--text-soft);margin-top:4px;line-height:1.45">${esc(p.items)}</div>
            <div style="font-size:12.5px;font-weight:700;color:var(--orange);margin-top:4px">${rs(p.value)}</div>
          </div>`
      )
      .join('');
    if (!global.RSModal) {
      // Fallback: draft without preview
      return executeDraftPos(drafts);
    }
    RSModal.open({
      title: 'Auto-draft purchase orders',
      sub: lowItems.length + ' low items · ' + drafts.length + ' PO(s) · ' + rs(totalVal),
      icon: 'fa-truck',
      size: 'md',
      body: `<div style="font-size:13px;color:var(--text-soft);margin-bottom:10px">Qty targets ~2× min level. Review and confirm to create pending POs.</div>
        <div style="max-height:320px;overflow:auto">${preview}</div>`,
      foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
        <button class="btn btn-ghost" style="flex:1" data-csv><i class="fa-solid fa-file-csv"></i> CSV only</button>
        <button class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-truck"></i> Create ${drafts.length} PO(s)</button>`,
      onMount(modal, close) {
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-csv]').onclick = () => {
          exportLowStockCsv();
        };
        modal.querySelector('[data-ok]').onclick = async () => {
          close();
          await executeDraftPos(drafts);
        };
      },
    });
  }
  async function executeDraftPos(drafts) {
    setOperationStatus('Creating purchase orders...');
    try {
      let n = 0;
      for (const po of drafts) {
        await savePurchaseOrder(po);
        n++;
      }
      finishOperationStatus('Drafted ' + n + ' PO(s)');
      toast(`Created ${n} purchase order${n === 1 ? '' : 's'}`, 'fa-truck');
      // Offer print / jump to Purchase orders
      if (drafts[0]) {
        setTimeout(() => {
          if (typeof global.__toast === 'function') {
            global.__toast('POs ready · tap to print first', 'fa-print', () => printPurchaseOrder(drafts[0]));
          }
        }, 400);
      }
      document.dispatchEvent(new CustomEvent('rs:render-inventory'));
      renderInventory();
      if (global.RS && RS.render) RS.render('inventory-tab');
    } catch (e) {
      console.warn('Auto-draft POs failed', e);
      finishOperationStatus('Auto-draft failed', 'error');
      toast('Could not create all POs', 'fa-circle-exclamation');
    }
  }

  function renderInventory() {
    const INVENTORY = getInventory();
    const MENU = getMenu();
    const cls = stockCls();

    const low = INVENTORY.filter(isLowStock);
    paintInventoryBadge();
    const banner = $('#inv-banner');
    if (banner) banner.style.display = low.length ? 'flex' : 'none';
    const lowCount = $('#inv-low-count');
    if (lowCount) lowCount.textContent = low.length;

    const btnAutoDraft = $('#btn-auto-draft-pos');
    if (btnAutoDraft) {
      btnAutoDraft.onclick = () => confirmAndDraftPos();
    }
    const btnCsv = $('#btn-export-low-stock');
    if (btnCsv) {
      btnCsv.onclick = () => exportLowStockCsv();
    }
    const btnCsv2 = $('#btn-export-low-stock-toolbar');
    if (btnCsv2) {
      btnCsv2.onclick = () => exportLowStockCsv();
    }

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
        filtered = filtered.filter((i) => i.cat && i.cat.toLowerCase() === catFilter);
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          return st === statusFilter;
        });
      }

      invBody.innerHTML = filtered
        .map((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          const pct = Math.min(100, Math.round((i.stock / (i.min * 2)) * 100));
          return `<tr>
          <td><b>${_e(i.name)}</b></td><td>${_e(i.cat)}</td>
          <td><div style="display:flex;align-items:center;gap:10px"><span class="td-strong" style="min-width:58px">${i.stock} ${_e(i.unit)}</span><div style="flex:1;height:6px;background:var(--glass-2);border-radius:99px;overflow:hidden;min-width:60px"><span style="display:block;height:100%;width:${pct}%;background:${st === 'out' ? 'var(--red)' : st === 'low' ? 'var(--amber)' : 'var(--green)'}"></span></div></div></td>
          <td>${i.min} ${_e(i.unit)}</td><td>${rs(i.cost)}/${_e(i.unit)}</td>
          <td><span class="stock-dot ${cls[st] || ''}">${st === 'out' ? 'Reorder' : st === 'low' ? 'Low' : 'Healthy'}</span></td>
          <td><div class="row-actions"><button class="icon-act go" title="Restock" aria-label="Restock ${_e(i.name)}"><i class="fa-solid fa-truck"></i></button><button class="icon-act" title="Edit" aria-label="Edit ${_e(i.name)}"><i class="fa-solid fa-pen"></i></button></div></td>
        </tr>`;
        })
        .join('');

      $$('#inv-table-body .icon-act.go').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const name = row.querySelector('b').textContent;
          const inv = INVENTORY.find((x) => x.name === name);
          if (!inv) return;
          const qtyToOrder = Math.max(1, Math.round(inv.min * 2 - inv.stock));
          const estimatedCost = Math.round(qtyToOrder * inv.cost);

          if (!global.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const body = `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="font-size:13px;color:var(--text-soft)">
                Create a purchase order to restock <b>${_e(inv.name)}</b> (current: ${inv.stock} ${_e(inv.unit)}, min: ${inv.min} ${_e(inv.unit)}).
              </div>
              <div class="form-grid-2" style="margin-top:8px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Order Qty (${_e(inv.unit)})</label>
                  <input type="number" id="po-qty" class="form-control" value="${qtyToOrder}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Supplier</label>
                  <input type="text" id="po-supplier" class="form-control" value="${_e(inv.cat)} Supplier Ltd." style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
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
                const poNum = nextLogicalNo('PO');
                const poRow = {
                  id: poNum,
                  poNumber: poNum,
                  supplier,
                  items: `${qty} ${inv.unit} ${inv.name}`,
                  value: Math.round(qty * inv.cost),
                  date: new Date().toISOString(),
                  status: 'pending',
                };
                close();
                setOperationStatus('Creating PO...');
                try {
                  if (global.RS && RS.saveOne) await RS.saveOne('purchase_orders', poRow);
                  finishOperationStatus('PO created');
                  toast('Purchase order raised successfully', 'fa-circle-check');
                  renderInventory();
                  if (global.RS && RS.render) RS.render('inventory-tab');
                } catch (e) {
                  console.warn('Failed to save PO', e);
                  finishOperationStatus('Failed to create PO', 'error');
                  toast('Failed to save purchase order -- saved locally', 'fa-circle-exclamation');
                }
              };
            },
          });
        });
      });

      $$('#inv-table-body .icon-act:not(.go)').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const name = row.querySelector('b').textContent;
          const inv = INVENTORY.find((x) => x.name === name);
          if (!inv) return;

          if (!global.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const body = `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div><label class="fl">Ingredient name</label><input class="form-input" id="edit-ing-name" value="${_e(inv.name)}"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Category</label><input class="form-input" id="edit-ing-cat" value="${_e(inv.cat || '')}"></div>
                <div><label class="fl">Unit</label><input class="form-input" id="edit-ing-unit" value="${_e(inv.unit || '')}"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Current stock</label><input class="form-input" id="edit-ing-stock" type="number" min="0" value="${inv.stock}"></div>
                <div><label class="fl">Min level (reorder at)</label><input class="form-input" id="edit-ing-min" type="number" min="0" value="${inv.min}"></div>
              </div>
              <div><label class="fl">Unit cost (${rs(1).replace(/[\d.,]/g, '').trim() || '₹'})</label><input class="form-input" id="edit-ing-cost" type="number" min="0" value="${inv.cost}"></div>
            </div>`;

          RSModal.open({
            title: 'Edit ingredient',
            sub: 'Update ' + inv.name,
            icon: 'fa-pen',
            size: 'sm',
            body,
            foot: `<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-danger" style="flex:0" data-delete title="Remove ingredient"><i class="fa-solid fa-trash"></i></button><button class="btn btn-primary" style="flex:1" data-confirm><i class="fa-solid fa-circle-check"></i> Save changes</button>`,
            onMount(modal, close) {
              modal.querySelector('[data-cancel]').onclick = close;
              modal.querySelector('[data-delete]').onclick = async () => {
                close();
                setOperationStatus('Removing ingredient...');
                try {
                  const idx = INVENTORY.findIndex((x) => x.id === inv.id);
                  if (idx > -1) INVENTORY.splice(idx, 1);
                  if (global.RS_DB) await RS_DB.del('inventory', inv.id);
                  finishOperationStatus('Ingredient removed');
                  toast(`${inv.name} removed from inventory`, 'fa-circle-check');
                  renderInventory();
                } catch (e) {
                  console.warn('Failed to remove ingredient', e);
                  finishOperationStatus('Failed to remove ingredient', 'error');
                  toast('Could not remove ingredient -- try again', 'fa-circle-exclamation');
                }
              };
              modal.querySelector('[data-confirm]').onclick = async () => {
                const newName = modal.querySelector('#edit-ing-name').value.trim();
                if (!newName) return toast('Enter ingredient name', 'fa-circle-exclamation');
                inv.name = newName;
                inv.cat = modal.querySelector('#edit-ing-cat').value.trim() || 'General';
                inv.unit = modal.querySelector('#edit-ing-unit').value.trim() || 'unit';
                inv.stock = +modal.querySelector('#edit-ing-stock').value || 0;
                inv.min = +modal.querySelector('#edit-ing-min').value || 0;
                inv.cost = +modal.querySelector('#edit-ing-cost').value || 0;
                close();
                setOperationStatus('Saving changes...');
                try {
                  if (global.RS_DB) await RS_DB.put('inventory', inv.id, inv);
                  finishOperationStatus('Ingredient updated');
                  toast(`${inv.name} updated`, 'fa-circle-check');
                  renderInventory();
                } catch (e) {
                  console.warn('Failed to save ingredient edit', e);
                  finishOperationStatus('Saved locally -- cloud sync pending', 'error');
                  toast('Saved locally. Cloud sync pending.', 'fa-circle-exclamation');
                  renderInventory();
                }
              };
            },
          });
        });
      });
    }

    const recipeBody = $('#recipe-table-body');
    if (recipeBody) {
      const invCost = (name) => {
        const inv = INVENTORY.find((x) => x.name === name);
        return inv ? inv.cost : 0;
      };
      recipeBody.innerHTML = MENU.length
        ? MENU.map((m) => {
            const ings = m.ingredients || [];
            const cost = ings.reduce((a, g) => a + g.qty * invCost(g.name), 0);
            const margin = m.price && cost ? Math.round((1 - cost / m.price) * 100) : m.price ? 100 : 0;
            const ingText = ings.length
              ? ings.map((g) => `${_e(g.qty)}${_e(g.unit)} ${_e(g.name)}`).join(', ')
              : '<span style="color:var(--text-mute)">No recipe -- click ✎ to define</span>';
            return `<tr>
            <td><div style="display:flex;align-items:center;gap:9px"><span class="veg ${m.veg ? '' : 'nonveg'}"></span><b>${_e(m.name)}</b></div></td>
            <td>${_e(m.cat)}</td>
            <td style="max-width:220px;font-size:12px">${ingText}</td>
            <td class="td-strong">${cost ? rs(cost) : '--'}</td>
            <td class="td-strong">${rs(m.price)}</td>
            <td><span class="stock-dot ${margin >= 50 ? 'stock-ok' : margin >= 20 ? 'stock-low' : 'stock-out'}">${cost ? margin + '%' : '--'}</span></td>
            <td><button class="icon-act go" data-recipe-edit="${_e(m.id)}" title="Define recipe"><i class="fa-solid fa-pen"></i></button></td>
          </tr>`;
          }).join('')
        : '<tr><td colspan="7" style="text-align:center;color:var(--text-mute);padding:30px">No menu items yet - add items in Menu Editor first</td></tr>';

      $$('#recipe-table-body [data-recipe-edit]').forEach((btn) => {
        btn.onclick = () => {
          if (global.RS && RS.activateTab) RS.activateTab('editor-tab');
          setTimeout(() => {
            const m = MENU.find((x) => String(x.id) === String(btn.dataset.recipeEdit));
            if (m && global.buildFormLoad) global.buildFormLoad(m);
          }, 200);
        };
      });
    }

    const bulkRecBtn = $('#btn-bulk-recipe-import');
    if (bulkRecBtn && !bulkRecBtn._wired) {
      bulkRecBtn._wired = true;
      bulkRecBtn.onclick = () => {
        const root = getModalRoot();
        const wrap = document.createElement('div');
        wrap.className = 'dash-modal active';
        wrap.innerHTML =
          '<div class="dm-card" style="max-width:520px">' +
          '<h3 style="margin:0 0 4px;font-size:17px">Bulk Import Recipes</h3>' +
          '<p style="margin:0 0 12px;color:var(--text-mute);font-size:12.5px">One ingredient per line: <b>Menu Item, Ingredient, Qty, Unit</b>. Items &amp; ingredients must already exist. Repeated item rows accumulate; existing recipes for listed items are replaced.</p>' +
          '<textarea id="bulk-rec-ta" rows="8" placeholder="Masala Dosa, Dosa Batter, 0.15, kg\nMasala Dosa, Potato, 0.1, kg" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:12.5px;padding:10px;border:1px solid var(--stroke-2);border-radius:8px;background:var(--panel);color:var(--text);resize:vertical"></textarea>' +
          '<div id="bulk-rec-out" style="font-size:12px;margin-top:8px;line-height:1.5"></div>' +
          '<div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-ghost" id="bulk-rec-cancel" style="flex:1">Cancel</button><button class="btn btn-primary" id="bulk-rec-go" style="flex:1"><i class="fa-solid fa-circle-check"></i> Import</button></div>' +
          '</div>';
        root.appendChild(wrap);
        const close = () => {
          try {
            root.removeChild(wrap);
          } catch (e) {}
        };
        wrap.querySelector('#bulk-rec-cancel').onclick = close;
        wrap.addEventListener('click', (e) => {
          if (e.target === wrap) close();
        });
        wrap.querySelector('#bulk-rec-go').onclick = async () => {
          const raw = (wrap.querySelector('#bulk-rec-ta').value || '').trim();
          const out = wrap.querySelector('#bulk-rec-out');
          if (!raw) {
            out.innerHTML = '<span style="color:var(--red)">Nothing to import.</span>';
            return;
          }
          const byItem = {};
          const errors = [];
          raw.split(/\r?\n/).forEach((line, idx) => {
            const t = line.trim();
            if (!t) return;
            const parts = t.split(',').map((s) => s.trim());
            if (parts.length < 3) {
              errors.push('Line ' + (idx + 1) + ': need Item, Ingredient, Qty, Unit');
              return;
            }
            const menuItem = MENU.find((m) => m.name.toLowerCase() === parts[0].toLowerCase());
            if (!menuItem) {
              errors.push('Line ' + (idx + 1) + ': item "' + _e(parts[0]) + '" not found');
              return;
            }
            const invItem = INVENTORY.find((i) => i.name.toLowerCase() === parts[1].toLowerCase());
            if (!invItem) {
              errors.push('Line ' + (idx + 1) + ': ingredient "' + _e(parts[1]) + '" not in inventory');
              return;
            }
            const qty = parseFloat(parts[2]);
            if (!(qty > 0)) {
              errors.push('Line ' + (idx + 1) + ': bad qty "' + _e(parts[2]) + '"');
              return;
            }
            (byItem[menuItem.id] = byItem[menuItem.id] || { m: menuItem, ings: [] }).ings.push({
              name: invItem.name,
              qty: qty,
              unit: parts[3] || invItem.unit || '',
            });
          });
          const ids = Object.keys(byItem);
          if (!ids.length) {
            out.innerHTML =
              '<span style="color:var(--red)">No valid rows.</span>' +
              (errors.length ? '<br>' + errors.slice(0, 6).join('<br>') : '');
            return;
          }
          let links = 0;
          ids.forEach((id) => {
            byItem[id].m.ingredients = byItem[id].ings;
            links += byItem[id].ings.length;
          });
          try {
            if (global.RS && RS.save) await RS.save('menu');
            toast('Recipes imported: ' + ids.length + ' item(s), ' + links + ' ingredient links', 'fa-circle-check');
            if (errors.length) {
              out.innerHTML =
                '<span style="color:var(--green)">Imported ' +
                ids.length +
                '.</span> <span style="color:var(--red)">' +
                errors.length +
                ' skipped:</span><br>' +
                errors.slice(0, 6).join('<br>');
            } else {
              close();
              renderInventory();
            }
          } catch (e) {
            console.warn('Recipe import save failed', e);
            out.innerHTML = '<span style="color:var(--red)">Save failed -- recipes were not saved. Try again.</span>';
            toast('Recipe import failed to save -- try again', 'fa-circle-exclamation');
          }
        };
      };
    }

    const seg = $('#inv-seg');
    if (seg && !seg.dataset.wired) {
      seg.dataset.wired = '1';
      const panels = { stock: '#inv-panel-stock', recipes: '#inv-panel-recipes', suppliers: '#inv-panel-suppliers' };
      seg.querySelectorAll('[data-inv-tab]').forEach((btn) => {
        btn.onclick = () => {
          seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          Object.values(panels).forEach((p) => {
            const el = $(p);
            if (el) el.style.display = 'none';
          });
          const panel = $(panels[btn.dataset.invTab]);
          if (panel) panel.style.display = '';
        };
      });
    }

    const addIngBtn = $('#btn-add-ingredient');
    if (addIngBtn && !addIngBtn.dataset.wired) {
      addIngBtn.dataset.wired = '1';
      addIngBtn.onclick = () => {
        if (!global.RSModal) return;
        RSModal.open({
          title: 'Add ingredient',
          sub: 'Add a raw material to inventory',
          icon: 'fa-cube',
          size: 'sm',
          body: `
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
          foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-circle-check"></i> Add ingredient</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = close;
            modal.querySelector('[data-ok]').onclick = async () => {
              const name = modal.querySelector('#add-ing-name').value.trim();
              if (!name) return toast('Enter ingredient name', 'fa-circle-exclamation');
              const item = {
                id: 'inv_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now(),
                name,
                cat: modal.querySelector('#add-ing-cat').value.trim() || 'General',
                unit: modal.querySelector('#add-ing-unit').value.trim() || 'unit',
                stock: +modal.querySelector('#add-ing-stock').value || 0,
                min: +modal.querySelector('#add-ing-min').value || 10,
                cost: +modal.querySelector('#add-ing-cost').value || 0,
              };
              INVENTORY.push(item);
              if (global.RS_DB) await RS_DB.put('inventory', item.id, item);
              close();
              renderInventory();
              toast(`${name} added to inventory`, 'fa-circle-check');
            };
          },
        });
      };
    }

    document.dispatchEvent(new CustomEvent('rs:render-inventory'));
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') {
        RS.updateTabAttentionBlinking();
      }
    } catch (e) {}
  }

  global.RSInventoryUI = {
    renderInventory,
    lowStockItems,
    exportLowStockCsv,
    confirmAndDraftPos,
    printPurchaseOrder,
    reorderQty,
    paintInventoryBadge,
  };

  function attachToRS() {
    if (!global.RS) return;
    global.RS.renderInventory = renderInventory;
    global.RS.exportLowStockCsv = exportLowStockCsv;
    global.RS.autoDraftPurchaseOrders = confirmAndDraftPos;
  }
  if (global.RS) attachToRS();
  document.addEventListener('rs:ready', attachToRS);
})(typeof window !== 'undefined' ? window : globalThis);
