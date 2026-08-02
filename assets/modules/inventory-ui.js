/* ============================================================
   RestroSuite — Inventory stock/recipes UI (Wave 7 code-split)
   Extracted from dashboard.js — operates on RS.INVENTORY / RS.MENU.
   ============================================================ */
(function (global) {
  'use strict';

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
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
    if (global.RS && typeof RS.nextLogicalNo === 'function') {return RS.nextLogicalNo(prefix);}
    return prefix + '-' + Date.now().toString(36).toUpperCase();
  }
  function setOperationStatus(msg, state) {
    if (global.RS && typeof RS.setOperationStatus === 'function') {return RS.setOperationStatus(msg, state);}
  }
  function finishOperationStatus(msg, state) {
    if (global.RS && typeof RS.finishOperationStatus === 'function') {return RS.finishOperationStatus(msg, state);}
  }
  function getModalRoot() {
    if (global.RS && typeof RS.getModalRoot === 'function') {return RS.getModalRoot();}
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

  /** Pretty label for keys like hoagie_roll → Hoagie roll */
  function displayInvName(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) {return '—';}
    if (!/[_-]/.test(s) && !/^[a-z0-9]+$/i.test(s)) {return s;}
    // Only auto-prettify snake/kebab or all-lowercase keys
    if (/[A-Z]/.test(s) && !/[_-]/.test(s) && s.includes(' ')) {return s;}
    return s
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function invMatchKey(i) {
    return String((i && (i.id || i.name || i.key)) || '');
  }

  function findInvByRow(row) {
    if (!row) {return null;}
    const id = row.getAttribute('data-inv-id');
    const list = getInventory();
    if (id) {
      const byId = list.find((x) => String(x.id) === id || String(x.name) === id || String(x.key) === id);
      if (byId) {return byId;}
    }
    const name = row.querySelector('b') && row.querySelector('b').textContent;
    if (!name) {return null;}
    return list.find(
      (x) =>
        x.name === name ||
        displayInvName(x.name) === name ||
        String(x.key || '').replace(/[_-]+/g, ' ') === name.toLowerCase()
    );
  }

  function rebuildCatFilterOptions(inventory) {
    const sel = $('#inv-cat-filter');
    if (!sel) {return;}
    const prev = sel.value || 'All';
    const cats = Array.from(
      new Set(
        (inventory || [])
          .map((i) => String(i.cat || i.category || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const opts = ['All'].concat(cats);
    sel.innerHTML = opts
      .map((c) => `<option value="${esc(c)}">${esc(c === 'All' ? 'All' : c)}</option>`)
      .join('');
    if (opts.some((c) => String(c).toLowerCase() === String(prev).toLowerCase())) {
      // restore previous selection (case-insensitive)
      const match = opts.find((c) => String(c).toLowerCase() === String(prev).toLowerCase());
      sel.value = match || 'All';
    } else {
      sel.value = 'All';
    }
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
    const nLow = lowStockItems().length;
    let nExp = 0;
    try {
      if (global.RSInventoryBatches && RSInventoryBatches.listExpiring) {
        nExp = RSInventoryBatches.listExpiring(RSInventoryBatches.NEAR_DAYS || 3).length;
      }
    } catch (_) {}
    const n = nLow + nExp;
    global.__rsLowStockCount = nLow;
    global.__rsNearExpiryCount = nExp;
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
          const bits = [];
          if (nLow) {bits.push(nLow + ' low stock');}
          if (nExp) {bits.push(nExp + ' near expiry');}
          badge.title = bits.join(' · ') || '';
        }
      });
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') {RS.updateTabAttentionBlinking();}
    } catch (_) {}
  }

  function paintExpiryBanner() {
    let bar = document.getElementById('inv-expiry-banner');
    if (!bar) {
      const stockPanel = document.getElementById('inv-panel-stock');
      const host = stockPanel && stockPanel.parentElement;
      if (!host) {return;}
      bar = document.createElement('div');
      bar.id = 'inv-expiry-banner';
      bar.className = 'banner warn inv-expiry-banner';
      bar.style.display = 'none';
      host.insertBefore(bar, stockPanel);
    }
    const Batches = global.RSInventoryBatches;
    if (!Batches || !Batches.listExpiring) {
      bar.style.display = 'none';
      return;
    }
    const list = Batches.listExpiring(Batches.NEAR_DAYS || 3);
    if (!list.length) {
      bar.style.display = 'none';
      return;
    }
    const preview = list
      .slice(0, 4)
      .map((b) => {
        const label =
          b.daysLeft < 0
            ? 'EXPIRED'
            : b.daysLeft === 0
              ? 'today'
              : b.daysLeft === 1
                ? 'tomorrow'
                : b.daysLeft + 'd';
        return `<b>${esc(b.prettyName || b.ingredientName)}</b> ${esc(String(b.qty))} ${esc(b.unit || '')} (${label})`;
      })
      .join(' · ');
    bar.style.display = 'flex';
    bar.innerHTML = `
      <i class="fa-solid fa-clock"></i>
      <div style="flex:1;min-width:0">
        <b>${list.length} batch${list.length === 1 ? '' : 'es'} near expiry</b>
        — use these first (FEFO). ${preview}${list.length > 4 ? '…' : ''}
      </div>
      <button type="button" class="btn btn-ghost btn-sm banner-cta" id="btn-show-expiring">View</button>`;
    const btn = bar.querySelector('#btn-show-expiring');
    if (btn)
      {btn.onclick = () => {
        openExpiringModal(list);
      };}
  }

  function openExpiringModal(list) {
    if (!global.RSModal) {
      toast(
        list
          .slice(0, 5)
          .map((b) => (b.prettyName || '') + ' ' + (b.daysLeft < 0 ? 'expired' : b.daysLeft + 'd'))
          .join(', '),
        'fa-clock'
      );
      return;
    }
    const rows = (list || [])
      .map((b) => {
        const when =
          b.daysLeft < 0
            ? '<span style="color:var(--red);font-weight:700">Expired</span>'
            : b.daysLeft === 0
              ? '<span style="color:var(--amber);font-weight:700">Today</span>'
              : b.daysLeft + ' day' + (b.daysLeft === 1 ? '' : 's');
        const exp =
          global.RSInventoryBatches && RSInventoryBatches.formatShort
            ? RSInventoryBatches.formatShort(b.expiryDate)
            : b.expiryDate || '—';
        return `<tr>
          <td><b>${esc(b.prettyName || b.ingredientName || b.ingredientKey)}</b></td>
          <td>${esc(String(b.qty))} ${esc(b.unit || '')}</td>
          <td>${esc(exp)}</td>
          <td>${when}</td>
          <td style="font-size:12px;color:var(--text-soft)">Use this batch first</td>
        </tr>`;
      })
      .join('');
    RSModal.open({
      title: 'Use first — near expiry',
      sub: 'FEFO: kitchen should consume these batches before fresher stock',
      icon: 'fa-clock',
      size: 'md',
      body: `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Ingredient</th><th>Qty</th><th>Expiry</th><th>In</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:20px">None</td></tr>'}</tbody>
      </table></div>`,
      foot: '<button type="button" class="btn btn-primary" data-ok style="flex:1">Got it</button>',
      onMount(m, close) {
        const ok = m.querySelector('[data-ok]');
        if (ok) {ok.onclick = close;}
      },
    });
  }

  function openBatchesModal(inv) {
    if (!inv || !global.RSModal) {return;}
    const Batches = global.RSInventoryBatches;
    const list =
      Batches && Batches.batchesForItem ? Batches.batchesForItem(inv) : [];
    const rows = list
      .map((b, i) => {
        const d = Batches.daysUntil(b.expiryDate);
        const exp = Batches.formatShort(b.expiryDate) || 'No date';
        const tag =
          d == null
            ? '<span class="pill" style="padding:2px 8px">No expiry</span>'
            : d < 0
              ? '<span class="pill pill-red" style="padding:2px 8px">Expired · use/waste</span>'
              : d <= (Batches.NEAR_DAYS || 3)
                ? '<span class="pill pill-amber" style="padding:2px 8px">Use first</span>'
                : '<span class="pill pill-green" style="padding:2px 8px">OK</span>';
        return `<tr>
          <td style="font-weight:700">${i === 0 && d != null ? '① ' : ''}${esc(String(b.qty))} ${esc(b.unit || inv.unit || '')}</td>
          <td>${esc(exp)}</td>
          <td>${tag}</td>
          <td style="font-size:11.5px;color:var(--text-mute)">${esc(b.source || 'batch')}</td>
        </tr>`;
      })
      .join('');
    RSModal.open({
      title: 'Batches · ' + (inv.name || ''),
      sub: 'Soonest expiry is used first when stock is deducted (FEFO)',
      icon: 'fa-boxes-stacked',
      size: 'md',
      body: list.length
        ? `<div class="table-scroll"><table class="data-table">
            <thead><tr><th>Qty</th><th>Expiry</th><th>Priority</th><th>Source</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <p style="margin:12px 0 0;font-size:12.5px;color:var(--text-soft)">Total on batches: <b>${list.reduce((a, b) => a + (Number(b.qty) || 0), 0)}</b> · Book stock: <b>${Number(inv.stock) || 0}</b> ${esc(inv.unit || '')}</p>`
        : `<div class="sr-empty" style="padding:28px 12px">
            <div style="font-weight:700;margin-bottom:6px">No batches yet</div>
            <div style="font-size:13px;color:var(--text-soft);max-width:340px;margin:0 auto">
              Receive a purchase order with an <b>expiry date</b>, or restock with expiry, to create batches.
            </div>
          </div>`,
      foot: '<button type="button" class="btn btn-primary" data-ok style="flex:1">Close</button>',
      onMount(m, close) {
        const ok = m.querySelector('[data-ok]');
        if (ok) {ok.onclick = close;}
      },
    });
  }
  function buildPoRowsFromLow(items) {
    const bySup = {};
    (items || []).forEach((i) => {
      const sup = (i.supplier || i.vendor || i.cat || 'General') + '';
      if (!bySup[sup]) {bySup[sup] = [];}
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
    if (typeof global.RSPrint === 'function') {global.RSPrint(html, 'PO ' + (po.poNumber || po.id));}
    else if (global.RSPrintBridge && RSPrintBridge.printHtml) {RSPrintBridge.printHtml(html, 'PO');}
  }
  function unitCostOf(i) {
    return Math.max(0, Number(i && (i.cost != null ? i.cost : i.unit_cost)) || 0);
  }
  function stockValueOf(i) {
    return Math.round(unitCostOf(i) * Math.max(0, Number(i && i.stock) || 0) * 100) / 100;
  }
  function missingCostItems() {
    return getInventory().filter((i) => !(unitCostOf(i) > 0));
  }
  async function persistInvCost(inv, newCost) {
    inv.cost = Math.max(0, Number(newCost) || 0);
    // Keep alias for older payloads / exports
    inv.unit_cost = inv.cost;
    if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
    else if (global.RS && RS.saveOne) {await RS.saveOne('inventory', inv);}
  }

  /**
   * Quick set unit cost — links this stock item to plate cost / margin / PO value.
   */
  function openSetCostModal(inv, opts) {
    opts = opts || {};
    if (!inv || !global.RSModal) {return;}
    const unit = inv.unit || 'unit';
    const cur = unitCostOf(inv);
    const stock = Math.max(0, Number(inv.stock) || 0);
    RSModal.open({
      title: 'Unit cost · ' + displayInvName(inv.name),
      sub: 'Every stock item should have a cost — used for plate cost, margin & stock value',
      icon: 'fa-indian-rupee-sign',
      size: 'sm',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <p style="margin:0;font-size:13.5px;line-height:1.5;color:var(--text-soft)">
            What do you pay for <b>1 ${esc(unit)}</b> of <b>${esc(displayInvName(inv.name))}</b>?
            Recipes use this to show plate cost when a dish is sold.
          </p>
          <div>
            <label class="fl">Cost per ${esc(unit)} (₹)</label>
            <input class="form-input" id="set-cost-val" type="number" min="0" step="any" value="${cur || ''}" placeholder="e.g. 80">
          </div>
          <div class="inv-cost-preview" id="set-cost-preview">
            Stock value now: <b>${rs(stockValueOf(inv))}</b>
            ${stock ? ` · ${stock} ${esc(unit)} × unit cost` : ''}
          </div>
          ${
            opts.showNext
              ? '<p style="margin:0;font-size:12px;color:var(--text-mute)">After save we can open the next item still missing cost.</p>'
              : ''
          }
        </div>`,
      foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
        <button type="button" class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-link"></i> Save cost</button>`,
      onMount(modal, close) {
        const inp = modal.querySelector('#set-cost-val');
        const prev = modal.querySelector('#set-cost-preview');
        const refresh = () => {
          const c = Math.max(0, Number(inp.value) || 0);
          const val = Math.round(c * stock * 100) / 100;
          prev.innerHTML =
            'Stock value: <b>' +
            rs(val) +
            '</b>' +
            (stock ? ' · ' + stock + ' ' + esc(unit) + ' × ' + rs(c) : '');
        };
        inp.addEventListener('input', refresh);
        modal.querySelector('[data-x]').onclick = close;
        modal.querySelector('[data-ok]').onclick = async () => {
          const c = Math.max(0, Number(inp.value) || 0);
          if (!(c > 0)) {
            try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
            toast('Enter a unit cost greater than 0', 'fa-circle-exclamation');
            inp.focus();
            return;
          }
          try {
            await persistInvCost(inv, c);
            try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
            toast(displayInvName(inv.name) + ' · cost ' + rs(c) + '/' + unit + ' linked', 'fa-link');
            close();
            renderInventory();
            if (opts.showNext) {
              const next = missingCostItems().find((x) => String(x.id) !== String(inv.id));
              if (next) {setTimeout(() => openSetCostModal(next, { showNext: true }), 280);}
            }
          } catch (e) {
            console.warn(e);
            toast('Could not save cost', 'fa-circle-exclamation');
          }
        };
        setTimeout(() => {
          inp.focus();
          inp.select();
        }, 80);
      },
    });
  }

  function openMissingCostsWizard() {
    const list = missingCostItems();
    if (!list.length) {
      toast('All stock items already have a unit cost', 'fa-circle-check');
      return;
    }
    openSetCostModal(list[0], { showNext: true });
  }

  function paintCostBanner() {
    let bar = document.getElementById('inv-cost-tip');
    const missing = missingCostItems();
    const totalVal = getInventory().reduce((a, i) => a + stockValueOf(i), 0);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'inv-cost-tip';
      bar.className = 'banner warn inv-cost-banner';
      bar.style.display = 'none';
      bar.setAttribute('role', 'status');
      const stockPanel = document.getElementById('inv-panel-stock');
      const host = stockPanel && stockPanel.parentElement;
      if (host) {
        const linkTip = document.getElementById('inv-link-tip');
        if (linkTip && linkTip.parentElement === host) {host.insertBefore(bar, linkTip.nextSibling);}
        else if (stockPanel) {host.insertBefore(bar, stockPanel);}
        else {host.appendChild(bar);}
      }
    }
    if (!getInventory().length) {
      bar.style.display = 'none';
      return;
    }
    if (missing.length) {
      bar.style.display = 'flex';
      bar.className = 'banner warn inv-cost-banner';
      bar.innerHTML = `<i class="fa-solid fa-indian-rupee-sign"></i>
        <div style="flex:1"><b>${missing.length} stock item${missing.length === 1 ? '' : 's'}</b> have no unit cost (₹0).
        Link a cost so recipes can show plate cost &amp; margin. Stock value so far: <b>${rs(totalVal)}</b>.
        <button type="button" class="btn btn-primary btn-sm" id="inv-cost-set-all" style="margin-left:8px">Set costs</button>
        <button type="button" class="btn btn-ghost btn-sm" id="inv-cost-filter">Show ₹0 only</button></div>`;
      const a = bar.querySelector('#inv-cost-set-all');
      const b = bar.querySelector('#inv-cost-filter');
      if (a) {a.onclick = () => openMissingCostsWizard();}
      if (b)
        {b.onclick = () => {
          toast('Amber rows = missing cost — click ₹0 · set cost on each row', 'fa-circle-info');
          const row = document.querySelector('#inv-table-body .inv-cost-btn.is-zero');
          if (row) {row.scrollIntoView({ block: 'center', behavior: 'smooth' });}
        };}
    } else {
      bar.style.display = 'flex';
      bar.className = 'banner inv-cost-banner inv-cost-banner-ok';
      bar.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--green)"></i>
        <div style="flex:1">All stock items have unit cost linked · total stock value <b>${rs(totalVal)}</b></div>
        <button type="button" class="btn btn-ghost btn-sm" id="inv-cost-dismiss">OK</button>`;
      const d = bar.querySelector('#inv-cost-dismiss');
      if (d)
        {d.onclick = () => {
          bar.style.display = 'none';
          try {
            if (global.sessionStorage) {sessionStorage.setItem('rs_inv_cost_ok_hide', '1');}
          } catch (_) {}
        };}
      try {
        if (global.sessionStorage && sessionStorage.getItem('rs_inv_cost_ok_hide') === '1') {
          bar.style.display = 'none';
        }
      } catch (_) {}
    }
  }

  function exportLowStockCsv() {
    const low = lowStockItems();
    if (!low.length) {
      toast('No low-stock items to export', 'fa-circle-check');
      return;
    }
    const prog =
      global.RSProgress &&
      RSProgress.open({
        title: 'Exporting low stock…',
        sub: 'Building reorder CSV',
        total: low.length,
        unit: 'items',
      });
    try {
      const lines = [
        ['name', 'category', 'stock', 'min', 'unit', 'unit_cost', 'reorder_qty', 'est_value', 'supplier'].join(','),
      ];
      low.forEach((i, idx) => {
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
        if (prog) {
          prog.update({
            done: idx + 1,
            current: i.name || 'Item',
            sub:
              'Writing ' +
              (idx + 1) +
              ' of ' +
              low.length +
              ' · ' +
              Math.max(0, low.length - idx - 1) +
              ' remaining',
          });
        }
      });
      const csv = '\uFEFF' + lines.join('\n');
      const name = 'low-stock-' + new Date().toISOString().slice(0, 10) + '.csv';
      if (global.RS && typeof RS.downloadFile === 'function') {
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', name);
      } else {
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = name;
        a.click();
      }
      if (prog) {
        prog.succeed('Low-stock CSV · ' + low.length + ' items');
        prog.close(900);
      }
      toast('Low-stock CSV · ' + low.length + ' items', 'fa-file-csv');
    } catch (e) {
      if (prog) {
        prog.fail(e.message || 'Export failed');
        prog.close(2200);
      }
      toast('Low-stock export failed', 'fa-circle-exclamation');
    }
  }
  async function confirmAndDraftPos() {
    const lowItems = lowStockItems();
    if (!lowItems.length) {return toast('All inventory levels are healthy', 'fa-circle-check');}
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
      try { if (window.RSActionFeedback) {window.RSActionFeedback.success();} } catch(_) {}
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
      if (global.RS && RS.render) {RS.render('inventory-tab');}
    } catch (e) {
      console.warn('Auto-draft POs failed', e);
      finishOperationStatus('Auto-draft failed', 'error');
      try { if (window.RSActionFeedback) {window.RSActionFeedback.error();} } catch(_) {}
      toast('Could not create all POs', 'fa-circle-exclamation');
    }
  }

  function renderInventory() {
    const INVENTORY = getInventory();
    const MENU = getMenu();
    const cls = stockCls();
    const Batches = global.RSInventoryBatches;

    // Pre-hydrate empty stock → skeleton table (not a false empty store)
    try {
      if (
        global.RSSkel &&
        RSSkel.shouldShow &&
        RSSkel.shouldShow(INVENTORY && INVENTORY.length > 0)
      ) {
        const invBody = $('#inv-table-body');
        if (invBody && RSSkel.dataTable) {
          RSSkel.paint(invBody, RSSkel.dataTable({ rows: 8, cols: 6 }));
        }
        return;
      }
    } catch (_) {}

    // Ensure batches loaded then re-paint once (near-expiry banner / FEFO labels)
    if (Batches && typeof Batches.loadBatches === 'function' && !renderInventory._batchWarm) {
      renderInventory._batchWarm = true;
      Batches.loadBatches(true)
        .then(() => {
          try {
            renderInventory();
          } catch (_) {}
        })
        .catch(() => {});
    }

    const low = INVENTORY.filter(isLowStock);
    paintInventoryBadge();
    paintExpiryBanner();
    try {
      paintCostBanner();
    } catch (_) {}
    // Naive-user tip on stock: recipes still missing
    try {
      const tip = document.getElementById('inv-link-tip');
      if (tip) {
        const menu = (global.RS && RS.MENU) || [];
        const missing = menu.filter((m) => !Array.isArray(m.ingredients) || !m.ingredients.length).length;
        if (missing > 0 && menu.length) {
          tip.style.display = 'flex';
          tip.innerHTML = `<i class="fa-solid fa-link"></i>
            <div style="flex:1"><b>Next:</b> ${missing} dish${missing === 1 ? '' : 'es'} still need a recipe so sales reduce stock.
            <button type="button" class="btn btn-primary btn-sm" id="inv-tip-link" style="margin-left:8px">Help me link</button>
            <button type="button" class="btn btn-ghost btn-sm" id="inv-tip-check">3-step setup</button>
            <button type="button" class="btn btn-ghost btn-sm" id="inv-tip-recipes">Open Recipes</button></div>`;
          const a = tip.querySelector('#inv-tip-link');
          const b = tip.querySelector('#inv-tip-recipes');
          const c = tip.querySelector('#inv-tip-check');
          if (a)
            {a.onclick = () => {
              if (global.RSKitchenLinkCoach) {RSKitchenLinkCoach.openLinkWizard();}
            };}
          if (c)
            {c.onclick = () => {
              if (global.RSKitchenLinkCoach && RSKitchenLinkCoach.openSetupChecklist)
                {RSKitchenLinkCoach.openSetupChecklist();}
            };}
          if (b)
            {b.onclick = () => {
              if (global.RSKitchenLinkCoach) {RSKitchenLinkCoach.goInventoryTab('recipes');}
              else {
                const btn = document.querySelector('#inv-seg [data-inv-tab="recipes"]');
                if (btn) {btn.click();}
              }
            };}
        } else {
          tip.style.display = 'none';
        }
      }
    } catch (_) {}
    const banner = $('#inv-banner');
    if (banner) {banner.style.display = low.length ? 'flex' : 'none';}
    const lowCount = $('#inv-low-count');
    if (lowCount) {lowCount.textContent = low.length;}

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
      rebuildCatFilterOptions(INVENTORY);
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
      const searchEl = $('#inv-stock-search');
      if (searchEl && !searchEl._rsListenerBound) {
        searchEl._rsListenerBound = true;
        let t;
        searchEl.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(renderInventory, 120);
        });
      }

      const catFilter = ($('#inv-cat-filter')?.value || 'All').toLowerCase();
      const statusFilter = ($('#inv-status-filter')?.value || 'All').toLowerCase();
      const q = (($('#inv-stock-search') && $('#inv-stock-search').value) || '').toLowerCase().trim();

      try {
        if (global.RSSkel && RSSkel.clear) {RSSkel.clear(invBody);}
      } catch (_) {}

      let filtered = INVENTORY;
      if (catFilter !== 'all') {
        filtered = filtered.filter((i) => {
          const c = String(i.cat || i.category || '').toLowerCase();
          return c === catFilter;
        });
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          return st === statusFilter;
        });
      }
      if (q) {
        filtered = filtered.filter((i) => {
          const hay = [i.name, i.key, i.cat, i.unit, i.supplier, displayInvName(i.name)]
            .map((x) => String(x || '').toLowerCase())
            .join(' ');
          return hay.includes(q);
        });
      }

      if (!filtered.length) {
        const hasFilters = catFilter !== 'all' || statusFilter !== 'all' || !!q;
        invBody.innerHTML = `<tr class="inv-empty-row"><td colspan="7" style="padding:0;border:none">
          <div class="sr-empty" style="padding:40px 20px">
            <i class="fa-solid fa-boxes-stacked" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
            <div style="font-weight:700;color:var(--text);margin-bottom:4px">${
              hasFilters ? 'No stock items match filters' : 'No stock items yet'
            }</div>
            <div style="color:var(--text-soft);font-size:13px;max-width:380px;margin:0 auto 14px;line-height:1.45">${
              hasFilters
                ? 'Clear search / category / status filters to see full stock.'
                : 'Add food, packaging (boxes, bags), disposables (napkins, spoons), and other kitchen supplies. Link them on recipes so sales reduce stock.'
            }</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              ${
                hasFilters
                  ? '<button type="button" class="btn btn-ghost btn-sm" id="inv-clear-filters"><i class="fa-solid fa-filter-circle-xmark"></i> Clear filters</button>'
                  : ''
              }
              <button type="button" class="btn btn-primary btn-sm" id="inv-empty-add"><i class="fa-solid fa-plus"></i> Add stock item</button>
              <button type="button" class="btn btn-ghost btn-sm" id="inv-empty-pack"><i class="fa-solid fa-box"></i> Add packaging</button>
            </div>
          </div>
        </td></tr>`;
        const clear = document.getElementById('inv-clear-filters');
        if (clear)
          {clear.onclick = () => {
            const c = document.getElementById('inv-cat-filter');
            const s = document.getElementById('inv-status-filter');
            const se = document.getElementById('inv-stock-search');
            if (c) {c.value = 'All';}
            if (s) {s.value = 'All';}
            if (se) {se.value = '';}
            renderInventory();
          };}
        const add = document.getElementById('inv-empty-add');
        if (add)
          {add.onclick = () => {
            openAddStockModal({ typeId: 'food' });
          };}
        const addPack = document.getElementById('inv-empty-pack');
        if (addPack)
          {addPack.onclick = () => {
            openAddStockModal({ typeId: 'packaging' });
          };}
      } else {
      invBody.innerHTML = filtered
        .map((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          const pct = Math.min(100, Math.round((i.stock / (i.min * 2 || 1)) * 100));
          const pretty = displayInvName(i.name);
          const costN = unitCostOf(i);
          const valN = stockValueOf(i);
          const idAttr = esc(invMatchKey(i));
          const costHtml =
            costN > 0
              ? `<button type="button" class="inv-cost-btn" data-set-cost title="Edit unit cost (links to plate cost)">
                  <span class="inv-cost-amt">${rs(costN)}</span><span class="inv-unit-suffix">/${_e(i.unit || 'unit')}</span>
                  <span class="inv-stock-val">value ${rs(valN)}</span>
                </button>`
              : `<button type="button" class="inv-cost-btn is-zero" data-set-cost title="Set unit cost — required for plate cost">
                  <span class="inv-cost-zero">₹0 · set cost</span>
                  <span class="inv-stock-val">not linked</span>
                </button>`;
          const sum =
            Batches && typeof Batches.summarizeItem === 'function'
              ? Batches.summarizeItem(i)
              : null;
          let statusLabel = st === 'out' ? 'Reorder' : st === 'low' ? 'Low' : 'Healthy';
          let statusCls = cls[st] || '';
          if (sum && sum.status === 'expired') {
            statusLabel = 'Expired batch';
            statusCls = cls.out || 'stock-out';
          } else if (sum && sum.status === 'near') {
            statusLabel = 'Use first';
            statusCls = cls.low || 'stock-low';
          }
          const fefoLine = sum && sum.useFirstLabel
            ? `<div class="inv-fefo-line inv-fefo-${esc(sum.status || 'ok')}" title="First expiry first out">${_e(sum.useFirstLabel)}</div>`
            : '';
          return `<tr data-inv-id="${idAttr}" class="${costN > 0 ? '' : 'inv-row-no-cost'}">
          <td>
            <button type="button" class="inv-name-btn" data-batches="${idAttr}" title="View batches / expiry">
              <b class="inv-name">${_e(pretty)}</b>
            </button>
            ${pretty !== String(i.name) ? `<div class="inv-key-sub" title="Stored key">${_e(i.name)}</div>` : ''}
            ${fefoLine}
          </td>
          <td><span class="inv-cat-pill">${_e(i.cat || '—')}</span></td>
          <td><div style="display:flex;align-items:center;gap:10px"><span class="td-strong" style="min-width:58px">${i.stock} ${_e(i.unit)}</span><div style="flex:1;height:6px;background:var(--glass-2);border-radius:99px;overflow:hidden;min-width:60px"><span style="display:block;height:100%;width:${pct}%;background:${sum && sum.status === 'expired' ? 'var(--red)' : sum && sum.status === 'near' ? 'var(--amber)' : st === 'out' ? 'var(--red)' : st === 'low' ? 'var(--amber)' : 'var(--green)'}"></span></div></div></td>
          <td>${i.min} ${_e(i.unit)}</td>
          <td>${costHtml}</td>
          <td><span class="stock-dot ${statusCls}">${_e(statusLabel)}</span></td>
          <td><div class="row-actions"><button type="button" class="icon-act go" title="Raise purchase order / restock with expiry" aria-label="Restock ${_e(pretty)}"><i class="fa-solid fa-truck"></i></button><button type="button" class="icon-act inv-edit" title="Edit stock item" aria-label="Edit ${_e(pretty)}"><i class="fa-solid fa-pen"></i></button></div></td>
        </tr>`;
        })
        .join('');
      }

      $$('#inv-table-body .inv-name-btn').forEach((btn) => {
        btn.onclick = () => {
          const row = btn.closest('tr');
          const inv = findInvByRow(row);
          if (inv) {openBatchesModal(inv);}
        };
      });
      $$('#inv-table-body [data-set-cost]').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const row = btn.closest('tr');
          const inv = findInvByRow(row);
          if (inv) {openSetCostModal(inv, { showNext: !(unitCostOf(inv) > 0) });}
        };
      });

      $$('#inv-table-body .icon-act.go').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const inv = findInvByRow(row);
          if (!inv) {return;}
          const qtyToOrder = Math.max(1, Math.round(inv.min * 2 - inv.stock));
          const estimatedCost = Math.round(qtyToOrder * inv.cost);

          if (!global.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const defExp = (() => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            return d.toISOString().slice(0, 10);
          })();
          const body = `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="font-size:13px;color:var(--text-soft)">
                Restock <b>${_e(displayInvName(inv.name))}</b> (current: ${inv.stock} ${_e(inv.unit)}, min: ${inv.min} ${_e(inv.unit)}).
              </div>
              <div class="form-grid-2" style="margin-top:4px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Qty (${_e(inv.unit)})</label>
                  <input type="number" id="po-qty" class="form-control" value="${qtyToOrder}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Unit cost (₹ / ${_e(inv.unit || 'unit')})</label>
                  <input type="number" id="po-unit-cost" class="form-control" min="0" step="any" value="${unitCostOf(inv) || ''}" placeholder="What you paid per unit" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Batch expiry</label>
                  <input type="date" id="po-expiry" class="form-control" value="${defExp}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
                <div>
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Supplier</label>
                  <input type="text" id="po-supplier" class="form-control" value="${_e(inv.supplier || inv.cat || '')} Supplier" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
              </div>
              <div style="font-size:12px;color:var(--text-mute)">
                Est. value: <strong style="color:var(--orange)" id="po-cost-preview">${rs(estimatedCost)}</strong>
                · Unit cost is saved on the item (links recipes / plate cost)
              </div>
            </div>
          `;

          RSModal.open({
            title: 'Restock · ' + displayInvName(inv.name),
            sub: 'Receive now with cost + expiry, or draft a PO',
            icon: 'fa-truck',
            size: 'sm',
            body,
            foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
              <button class="btn btn-ghost" data-po title="Create PO only"><i class="fa-solid fa-file-invoice"></i> PO</button>
              <button class="btn btn-primary" data-recv><i class="fa-solid fa-box-open"></i> Receive now</button>`,
            onMount(modal, close) {
              const qtyInput = modal.querySelector('#po-qty');
              const costInput = modal.querySelector('#po-unit-cost');
              const refreshEst = () => {
                const q = Math.max(0, Number(qtyInput.value) || 0);
                const c = Math.max(0, Number(costInput.value) || 0);
                modal.querySelector('#po-cost-preview').textContent = rs(Math.round(q * c));
              };
              qtyInput.oninput = refreshEst;
              costInput.oninput = refreshEst;
              modal.querySelector('[data-cancel]').onclick = close;
              const makeLine = () => {
                const qty = Math.max(1, Number(qtyInput.value) || 1);
                const unitCost = Math.max(0, Number(costInput.value) || 0);
                const supplier = modal.querySelector('#po-supplier').value || 'Default Supplier';
                const expiryDate = (modal.querySelector('#po-expiry') && modal.querySelector('#po-expiry').value) || null;
                return { qty, supplier, expiryDate, unitCost };
              };
              modal.querySelector('[data-po]').onclick = async () => {
                const { qty, supplier, expiryDate, unitCost } = makeLine();
                if (unitCost > 0) {
                  try {
                    await persistInvCost(inv, unitCost);
                  } catch (_) {}
                }
                const poNum = nextLogicalNo('PO');
                const line = {
                  name: inv.name,
                  unit: inv.unit || 'unit',
                  qty,
                  cost: unitCost || unitCostOf(inv),
                  value: Math.round(qty * (unitCost || unitCostOf(inv))),
                  invId: inv.id,
                  expiryDate,
                };
                const poRow = {
                  id: poNum,
                  poNumber: poNum,
                  supplier,
                  lines: [line],
                  items: `${qty} ${inv.unit || 'unit'} ${inv.name}`,
                  value: line.value,
                  date: new Date().toISOString(),
                  status: 'pending',
                  channel: 'manual_restock',
                };
                close();
                try {
                  if (global.RS && RS.saveOne) {await RS.saveOne('purchase_orders', poRow);}
                  else if (global.RS_DB) {await RS_DB.put('purchase_orders', poRow.id, poRow);}
                  toast('PO raised · receive later with expiry', 'fa-circle-check');
                  document.dispatchEvent(new CustomEvent('rs:render-inventory'));
                  renderInventory();
                } catch (e) {
                  toast('Could not save PO', 'fa-circle-exclamation');
                }
              };
              modal.querySelector('[data-recv]').onclick = async () => {
                const { qty, expiryDate, unitCost } = makeLine();
                close();
                setOperationStatus('Receiving stock...');
                try {
                  const oldQty = Math.max(0, Number(inv.stock) || 0);
                  const oldCost = unitCostOf(inv);
                  inv.stock = oldQty + qty;
                  // Industry standard: weighted average unit cost on receive
                  if (unitCost > 0) {
                    const avg =
                      global.RSRecipeUnits && RSRecipeUnits.weightedAverageCost
                        ? RSRecipeUnits.weightedAverageCost(oldQty, oldCost, qty, unitCost)
                        : oldQty > 0 && oldCost > 0
                          ? (oldQty * oldCost + qty * unitCost) / (oldQty + qty)
                          : unitCost;
                    inv.cost = Math.round(avg * 10000) / 10000;
                    inv.unit_cost = inv.cost;
                    inv.lastBuyCost = unitCost;
                  }
                  if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
                  if (global.RSInventoryBatches && RSInventoryBatches.receiveBatch) {
                    await RSInventoryBatches.receiveBatch({
                      item: inv,
                      qty,
                      unit: inv.unit,
                      expiryDate,
                      source: 'quick_receive',
                      cost: unitCost || inv.cost,
                    });
                  }
                  finishOperationStatus('Stock received');
                  toast(
                    `+${qty} ${inv.unit || ''} ${displayInvName(inv.name)}` +
                      (unitCost > 0
                        ? ' · buy ' +
                          rs(unitCost) +
                          ' · avg cost ' +
                          rs(inv.cost) +
                          '/' +
                          (inv.unit || '')
                        : '') +
                      (expiryDate ? ' · use by ' + expiryDate : ''),
                    'fa-box-open'
                  );
                  renderInventory();
                } catch (e) {
                  console.warn(e);
                  finishOperationStatus('Receive failed', 'error');
                  toast('Could not receive stock', 'fa-circle-exclamation');
                }
              };
            },
          });
        });
      });

      $$('#inv-table-body .icon-act.inv-edit').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const inv = findInvByRow(row);
          if (!inv) {return;}

          if (!global.RSModal) {
            toast('Modal module is unavailable', 'fa-circle-exclamation');
            return;
          }

          const catOpts = [
            'Food',
            'Dairy',
            'Meat & seafood',
            'Produce',
            'Spices & dry',
            'Beverages',
            'Packaging',
            'Disposables',
            'Cleaning',
            'Fuel & utilities',
            'Other',
            'General',
          ];
          const curCat = inv.cat || 'General';
          const catSelect =
            catOpts
              .map((c) => `<option value="${_e(c)}" ${c === curCat ? 'selected' : ''}>${_e(c)}</option>`)
              .join('') +
            (!catOpts.includes(curCat)
              ? `<option value="${_e(curCat)}" selected>${_e(curCat)}</option>`
              : '') +
            '<option value="__custom__">+ Custom…</option>';

          const body = `
            <div style="display:flex;flex-direction:column;gap:14px">
              <div><label class="fl">Item name</label><input class="form-input" id="edit-ing-name" value="${_e(inv.name)}"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Category</label>
                  <select class="form-input" id="edit-ing-cat">${catSelect}</select>
                  <input class="form-input" id="edit-ing-cat-custom" placeholder="Custom category" style="display:none;margin-top:6px">
                </div>
                <div>
                  <label class="fl">Unit</label>
                  ${
                    global.RSRecipeUnits && RSRecipeUnits.unitSelectHtml
                      ? RSRecipeUnits.unitSelectHtml(inv.unit || 'kg', 'edit-ing-unit')
                      : `<select class="form-input" id="edit-ing-unit">
                          ${['kg', 'gm', 'ltr', 'ml']
                            .map(
                              (u) =>
                                `<option value="${u}" ${String(inv.unit || 'kg').toLowerCase() === u || (inv.unit === 'g' && u === 'gm') || ((inv.unit === 'L' || inv.unit === 'l') && u === 'ltr') ? 'selected' : ''}>${u}</option>`
                            )
                            .join('')}
                        </select>`
                  }
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Current stock</label><input class="form-input" id="edit-ing-stock" type="number" min="0" value="${inv.stock}"></div>
                <div><label class="fl">Min level (reorder at)</label><input class="form-input" id="edit-ing-min" type="number" min="0" value="${inv.min}"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Unit cost (${rs(1).replace(/[\d.,]/g, '').trim() || '₹'} / ${_e(inv.unit || 'unit')}) <span style="color:var(--amber)">· linked</span></label>
                  <input class="form-input" id="edit-ing-cost" type="number" min="0" step="any" value="${unitCostOf(inv) || ''}" placeholder="What you pay per unit">
                  <div style="font-size:11.5px;color:var(--text-mute);margin-top:4px">Stock value: <b id="edit-ing-val">${rs(stockValueOf(inv))}</b></div>
                </div>
                <div><label class="fl">Supplier</label><input class="form-input" id="edit-ing-supplier" value="${_e(inv.supplier || inv.vendor || '')}" placeholder="Optional"></div>
              </div>
              <p style="margin:0;font-size:12px;color:var(--text-soft);line-height:1.45">Unit cost feeds recipe plate cost &amp; margin. Packaging works the same as food when linked on a recipe.</p>
            </div>`;

          RSModal.open({
            title: 'Edit stock item',
            sub: 'Food, packaging, or any kitchen supply',
            icon: 'fa-pen',
            size: 'sm',
            body,
            foot: '<button class="btn btn-ghost" style="flex:1" data-cancel>Cancel</button><button class="btn btn-danger" style="flex:0" data-delete title="Remove from stock"><i class="fa-solid fa-trash"></i></button><button class="btn btn-primary" style="flex:1" data-confirm><i class="fa-solid fa-circle-check"></i> Save changes</button>',
            onMount(modal, close) {
              const catSel = modal.querySelector('#edit-ing-cat');
              const catCustom = modal.querySelector('#edit-ing-cat-custom');
              const costEl = modal.querySelector('#edit-ing-cost');
              const valEl = modal.querySelector('#edit-ing-val');
              const stockEl = modal.querySelector('#edit-ing-stock');
              const refreshVal = () => {
                if (!valEl) {return;}
                const c = Math.max(0, Number(costEl.value) || 0);
                const s = Math.max(0, Number(stockEl.value) || 0);
                valEl.textContent = rs(Math.round(c * s * 100) / 100);
              };
              if (costEl) {costEl.addEventListener('input', refreshVal);}
              if (stockEl) {stockEl.addEventListener('input', refreshVal);}
              if (catSel)
                {catSel.onchange = () => {
                  if (catSel.value === '__custom__') {
                    catCustom.style.display = '';
                    catCustom.focus();
                  } else {catCustom.style.display = 'none';}
                };}
              modal.querySelector('[data-cancel]').onclick = close;
              modal.querySelector('[data-delete]').onclick = async () => {
                close();
                setOperationStatus('Removing stock item...');
                try {
                  const idx = INVENTORY.findIndex((x) => x.id === inv.id);
                  if (idx > -1) {INVENTORY.splice(idx, 1);}
                  if (global.RS_DB) {await RS_DB.del('inventory', inv.id);}
                  finishOperationStatus('Stock item removed');
                  toast(`${inv.name} removed from inventory`, 'fa-circle-check');
                  renderInventory();
                } catch (e) {
                  console.warn('Failed to remove stock item', e);
                  finishOperationStatus('Failed to remove item', 'error');
                  toast('Could not remove item -- try again', 'fa-circle-exclamation');
                }
              };
              modal.querySelector('[data-confirm]').onclick = async () => {
                const newName = modal.querySelector('#edit-ing-name').value.trim();
                if (!newName) {return toast('Enter item name', 'fa-circle-exclamation');}
                inv.name = newName;
                let cat = modal.querySelector('#edit-ing-cat').value;
                if (cat === '__custom__') {cat = (catCustom.value || '').trim() || 'Other';}
                inv.cat = cat || 'General';
                inv.unit = modal.querySelector('#edit-ing-unit').value.trim() || 'unit';
                inv.stock = +modal.querySelector('#edit-ing-stock').value || 0;
                inv.min = +modal.querySelector('#edit-ing-min').value || 0;
                inv.cost = +modal.querySelector('#edit-ing-cost').value || 0;
                inv.unit_cost = inv.cost;
                inv.supplier = (modal.querySelector('#edit-ing-supplier').value || '').trim();
                if (!(inv.cost > 0)) {
                  toast('Set unit cost so this item is linked for plate costing', 'fa-indian-rupee-sign');
                  modal.querySelector('#edit-ing-cost').focus();
                  return;
                }
                close();
                setOperationStatus('Saving changes...');
                try {
                  if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
                  finishOperationStatus('Stock item updated');
                  toast(`${displayInvName(inv.name)} updated · cost ${rs(inv.cost)}/${inv.unit || 'unit'}`, 'fa-link');
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
          if (global.RS && RS.activateTab) {RS.activateTab('editor-tab');}
          setTimeout(() => {
            const m = MENU.find((x) => String(x.id) === String(btn.dataset.recipeEdit));
            if (m && global.buildFormLoad) {global.buildFormLoad(m);}
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
          if (e.target === wrap) {close();}
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
            if (!t) {return;}
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
          const prog =
            global.RSProgress &&
            RSProgress.open({
              title: 'Importing recipes…',
              sub: 'Linking ingredients to menu items',
              total: ids.length,
              unit: 'dishes',
            });
          try {
            for (let i = 0; i < ids.length; i++) {
              const row = byItem[ids[i]];
              const dishName = (row.m && row.m.name) || ids[i];
              if (prog) {
                prog.update({
                  done: i,
                  current: dishName,
                  sub:
                    'Saving ' +
                    (i + 1) +
                    ' of ' +
                    ids.length +
                    ' · ' +
                    (ids.length - i) +
                    ' remaining',
                });
              }
              if (global.RS && RS.saveOne) {await RS.saveOne('menu', row.m);}
              if (prog) {
                prog.update({
                  done: i + 1,
                  current: dishName,
                  sub:
                    i + 1 < ids.length
                      ? 'Saved ' + (i + 1) + ' · ' + (ids.length - i - 1) + ' remaining'
                      : 'All recipes linked',
                });
              }
              if (i % 2 === 1) {
                await new Promise(function (r) {
                  setTimeout(r, 0);
                });
              }
            }
            if (global.RS && RS.save && !global.RS.saveOne) {await RS.save('menu');}
            if (prog) {
              prog.succeed('Recipes imported: ' + ids.length + ' dishes · ' + links + ' links');
              prog.close(1000);
            }
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
            if (prog) {
              prog.fail(e.message || 'Save failed');
              prog.close(2200);
            }
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
      seg.querySelectorAll('[data-inv-tab]').forEach((btn) => {
        btn.onclick = () => {
          const tab = btn.dataset.invTab || 'stock';
          seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          // Legacy stock panel
          const stockPanel = $('#inv-panel-stock');
          if (stockPanel) {
            stockPanel.style.display = tab === 'stock' ? '' : 'none';
            stockPanel.classList.toggle('active', tab === 'stock');
          }
          // features-manage sub-panes (recipes / suppliers / pos / waste)
          document.querySelectorAll('#inventory-tab .subtab-pane').forEach((p) => {
            const isStockPane = p.id === 'inv-panel-stock' || p.dataset.pane === 'stock';
            const match = p.dataset.pane === tab || (tab === 'stock' && isStockPane);
            p.classList.toggle('active', match);
            if (p.id && p.id.startsWith('inv-panel-')) {
              p.style.display = match ? '' : 'none';
            }
          });
          if (global.RSInventoryToolbar && RSInventoryToolbar.sync) {
            RSInventoryToolbar.sync(tab);
          } else {
            // Hide toolbar actions that only apply to stock list when on other tabs
            const stockOnly = [
              'btn-add-ingredient',
              'btn-import-inventory',
              'btn-download-inventory-template',
              'btn-export-inventory',
              'btn-export-low-stock-toolbar',
              'btn-inv-variance',
              'btn-inv-prep',
              'btn-inv-takeaway-pack',
              'inv-stock-search',
            ];
            stockOnly.forEach((id) => {
              const el = document.getElementById(id);
              if (!el) {return;}
              if (id === 'inv-stock-search') {
                const wrap = el.closest('.inv-search-wrap') || el;
                wrap.style.display = tab === 'stock' ? '' : 'none';
              } else {
                el.style.display = tab === 'stock' ? '' : 'none';
              }
            });
          }
        };
      });
    }

    // Shared: stock-only chrome (Variance / Prep / Export / search) only on Stock levels
    global.RSInventoryToolbar = {
      sync(pane) {
        const isStock = !pane || pane === 'stock';
        const stockOnly = [
          'btn-add-ingredient',
          'btn-import-inventory',
          'btn-download-inventory-template',
          'btn-export-inventory',
          'btn-export-low-stock-toolbar',
          'btn-inv-variance',
          'btn-inv-prep',
          'btn-inv-takeaway-pack',
          'inv-stock-search',
        ];
        stockOnly.forEach((id) => {
          const el = document.getElementById(id);
          if (!el) {return;}
          if (id === 'inv-stock-search') {
            const wrap = el.closest('.inv-search-wrap') || el;
            wrap.style.display = isStock ? '' : 'none';
          } else {
            el.style.display = isStock ? '' : 'none';
          }
        });
      },
      activePane() {
        const a = document.querySelector('#inv-seg button.active');
        return (a && (a.getAttribute('data-inv-tab') || a.dataset.invTab)) || 'stock';
      },
    };
    try {
      global.RSInventoryToolbar.sync(global.RSInventoryToolbar.activePane());
    } catch (_) {}

    // Stock types: food + packaging + disposables + cleaning + other (all reduce on recipe link)
    const STOCK_TYPE_PRESETS = [
      { id: 'food', label: 'Food / raw', icon: 'fa-carrot', cat: 'Food', unit: 'kg', ph: 'e.g. Paneer, Basmati rice' },
      { id: 'packaging', label: 'Packaging', icon: 'fa-box', cat: 'Packaging', unit: 'gm', ph: 'e.g. Foil sheet weight / pack weight' },
      { id: 'disposables', label: 'Disposables', icon: 'fa-spoon', cat: 'Disposables', unit: 'gm', ph: 'e.g. Napkin pack weight' },
      { id: 'cleaning', label: 'Cleaning', icon: 'fa-spray-can-sparkles', cat: 'Cleaning', unit: 'ltr', ph: 'e.g. Dishwash liquid' },
      { id: 'other', label: 'Other', icon: 'fa-cube', cat: 'Other', unit: 'kg', ph: 'e.g. Charcoal, dry goods' },
    ];
    const STOCK_CAT_OPTIONS = [
      'Food',
      'Dairy',
      'Meat & seafood',
      'Produce',
      'Spices & dry',
      'Beverages',
      'Packaging',
      'Disposables',
      'Cleaning',
      'Fuel & utilities',
      'Other',
      'General',
    ];
    const PACKAGING_QUICK = [
      { name: 'Takeaway box', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Paper bag', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Plastic container', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Aluminium foil', cat: 'Packaging', unit: 'gm', min: 100, cost: 0 },
      { name: 'Butter paper', cat: 'Packaging', unit: 'gm', min: 100, cost: 0 },
      { name: 'Carry bag', cat: 'Packaging', unit: 'gm', min: 50, cost: 0 },
      { name: 'Napkin', cat: 'Disposables', unit: 'gm', min: 200, cost: 0 },
      { name: 'Spoon / fork set', cat: 'Disposables', unit: 'gm', min: 100, cost: 0 },
      { name: 'Straw', cat: 'Disposables', unit: 'gm', min: 100, cost: 0 },
      { name: 'Tissue', cat: 'Disposables', unit: 'gm', min: 20, cost: 0 },
    ];
    // Standard kitchen units only (as used in recipes + stock)
    const UNIT_OPTIONS =
      (global.RSRecipeUnits && RSRecipeUnits.STOCK_UNITS) || ['kg', 'gm', 'ltr', 'ml'];

    async function saveStockItem(item) {
      INVENTORY.push(item);
      try {
        if (global.RS_DB) {await RS_DB.put('inventory', item.id, item);}
        toast(item.name + ' added · synced', 'fa-circle-check');
      } catch (e) {
        console.warn('add stock save', e);
        toast(item.name + ' added locally · cloud pending', 'fa-circle-exclamation');
      }
      renderInventory();
      try {
        if (global.RSKitchenLinkCoach && RSKitchenLinkCoach.refreshSetupNav) {
          RSKitchenLinkCoach.refreshSetupNav();
        }
      } catch (_) {}
    }

    function openAddStockModal(opts) {
      opts = opts || {};
      if (!global.RSModal) {return;}
      let typeId = opts.typeId || 'food';
      const preset0 = STOCK_TYPE_PRESETS.find((t) => t.id === typeId) || STOCK_TYPE_PRESETS[0];

      RSModal.open({
        title: 'Add stock item',
        sub: 'Food, packaging, disposables — anything the kitchen uses',
        icon: 'fa-boxes-stacked',
        size: 'md',
        body: `
          <div class="inv-add-stock">
            <div class="klc-p" style="margin-bottom:10px">Not only food. Add boxes, bags, napkins, foil — link them on a recipe so sales reduce them too.</div>
            <div class="inv-type-chips" id="add-ing-types">
              ${STOCK_TYPE_PRESETS.map(
                (t) =>
                  `<button type="button" class="inv-type-chip ${t.id === typeId ? 'active' : ''}" data-type="${t.id}">
                    <i class="fa-solid ${t.icon}"></i> ${t.label}
                  </button>`
              ).join('')}
            </div>
            <div class="inv-quick-pack" id="add-ing-quick">
              <div class="inv-quick-title"><i class="fa-solid fa-bolt"></i> Quick add common packaging</div>
              <div class="inv-quick-chips">
                ${PACKAGING_QUICK.map(
                  (q, i) =>
                    `<button type="button" class="klc-chip" data-quick="${i}" title="${esc(q.cat)}">
                      <i class="fa-solid fa-plus"></i> ${esc(q.name)}
                    </button>`
                ).join('')}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
              <div><label class="fl">Item name</label><input class="form-input" id="add-ing-name" placeholder="${esc(preset0.ph)}"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Category</label>
                  <select class="form-input" id="add-ing-cat">
                    ${STOCK_CAT_OPTIONS.map((c) => `<option value="${esc(c)}" ${c === preset0.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                    <option value="__custom__">+ Custom…</option>
                  </select>
                  <input class="form-input" id="add-ing-cat-custom" placeholder="Custom category" style="display:none;margin-top:6px">
                </div>
                <div>
                  <label class="fl">Unit</label>
                  <select class="form-input" id="add-ing-unit">
                    ${UNIT_OPTIONS.map((u) => `<option value="${esc(u)}" ${u === preset0.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Current stock</label><input class="form-input" id="add-ing-stock" type="number" min="0" placeholder="0"></div>
                <div><label class="fl">Min level (reorder at)</label><input class="form-input" id="add-ing-min" type="number" min="0" placeholder="10" value="10"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label class="fl">Unit cost (₹) <span style="color:var(--amber);font-weight:700">· links recipes</span></label>
                  <input class="form-input" id="add-ing-cost" type="number" min="0" step="any" placeholder="What you pay per unit">
                  <div style="font-size:11.5px;color:var(--text-mute);margin-top:4px">Per 1 unit — used for plate cost &amp; stock value</div>
                </div>
                <div><label class="fl">Supplier (optional)</label><input class="form-input" id="add-ing-supplier" placeholder="e.g. Metro Cash"></div>
              </div>
            </div>
          </div>`,
        foot: '<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-circle-check"></i> Add to stock</button>',
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          const nameEl = modal.querySelector('#add-ing-name');
          const catEl = modal.querySelector('#add-ing-cat');
          const catCustom = modal.querySelector('#add-ing-cat-custom');
          const unitEl = modal.querySelector('#add-ing-unit');
          const minEl = modal.querySelector('#add-ing-min');

          function applyType(id) {
            typeId = id;
            const p = STOCK_TYPE_PRESETS.find((t) => t.id === id) || STOCK_TYPE_PRESETS[0];
            modal.querySelectorAll('.inv-type-chip').forEach((b) => b.classList.toggle('active', b.getAttribute('data-type') === id));
            if (catEl && !catCustom.value) {
              if ([...catEl.options].some((o) => o.value === p.cat)) {catEl.value = p.cat;}
            }
            if (unitEl && UNIT_OPTIONS.includes(p.unit)) {unitEl.value = p.unit;}
            if (nameEl && !nameEl.value) {nameEl.placeholder = p.ph;}
            // Higher default min for packaging/disposables
            if (minEl && (id === 'packaging' || id === 'disposables') && (!minEl.value || minEl.value === '10')) {
              minEl.value = '50';
            }
          }

          modal.querySelectorAll('[data-type]').forEach((btn) => {
            btn.onclick = () => applyType(btn.getAttribute('data-type'));
          });
          if (catEl)
            {catEl.onchange = () => {
              if (catEl.value === '__custom__') {
                catCustom.style.display = '';
                catCustom.focus();
              } else {
                catCustom.style.display = 'none';
              }
            };}

          modal.querySelectorAll('[data-quick]').forEach((chip) => {
            chip.onclick = async () => {
              const q = PACKAGING_QUICK[+chip.getAttribute('data-quick')];
              if (!q) {return;}
              const exists = INVENTORY.find((x) => String(x.name).toLowerCase() === q.name.toLowerCase());
              if (exists) {
                toast(q.name + ' is already in stock', 'fa-circle-info');
                return;
              }
              const item = {
                id: 'inv_' + q.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now(),
                name: q.name,
                cat: q.cat,
                unit: q.unit,
                stock: 0,
                min: q.min || 50,
                cost: q.cost || 0,
                supplier: '',
              };
              await saveStockItem(item);
              chip.disabled = true;
              chip.style.opacity = '0.5';
              toast('Added “' + q.name + '” — set stock qty anytime', 'fa-box');
            };
          });

          modal.querySelector('[data-ok]').onclick = async () => {
            const name = nameEl.value.trim();
            if (!name) {return toast('Enter item name', 'fa-circle-exclamation');}
            let cat = catEl.value;
            if (cat === '__custom__') {cat = (catCustom.value || '').trim() || 'Other';}
            if (!cat) {cat = 'General';}
            const costVal = +modal.querySelector('#add-ing-cost').value || 0;
            if (!(costVal > 0)) {
              toast('Add unit cost (₹ per unit) so this item links to plate cost', 'fa-indian-rupee-sign');
              modal.querySelector('#add-ing-cost').focus();
              return;
            }
            const item = {
              id: 'inv_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now(),
              name,
              cat,
              unit: (unitEl.value || 'unit').trim(),
              stock: +modal.querySelector('#add-ing-stock').value || 0,
              min: +modal.querySelector('#add-ing-min').value || 10,
              cost: costVal,
              unit_cost: costVal,
              supplier: (modal.querySelector('#add-ing-supplier').value || '').trim(),
            };
            await saveStockItem(item);
            close();
          };
          if (nameEl) {nameEl.focus();}
        },
      });
    }

    function openVarianceReport() {
      if (!global.RSModal) {return;}
      const bills = (global.RS && RS.BILLS) || [];
      const menu = (global.RS && RS.MENU) || [];
      const now = Date.now();
      const dayMs = 86400000;
      function inRange(b, days) {
        const t = b.dateTime || b.created_at || b.time;
        const ms = t ? new Date(t).getTime() : 0;
        if (!ms) {return days >= 30;} // include undated in long window
        return now - ms <= days * dayMs;
      }
      const periods = [
        { key: '1', label: 'Today', days: 1 },
        { key: '7', label: '7 days', days: 7 },
        { key: '30', label: '30 days', days: 30 },
      ];
      let period = periods[1];
      function rowsFor() {
        const subset = bills.filter((b) => inRange(b, period.days));
        const usage =
          global.RSRecipeUnits && RSRecipeUnits.theoreticalUsageFromBills
            ? RSRecipeUnits.theoreticalUsageFromBills(subset, menu, INVENTORY)
            : [];
        usage.sort((a, b) => b.qty - a.qty);
        return { usage, billN: subset.length };
      }
      function bodyHtml() {
        const { usage, billN } = rowsFor();
        const tabs = periods
          .map(
            (p) =>
              `<button type="button" class="btn btn-ghost btn-sm${p.key === period.key ? ' active' : ''}" data-per="${p.key}" style="${
                p.key === period.key ? 'border-color:var(--orange);color:var(--orange);font-weight:700' : ''
              }">${p.label}</button>`
          )
          .join('');
        if (!usage.length) {
          return `<div class="klc-p">${tabs}</div>
            <div class="sr-empty" style="padding:28px">No recipe-based usage in this period (${billN} bills). Link recipes and sell dishes to see variance.</div>`;
        }
        const lines = usage
          .slice(0, 40)
          .map((u) => {
            const inv = INVENTORY.find(
              (i) => String(i.name).toLowerCase() === String(u.name).toLowerCase()
            );
            const stock = inv ? Number(inv.stock) || 0 : '—';
            const unit = (global.RSRecipeUnits && RSRecipeUnits.displayUnit
              ? RSRecipeUnits.displayUnit(u.unit || (inv && inv.unit) || 'kg')
              : u.unit) || '';
            const cost = inv ? unitCostOf(inv) : 0;
            const used = Math.round(u.qty * 1000) / 1000;
            const val = cost > 0 ? rs(Math.round(used * cost * 100) / 100) : '—';
            return `<tr>
              <td><b>${esc(displayInvName(u.name))}</b></td>
              <td class="td-strong">${used} ${esc(unit)}</td>
              <td>${stock === '—' ? '—' : stock + ' ' + esc(unit)}</td>
              <td>${val}</td>
            </tr>`;
          })
          .join('');
        return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${tabs}</div>
          <p class="klc-p" style="margin-bottom:8px"><b>${billN}</b> paid bills · theoretical use from recipes (industry variance base). Compare to physical count.</p>
          <div class="table-scroll"><table class="data-table">
            <thead><tr><th>Stock item</th><th>Used (theory)</th><th>On hand now</th><th>Est. cost used</th></tr></thead>
            <tbody>${lines}</tbody>
          </table></div>`;
      }
      function remount() {
        global.RSModal.open({
          title: 'Stock variance',
          sub: 'Recipe theory from sales · PetPooja-style usage view',
          icon: 'fa-chart-column',
          size: 'md',
          body: bodyHtml(),
          foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>
            <button type="button" class="btn btn-primary" style="flex:1" data-csv><i class="fa-solid fa-file-csv"></i> Export CSV</button>`,
          onMount(m, close) {
            m.querySelector('[data-x]').onclick = close;
            m.querySelectorAll('[data-per]').forEach((btn) => {
              btn.onclick = () => {
                period = periods.find((p) => p.key === btn.getAttribute('data-per')) || period;
                close();
                remount();
              };
            });
            const csvBtn = m.querySelector('[data-csv]');
            if (csvBtn)
              {csvBtn.onclick = () => {
                const { usage } = rowsFor();
                if (!usage.length) {return toast('Nothing to export', 'fa-circle-info');}
                const escC = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
                const csv =
                  '\uFEFF' +
                  ['item', 'theory_used', 'unit', 'on_hand', 'est_cost']
                    .map(escC)
                    .join(',') +
                  '\r\n' +
                  usage
                    .map((u) => {
                      const inv = INVENTORY.find(
                        (i) => String(i.name).toLowerCase() === String(u.name).toLowerCase()
                      );
                      const used = Math.round(u.qty * 1000) / 1000;
                      const cost = inv ? unitCostOf(inv) : 0;
                      return [
                        u.name,
                        used,
                        u.unit || '',
                        inv ? inv.stock : '',
                        cost > 0 ? Math.round(used * cost * 100) / 100 : '',
                      ]
                        .map(escC)
                        .join(',');
                    })
                    .join('\r\n');
                if (global.RS && RS.downloadFile)
                  {RS.downloadFile(csv, 'text/csv;charset=utf-8;', 'stock-variance.csv');}
                toast('Variance CSV exported', 'fa-file-csv');
              };}
          },
        });
      }
      remount();
    }

    function openPrepBatchModal() {
      if (!global.RSModal) {return;}
      if (!INVENTORY.length) {
        toast('Add stock items first', 'fa-boxes-stacked');
        return;
      }
      const inputs = [];
      RSModal.open({
        title: 'Run prep batch',
        sub: 'Use stock to make more stock (gravy, batter, sauce…) — industry prep recipe',
        icon: 'fa-blender',
        size: 'md',
        body: `
          <div style="display:flex;flex-direction:column;gap:12px">
            <p class="klc-p" style="margin:0">Example: onion + oil + spices → <b>curry gravy</b>. Inputs leave stock; output is added. Output cost is calculated from inputs.</p>
            <div style="display:grid;grid-template-columns:1.2fr 0.8fr 0.6fr;gap:8px">
              <div>
                <label class="fl">Output (what you make)</label>
                <select class="form-input" id="prep-out">
                  ${INVENTORY.map(
                    (i) =>
                      `<option value="${esc(i.id)}">${esc(displayInvName(i.name))} (${esc(
                        (global.RSRecipeUnits && RSRecipeUnits.displayUnit
                          ? RSRecipeUnits.displayUnit(i.unit)
                          : i.unit) || 'kg'
                      )})</option>`
                  ).join('')}
                </select>
              </div>
              <div>
                <label class="fl">Qty produced</label>
                <input class="form-input" id="prep-out-qty" type="number" min="0" step="any" value="1">
              </div>
              <div>
                <label class="fl">Unit</label>
                <input class="form-input" id="prep-out-unit" readonly value="">
              </div>
            </div>
            <div>
              <label class="fl">Inputs used</label>
              <div id="prep-inputs"></div>
              <button type="button" class="btn btn-ghost btn-block" id="prep-add-in" style="border-style:dashed;margin-top:8px"><i class="fa-solid fa-plus"></i> Add input from stock</button>
            </div>
            <div id="prep-cost-line" style="font-size:13px;color:var(--text-soft)"></div>
          </div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-blender"></i> Run prep</button>`,
        onMount(modal, close) {
          const outSel = modal.querySelector('#prep-out');
          const outQty = modal.querySelector('#prep-out-qty');
          const outUnit = modal.querySelector('#prep-out-unit');
          const box = modal.querySelector('#prep-inputs');
          const costLine = modal.querySelector('#prep-cost-line');
          function syncOutUnit() {
            const inv = INVENTORY.find((i) => String(i.id) === String(outSel.value));
            outUnit.value =
              inv && global.RSRecipeUnits && RSRecipeUnits.displayUnit
                ? RSRecipeUnits.displayUnit(inv.unit)
                : (inv && inv.unit) || 'kg';
            refreshCost();
          }
          function refreshCost() {
            let total = 0;
            inputs.forEach((g) => {
              const inv = INVENTORY.find((i) => i.name === g.name);
              total += (Number(g.qty) || 0) * unitCostOf(inv || {});
            });
            const pq = Math.max(0, Number(outQty.value) || 0);
            const unitC = pq > 0 ? total / pq : 0;
            costLine.innerHTML =
              'Input cost <b>' +
              rs(Math.round(total * 100) / 100) +
              '</b>' +
              (pq > 0
                ? ' · output unit cost <b>' + rs(Math.round(unitC * 10000) / 10000) + '</b>/' + esc(outUnit.value)
                : '');
          }
          function drawInputs() {
            box.innerHTML =
              inputs
                .map(
                  (g, i) =>
                    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                  <span style="flex:1;font-weight:600">${esc(displayInvName(g.name))}</span>
                  <input type="number" class="form-input" data-pi="${i}" min="0" step="any" value="${esc(g.qty)}" style="width:90px">
                  <span style="width:40px;font-size:12px;color:var(--text-mute)">${esc(g.unit || '')}</span>
                  <button type="button" class="icon-act danger" data-pd="${i}"><i class="fa-solid fa-trash"></i></button>
                </div>`
                )
                .join('') ||
              '<div class="sr-empty" style="padding:12px;font-size:13px">Add what you consume from the store room.</div>';
            box.querySelectorAll('[data-pi]').forEach((inp) => {
              inp.oninput = () => {
                inputs[+inp.getAttribute('data-pi')].qty = Number(inp.value) || 0;
                refreshCost();
              };
            });
            box.querySelectorAll('[data-pd]').forEach((btn) => {
              btn.onclick = () => {
                inputs.splice(+btn.getAttribute('data-pd'), 1);
                drawInputs();
                refreshCost();
              };
            });
          }
          outSel.onchange = syncOutUnit;
          outQty.oninput = refreshCost;
          syncOutUnit();
          drawInputs();
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('#prep-add-in').onclick = () => {
            global.RSModal.open({
              title: 'Add prep input',
              sub: 'Stock consumed to make the batch',
              icon: 'fa-cube',
              size: 'sm',
              body: '<input class="form-input" id="prep-q" placeholder="Search…" style="margin-bottom:10px"><div id="prep-pick" class="klc-pick-list"></div>',
              foot: '<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>',
              onMount(sm, sc) {
                sm.querySelector('[data-x]').onclick = sc;
                const q = sm.querySelector('#prep-q');
                const pick = sm.querySelector('#prep-pick');
                function draw() {
                  const t = (q.value || '').toLowerCase();
                  pick.innerHTML = INVENTORY.filter((i) =>
                    displayInvName(i.name).toLowerCase().includes(t)
                  )
                    .map(
                      (i) =>
                        `<button type="button" class="klc-pick" data-n="${esc(i.name)}" data-u="${esc(i.unit || 'kg')}">
                      <span class="klc-pick-t">${esc(displayInvName(i.name))}</span>
                      <span class="klc-pick-s">${Number(i.stock) || 0} ${esc(
                          global.RSRecipeUnits && RSRecipeUnits.displayUnit
                            ? RSRecipeUnits.displayUnit(i.unit)
                            : i.unit || ''
                        )}</span>
                    </button>`
                    )
                    .join('');
                  pick.querySelectorAll('[data-n]').forEach((el) => {
                    el.onclick = () => {
                      if (!inputs.find((g) => g.name === el.getAttribute('data-n'))) {
                        inputs.push({
                          name: el.getAttribute('data-n'),
                          qty: 1,
                          unit: el.getAttribute('data-u') || 'kg',
                        });
                      }
                      sc();
                      drawInputs();
                      refreshCost();
                    };
                  });
                }
                q.oninput = draw;
                draw();
              },
            });
          };
          modal.querySelector('[data-ok]').onclick = async () => {
            const out = INVENTORY.find((i) => String(i.id) === String(outSel.value));
            const pq = Math.max(0, Number(outQty.value) || 0);
            if (!out || pq <= 0) {return toast('Enter output quantity', 'fa-circle-exclamation');}
            if (!inputs.length) {return toast('Add at least one input', 'fa-circle-exclamation');}
            for (const g of inputs) {
              const inv = INVENTORY.find((i) => i.name === g.name);
              if (!inv || (Number(inv.stock) || 0) < (Number(g.qty) || 0)) {
                return toast('Not enough ' + (g.name || 'input') + ' in stock', 'fa-triangle-exclamation');
              }
            }
            let inputCost = 0;
            for (const g of inputs) {
              const inv = INVENTORY.find((i) => i.name === g.name);
              const q = Number(g.qty) || 0;
              inputCost += q * unitCostOf(inv);
              inv.stock = Math.max(0, (Number(inv.stock) || 0) - q);
              if (global.RSInventoryBatches && RSInventoryBatches.deductFefo) {
                try {
                  await RSInventoryBatches.deductFefo(inv, q);
                } catch (_) {}
              }
              if (global.RS_DB) {await RS_DB.put('inventory', inv.id, inv);}
            }
            const oldQty = Math.max(0, Number(out.stock) || 0);
            const oldCost = unitCostOf(out);
            const unitC = inputCost / pq;
            out.stock = oldQty + pq;
            out.cost =
              global.RSRecipeUnits && RSRecipeUnits.weightedAverageCost
                ? RSRecipeUnits.weightedAverageCost(oldQty, oldCost, pq, unitC)
                : unitC;
            out.unit_cost = out.cost;
            if (global.RS_DB) {await RS_DB.put('inventory', out.id, out);}
            close();
            toast(
              'Prep done · +' + pq + ' ' + (out.unit || '') + ' ' + displayInvName(out.name) + ' · avg ' + rs(out.cost),
              'fa-blender'
            );
            renderInventory();
          };
        },
      });
    }

    const addIngBtn = $('#btn-add-ingredient');
    if (addIngBtn && !addIngBtn.dataset.wired) {
      addIngBtn.dataset.wired = '1';
      addIngBtn.onclick = () => openAddStockModal();
    }
    const varBtn = $('#btn-inv-variance');
    if (varBtn && !varBtn.dataset.wired) {
      varBtn.dataset.wired = '1';
      varBtn.onclick = () => openVarianceReport();
    }
    const prepBtn = $('#btn-inv-prep');
    if (prepBtn && !prepBtn.dataset.wired) {
      prepBtn.dataset.wired = '1';
      prepBtn.onclick = () => openPrepBatchModal();
    }

    function loadTakeawayPackCfg() {
      try {
        if (global.RSInventoryLedger && RSInventoryLedger.loadTakeawayPackConfig) {
          return RSInventoryLedger.loadTakeawayPackConfig();
        }
        const raw = localStorage.getItem('rs_takeaway_pack');
        if (raw) {return JSON.parse(raw);}
      } catch (_) {}
      return { enabled: false, items: [], applyDelivery: true };
    }
    async function saveTakeawayPackCfg(cfg) {
      try {
        localStorage.setItem('rs_takeaway_pack', JSON.stringify(cfg));
      } catch (_) {}
      try {
        if (!global.RS_SETTINGS) {global.RS_SETTINGS = {};}
        global.RS_SETTINGS.set_takeaway_pack = cfg;
        if (global.RS && RS.saveSettings) {await RS.saveSettings(global.RS_SETTINGS);}
      } catch (_) {}
    }
    function openTakeawayPackModal() {
      if (!global.RSModal) {return;}
      const cfg = loadTakeawayPackCfg();
      let items = (cfg.items || []).map((x) => ({
        name: x.name,
        qty: Number(x.qty) || 1,
        unit: x.unit || 'gm',
      }));
      let enabled = cfg.enabled !== false;
      let applyDelivery = cfg.applyDelivery !== false;
      if (!items.length && INVENTORY.length) {
        // Suggest common packaging already in stock
        const sug = INVENTORY.filter((i) => {
          const hay = String(i.name || '').toLowerCase() + ' ' + String(i.cat || '').toLowerCase();
          return /pack|bag|box|napkin|foil|container|carry|parcel/.test(hay);
        }).slice(0, 4);
        items = sug.map((i) => ({
          name: i.name,
          qty: 1,
          unit: i.unit || 'gm',
        }));
      }
      RSModal.open({
        title: 'Takeaway packaging pack',
        sub: 'Auto-used on Takeaway / Delivery — not added to the customer cart',
        icon: 'fa-bag-shopping',
        size: 'md',
        body: `
          <div style="display:flex;flex-direction:column;gap:12px">
            <p class="klc-p" style="margin:0">
              <b>Do not put bags in the POS cart</b> (unless you charge a bag fee as a menu item).
              Industry practice: when order type is <b>Takeaway</b> or <b>Delivery</b>, stock of bag/box/napkin is deducted <b>once per bill</b> automatically.
              Per-dish packaging (e.g. pizza box) still belongs on that dish’s <b>recipe</b>.
            </p>
            <label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer">
              <input type="checkbox" id="tk-en" ${enabled ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--orange)">
              Enable takeaway pack deduction
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="tk-del" ${applyDelivery ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--orange)">
              Also apply on <b>Delivery</b> orders
            </label>
            <div>
              <label class="fl">Pack contents (from stock)</label>
              <div id="tk-list"></div>
              <button type="button" class="btn btn-ghost btn-block" id="tk-add" style="border-style:dashed;margin-top:8px">
                <i class="fa-solid fa-plus"></i> Add packaging item
              </button>
            </div>
            <div style="font-size:12px;color:var(--text-mute);line-height:1.45">
              Example: 1× Paper bag + 2× Napkin per takeaway bill. Units stay kg/gm/ltr/ml as on stock cards.
            </div>
          </div>`,
        foot: `<button type="button" class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
          <button type="button" class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-circle-check"></i> Save pack</button>`,
        onMount(modal, close) {
          const listEl = modal.querySelector('#tk-list');
          function draw() {
            listEl.innerHTML =
              items
                .map(
                  (g, i) =>
                    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                  <span style="flex:1;min-width:100px;font-weight:700">${esc(displayInvName(g.name))}</span>
                  <label style="font-size:11px;color:var(--text-mute)">Qty / order</label>
                  <input type="number" class="form-input" data-tq="${i}" min="0" step="any" value="${esc(g.qty)}" style="width:80px">
                  <span style="font-size:12px;color:var(--text-mute);min-width:36px">${esc(
                    global.RSRecipeUnits && RSRecipeUnits.displayUnit
                      ? RSRecipeUnits.displayUnit(g.unit)
                      : g.unit || ''
                  )}</span>
                  <button type="button" class="icon-act danger" data-td="${i}"><i class="fa-solid fa-trash"></i></button>
                </div>`
                )
                .join('') ||
              '<div class="sr-empty" style="padding:14px;font-size:13px">No items yet — add bag, box, napkin from stock.</div>';
            listEl.querySelectorAll('[data-tq]').forEach((inp) => {
              inp.oninput = () => {
                items[+inp.getAttribute('data-tq')].qty = Number(inp.value) || 0;
              };
            });
            listEl.querySelectorAll('[data-td]').forEach((btn) => {
              btn.onclick = () => {
                items.splice(+btn.getAttribute('data-td'), 1);
                draw();
              };
            });
          }
          draw();
          modal.querySelector('#tk-en').onchange = (e) => {
            enabled = !!e.target.checked;
          };
          modal.querySelector('#tk-del').onchange = (e) => {
            applyDelivery = !!e.target.checked;
          };
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('#tk-add').onclick = () => {
            if (!INVENTORY.length) {
              toast('Add packaging to stock first (e.g. Paper bag)', 'fa-box');
              return;
            }
            global.RSModal.open({
              title: 'Add to takeaway pack',
              sub: 'Pick from store room',
              icon: 'fa-box',
              size: 'sm',
              body: '<input class="form-input" id="tk-q" placeholder="Search packaging…" style="margin-bottom:10px"><div id="tk-pick" class="klc-pick-list"></div>',
              foot: '<button type="button" class="btn btn-ghost" style="flex:1" data-x>Close</button>',
              onMount(sm, sc) {
                sm.querySelector('[data-x]').onclick = sc;
                const q = sm.querySelector('#tk-q');
                const pick = sm.querySelector('#tk-pick');
                function drawP() {
                  const t = (q.value || '').toLowerCase();
                  pick.innerHTML = INVENTORY.filter((i) =>
                    displayInvName(i.name).toLowerCase().includes(t)
                  )
                    .map(
                      (i) =>
                        `<button type="button" class="klc-pick" data-n="${esc(i.name)}" data-u="${esc(i.unit || 'gm')}">
                      <span class="klc-pick-t">${esc(displayInvName(i.name))}</span>
                      <span class="klc-pick-s">${esc(i.cat || '')} · ${Number(i.stock) || 0} ${esc(
                          global.RSRecipeUnits && RSRecipeUnits.displayUnit
                            ? RSRecipeUnits.displayUnit(i.unit)
                            : i.unit || ''
                        )}</span>
                    </button>`
                    )
                    .join('');
                  pick.querySelectorAll('[data-n]').forEach((el) => {
                    el.onclick = () => {
                      const n = el.getAttribute('data-n');
                      if (!items.find((x) => x.name === n)) {
                        items.push({
                          name: n,
                          qty: 1,
                          unit: el.getAttribute('data-u') || 'gm',
                        });
                      }
                      sc();
                      draw();
                    };
                  });
                }
                q.oninput = drawP;
                drawP();
              },
            });
          };
          modal.querySelector('[data-ok]').onclick = async () => {
            const clean = items.filter((x) => x.name && Number(x.qty) > 0);
            const next = {
              enabled: enabled && clean.length > 0,
              applyDelivery,
              items: clean,
            };
            await saveTakeawayPackCfg(next);
            close();
            toast(
              next.enabled
                ? 'Takeaway pack on · ' + clean.length + ' item(s) per Takeaway/Delivery bill'
                : 'Takeaway pack saved (disabled or empty)',
              'fa-bag-shopping'
            );
          };
        },
      });
    }

    const packBtn = $('#btn-inv-takeaway-pack');
    if (packBtn && !packBtn.dataset.wired) {
      packBtn.dataset.wired = '1';
      packBtn.onclick = () => openTakeawayPackModal();
    }
    if (global.RSInventoryUI) {global.RSInventoryUI._openAddStockModal = openAddStockModal;}
    document.dispatchEvent(new CustomEvent('rs:render-inventory'));
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') {
        RS.updateTabAttentionBlinking();
      }
    } catch (e) {}
  }

  // Keep a stable openAdd entry that uses latest modal builder after first render
  function openAddStockModalPublic(opts) {
    if (global.RSInventoryUI && typeof global.RSInventoryUI._openAddStockModal === 'function') {
      return global.RSInventoryUI._openAddStockModal(opts);
    }
    const btn = document.getElementById('btn-add-ingredient');
    if (btn) {btn.click();}
  }

  global.RSInventoryUI = {
    renderInventory,
    lowStockItems,
    exportLowStockCsv,
    confirmAndDraftPos,
    printPurchaseOrder,
    reorderQty,
    paintInventoryBadge,
    openAddStockModal: openAddStockModalPublic,
    openSetCostModal,
    openMissingCostsWizard,
    unitCostOf,
    stockValueOf,
  };

  function attachToRS() {
    if (!global.RS) {return;}
    global.RS.renderInventory = renderInventory;
    global.RS.exportLowStockCsv = exportLowStockCsv;
    global.RS.autoDraftPurchaseOrders = confirmAndDraftPos;
    global.RS.openAddStockModal = openAddStockModalPublic;
  }
  if (global.RS) {attachToRS();}
  document.addEventListener('rs:ready', attachToRS);
  document.addEventListener('rs:hydrated', () => {
    try {
      if (global.RSSkel && RSSkel.markHydrated) {RSSkel.markHydrated();}
      renderInventory();
    } catch (_) {}
  });
})(typeof window !== 'undefined' ? window : globalThis);
