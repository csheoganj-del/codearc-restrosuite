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

  /** Pretty label for keys like hoagie_roll → Hoagie roll */
  function displayInvName(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return '—';
    if (!/[_-]/.test(s) && !/^[a-z0-9]+$/i.test(s)) return s;
    // Only auto-prettify snake/kebab or all-lowercase keys
    if (/[A-Z]/.test(s) && !/[_-]/.test(s) && s.includes(' ')) return s;
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
    if (!row) return null;
    const id = row.getAttribute('data-inv-id');
    const list = getInventory();
    if (id) {
      const byId = list.find((x) => String(x.id) === id || String(x.name) === id || String(x.key) === id);
      if (byId) return byId;
    }
    const name = row.querySelector('b') && row.querySelector('b').textContent;
    if (!name) return null;
    return list.find(
      (x) =>
        x.name === name ||
        displayInvName(x.name) === name ||
        String(x.key || '').replace(/[_-]+/g, ' ') === name.toLowerCase()
    );
  }

  function rebuildCatFilterOptions(inventory) {
    const sel = $('#inv-cat-filter');
    if (!sel) return;
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
          if (nLow) bits.push(nLow + ' low stock');
          if (nExp) bits.push(nExp + ' near expiry');
          badge.title = bits.join(' · ') || '';
        }
      });
    try {
      if (global.RS && typeof RS.updateTabAttentionBlinking === 'function') RS.updateTabAttentionBlinking();
    } catch (_) {}
  }

  function paintExpiryBanner() {
    let bar = document.getElementById('inv-expiry-banner');
    if (!bar) {
      const stockPanel = document.getElementById('inv-panel-stock');
      const host = stockPanel && stockPanel.parentElement;
      if (!host) return;
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
      btn.onclick = () => {
        openExpiringModal(list);
      };
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
        if (ok) ok.onclick = close;
      },
    });
  }

  function openBatchesModal(inv) {
    if (!inv || !global.RSModal) return;
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
        if (ok) ok.onclick = close;
      },
    });
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
    const Batches = global.RSInventoryBatches;

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
            a.onclick = () => {
              if (global.RSKitchenLinkCoach) RSKitchenLinkCoach.openLinkWizard();
            };
          if (c)
            c.onclick = () => {
              if (global.RSKitchenLinkCoach && RSKitchenLinkCoach.openSetupChecklist)
                RSKitchenLinkCoach.openSetupChecklist();
            };
          if (b)
            b.onclick = () => {
              if (global.RSKitchenLinkCoach) RSKitchenLinkCoach.goInventoryTab('recipes');
              else {
                const btn = document.querySelector('#inv-seg [data-inv-tab="recipes"]');
                if (btn) btn.click();
              }
            };
        } else {
          tip.style.display = 'none';
        }
      }
    } catch (_) {}
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
              hasFilters ? 'No ingredients match filters' : 'No stock items yet'
            }</div>
            <div style="color:var(--text-soft);font-size:13px;max-width:360px;margin:0 auto 14px;line-height:1.45">${
              hasFilters
                ? 'Clear search / category / status filters to see full stock.'
                : 'Add ingredients to track min levels, reorders, and plate costing. Import CSV or cloud sync fills this list.'
            }</div>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
              ${
                hasFilters
                  ? '<button type="button" class="btn btn-ghost btn-sm" id="inv-clear-filters"><i class="fa-solid fa-filter-circle-xmark"></i> Clear filters</button>'
                  : ''
              }
              <button type="button" class="btn btn-primary btn-sm" id="inv-empty-add"><i class="fa-solid fa-plus"></i> Add ingredient</button>
            </div>
          </div>
        </td></tr>`;
        const clear = document.getElementById('inv-clear-filters');
        if (clear)
          clear.onclick = () => {
            const c = document.getElementById('inv-cat-filter');
            const s = document.getElementById('inv-status-filter');
            const se = document.getElementById('inv-stock-search');
            if (c) c.value = 'All';
            if (s) s.value = 'All';
            if (se) se.value = '';
            renderInventory();
          };
        const add = document.getElementById('inv-empty-add');
        if (add)
          add.onclick = () => {
            const btn = document.getElementById('btn-add-ingredient');
            if (btn) btn.click();
            else toast('Use Add ingredient in the toolbar', 'fa-plus');
          };
      } else {
      invBody.innerHTML = filtered
        .map((i) => {
          const st = i.stock < i.min ? 'out' : i.stock < i.min * 1.4 ? 'low' : 'ok';
          const pct = Math.min(100, Math.round((i.stock / (i.min * 2 || 1)) * 100));
          const pretty = displayInvName(i.name);
          const costN = Number(i.cost) || 0;
          const costHtml =
            costN > 0
              ? `${rs(costN)}<span class="inv-unit-suffix">/${_e(i.unit || 'unit')}</span>`
              : `<span class="inv-cost-zero" title="Set unit cost for plate costing &amp; POs">₹0 · set cost</span>`;
          const idAttr = esc(invMatchKey(i));
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
          return `<tr data-inv-id="${idAttr}">
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
          <td><div class="row-actions"><button type="button" class="icon-act go" title="Raise purchase order / restock with expiry" aria-label="Restock ${_e(pretty)}"><i class="fa-solid fa-truck"></i></button><button type="button" class="icon-act inv-edit" title="Edit ingredient" aria-label="Edit ${_e(pretty)}"><i class="fa-solid fa-pen"></i></button></div></td>
        </tr>`;
        })
        .join('');
      }

      $$('#inv-table-body .inv-name-btn').forEach((btn) => {
        btn.onclick = () => {
          const row = btn.closest('tr');
          const inv = findInvByRow(row);
          if (inv) openBatchesModal(inv);
        };
      });

      $$('#inv-table-body .icon-act.go').forEach((b) => {
        b.addEventListener('click', () => {
          const row = b.closest('tr');
          const inv = findInvByRow(row);
          if (!inv) return;
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
                  <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Batch expiry</label>
                  <input type="date" id="po-expiry" class="form-control" value="${defExp}" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
                </div>
              </div>
              <div>
                <label class="form-label" style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-soft)">Supplier</label>
                <input type="text" id="po-supplier" class="form-control" value="${_e(inv.supplier || inv.cat || '')} Supplier" style="width:100%;padding:8px;border:1px solid var(--stroke);border-radius:6px;background:var(--panel);color:var(--text)">
              </div>
              <div style="font-size:12px;color:var(--text-mute)">
                Est. value: <strong style="color:var(--orange)" id="po-cost-preview">${rs(estimatedCost)}</strong>
                · Expiry drives <b>use first</b> (FEFO)
              </div>
            </div>
          `;

          RSModal.open({
            title: 'Restock · ' + displayInvName(inv.name),
            sub: 'Receive now with expiry, or draft a PO',
            icon: 'fa-truck',
            size: 'sm',
            body,
            foot: `<button class="btn btn-ghost" data-cancel>Cancel</button>
              <button class="btn btn-ghost" data-po title="Create PO only"><i class="fa-solid fa-file-invoice"></i> PO</button>
              <button class="btn btn-primary" data-recv><i class="fa-solid fa-box-open"></i> Receive now</button>`,
            onMount(modal, close) {
              const qtyInput = modal.querySelector('#po-qty');
              qtyInput.oninput = () => {
                const q = Math.max(0, Number(qtyInput.value) || 0);
                modal.querySelector('#po-cost-preview').textContent = rs(Math.round(q * inv.cost));
              };
              modal.querySelector('[data-cancel]').onclick = close;
              const makeLine = () => {
                const qty = Math.max(1, Number(qtyInput.value) || 1);
                const supplier = modal.querySelector('#po-supplier').value || 'Default Supplier';
                const expiryDate = (modal.querySelector('#po-expiry') && modal.querySelector('#po-expiry').value) || null;
                return { qty, supplier, expiryDate };
              };
              modal.querySelector('[data-po]').onclick = async () => {
                const { qty, supplier, expiryDate } = makeLine();
                const poNum = nextLogicalNo('PO');
                const line = {
                  name: inv.name,
                  unit: inv.unit || 'unit',
                  qty,
                  cost: Number(inv.cost) || 0,
                  value: Math.round(qty * (Number(inv.cost) || 0)),
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
                  if (global.RS && RS.saveOne) await RS.saveOne('purchase_orders', poRow);
                  else if (global.RS_DB) await RS_DB.put('purchase_orders', poRow.id, poRow);
                  toast('PO raised · receive later with expiry', 'fa-circle-check');
                  document.dispatchEvent(new CustomEvent('rs:render-inventory'));
                  renderInventory();
                } catch (e) {
                  toast('Could not save PO', 'fa-circle-exclamation');
                }
              };
              modal.querySelector('[data-recv]').onclick = async () => {
                const { qty, expiryDate } = makeLine();
                close();
                setOperationStatus('Receiving stock...');
                try {
                  inv.stock = Math.max(0, Number(inv.stock) || 0) + qty;
                  if (global.RS_DB) await RS_DB.put('inventory', inv.id, inv);
                  if (global.RSInventoryBatches && RSInventoryBatches.receiveBatch) {
                    await RSInventoryBatches.receiveBatch({
                      item: inv,
                      qty,
                      unit: inv.unit,
                      expiryDate,
                      source: 'quick_receive',
                      cost: inv.cost,
                    });
                  }
                  finishOperationStatus('Stock received');
                  toast(
                    `+${qty} ${inv.unit || ''} ${displayInvName(inv.name)}` +
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
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Unit cost (${rs(1).replace(/[\d.,]/g, '').trim() || '₹'})</label><input class="form-input" id="edit-ing-cost" type="number" min="0" step="any" value="${inv.cost}"></div>
                <div><label class="fl">Supplier</label><input class="form-input" id="edit-ing-supplier" value="${_e(inv.supplier || inv.vendor || '')}" placeholder="Optional"></div>
              </div>
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
                inv.supplier = (modal.querySelector('#edit-ing-supplier').value || '').trim();
                close();
                setOperationStatus('Saving changes...');
                try {
                  if (global.RS_DB) await RS_DB.put('inventory', inv.id, inv);
                  finishOperationStatus('Ingredient updated');
                  toast(`${displayInvName(inv.name)} updated · synced`, 'fa-circle-check');
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
          // Hide toolbar actions that only apply to stock list when on other tabs
          const stockOnly = [
            'btn-add-ingredient',
            'btn-import-inventory',
            'btn-download-inventory-template',
            'btn-export-low-stock-toolbar',
            'inv-stock-search',
          ];
          stockOnly.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'inv-stock-search') {
              const wrap = el.closest('.inv-search-wrap') || el;
              wrap.style.display = tab === 'stock' ? '' : 'none';
            } else {
              el.style.display = tab === 'stock' ? '' : 'none';
            }
          });
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
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div><label class="fl">Unit cost (₹)</label><input class="form-input" id="add-ing-cost" type="number" min="0" step="any" placeholder="0"></div>
                <div><label class="fl">Supplier (optional)</label><input class="form-input" id="add-ing-supplier" placeholder="e.g. Metro Cash"></div>
              </div>
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
                supplier: (modal.querySelector('#add-ing-supplier').value || '').trim(),
              };
              INVENTORY.push(item);
              try {
                if (global.RS_DB) await RS_DB.put('inventory', item.id, item);
                toast(`${name} added · synced`, 'fa-circle-check');
              } catch (e) {
                console.warn('add ingredient save', e);
                toast(`${name} added locally · cloud pending`, 'fa-circle-exclamation');
              }
              close();
              renderInventory();
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
