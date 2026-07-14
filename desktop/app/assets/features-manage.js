/* ============================================================
   RestroSuite -- Inventory & Employees sub-tabs
   ============================================================ */
(function(){
  'use strict';
  // HTML escaping -- prevents XSS when inserting DB-sourced strings into innerHTML
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  // Alias: some render paths (Employee Ledger "Logins" tab) call safe() --
  // it was never defined in this module, crashing with "safe is not defined".
  const safe = esc;
  function boot(){
    const RS = window.RS, rs = RS.rs;
    const $ = (s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

    /* ---- segmented sub-tab controller ---- */
    function wireSeg(sectionSel, names){
      const sec = $(sectionSel); if(!sec || sec.dataset.segWired) return; sec.dataset.segWired='1';
      const segBtns = $$('.seg button', sec);
      segBtns.forEach((b,i)=> b.onclick=()=>{ segBtns.forEach(x=>x.classList.toggle('active',x===b)); $$('.subtab-pane', sec).forEach(p=>p.classList.toggle('active', p.dataset.pane===names[i])); sec.dispatchEvent(new CustomEvent('rs:subtab-change', { detail:{ pane:names[i], index:i } })); });
    }

    /* ============== INVENTORY ============== */
    const SUPPLIERS = [];
    const POS_ORDERS = [];
    const WASTE = [];
    const poPill = {
      pending: 'pill-amber',
      sent: 'pill-violet',
      partial: 'pill-orange',
      received: 'pill-green',
      cancelled: 'pill-red',
      canceled: 'pill-red',
    };
    let poListFilter = 'open'; // open | all | received | cancelled

    function parsePoLines(p) {
      if (Array.isArray(p.lines) && p.lines.length) {
        return p.lines.map((l) => ({
          name: l.name || 'Item',
          unit: l.unit || 'unit',
          qty: Math.max(0, Number(l.qty) || 0),
          cost: Number(l.cost) || 0,
          value: Number(l.value) || 0,
          invId: l.invId || l.id || null,
        }));
      }
      return String(p.items || p.itemsText || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/^(\d+(?:\.\d+)?)\s+(\S+)\s+(.+)$/);
          if (m) return { name: m[3].trim(), unit: m[2], qty: Number(m[1]) || 1, cost: 0, value: 0, invId: null };
          return { name: s, unit: 'unit', qty: 1, cost: 0, value: 0, invId: null };
        });
    }

    async function saveInventoryItem(item) {
      if (window.RS_DB && RS_DB.put) await RS_DB.put('inventory', item.id, item);
      else if (RS.saveOne) await RS.saveOne('inventory', item);
    }

    async function savePo(row) {
      if (RS.saveOne) return RS.saveOne('purchase_orders', row);
      if (window.RS_DB && RS_DB.put) return RS_DB.put('purchase_orders', row.id, row);
    }

    function staffName() {
      try {
        const s = window.RS_API && RS_API.session && RS_API.session();
        return (s && (s.display_name || s.username)) || 'staff';
      } catch (_) {
        return 'staff';
      }
    }

    function remainingPoLines(p) {
      const ordered = parsePoLines(p);
      const receivedMap = {};
      (Array.isArray(p.receivedLines) ? p.receivedLines : []).forEach((r) => {
        const k = String(r.name || '').toLowerCase();
        receivedMap[k] = (receivedMap[k] || 0) + (Number(r.qty) || 0);
      });
      return ordered
        .map((l) => {
          const got = receivedMap[String(l.name).toLowerCase()] || 0;
          const left = Math.max(0, (Number(l.qty) || 0) - got);
          return { ...l, orderedQty: Number(l.qty) || 0, receivedQty: got, qty: left };
        })
        .filter((l) => l.qty > 0.0001);
    }

    async function applyStockForLines(lines, opts) {
      const options = opts || {};
      const inv = RS.INVENTORY || [];
      let updated = 0;
      let created = 0;
      const Batches = window.RSInventoryBatches;
      for (const line of lines) {
        if (!line.name || !(Number(line.qty) > 0)) continue;
        let item =
          (line.invId && inv.find((i) => String(i.id) === String(line.invId))) ||
          inv.find((i) => i.name && String(i.name).toLowerCase() === String(line.name).toLowerCase());
        if (item) {
          item.stock = Math.max(0, Number(item.stock) || 0) + Number(line.qty);
          if (line.cost > 0 && !(Number(item.cost) > 0)) item.cost = line.cost;
          await saveInventoryItem(item);
          if (Batches && typeof Batches.receiveBatch === 'function') {
            try {
              await Batches.receiveBatch({
                item,
                qty: Number(line.qty),
                unit: line.unit || item.unit,
                expiryDate: line.expiryDate || options.defaultExpiry || null,
                receivedDate: options.receivedDate || new Date(),
                source: options.source || 'po_receive',
                poId: options.poId || null,
                cost: line.cost != null ? line.cost : item.cost,
              });
            } catch (e) {
              console.warn('[FEFO] receiveBatch failed', e);
            }
          }
          updated++;
        } else if (options.createMissing !== false) {
          const id =
            'inv_' +
            String(line.name)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '') +
            '_' +
            Date.now().toString(36);
          const neo = {
            id,
            name: line.name,
            cat: 'Received',
            unit: line.unit || 'unit',
            stock: Number(line.qty) || 0,
            min: 10,
            cost: Number(line.cost) || 0,
          };
          inv.push(neo);
          await saveInventoryItem(neo);
          if (Batches && typeof Batches.receiveBatch === 'function') {
            try {
              await Batches.receiveBatch({
                item: neo,
                qty: Number(line.qty),
                unit: neo.unit,
                expiryDate: line.expiryDate || options.defaultExpiry || null,
                receivedDate: options.receivedDate || new Date(),
                source: options.source || 'po_receive',
                poId: options.poId || null,
                cost: neo.cost,
              });
            } catch (e) {
              console.warn('[FEFO] receiveBatch failed', e);
            }
          }
          created++;
        }
      }
      return { updated, created };
    }

    async function receivePurchaseOrder(p, opts) {
      const options = opts || {};
      if (!p || p.status === 'received') {
        RS.toast('PO already fully received', 'fa-circle-info');
        return false;
      }
      if (p.status === 'cancelled' || p.status === 'canceled') {
        RS.toast('PO is cancelled', 'fa-circle-exclamation');
        return false;
      }
      // linesToReceive: optional override for partial; default all remaining
      const remaining = remainingPoLines(p);
      const lines = Array.isArray(options.linesToReceive)
        ? options.linesToReceive.filter((l) => l && Number(l.qty) > 0)
        : remaining;
      if (!lines.length) {
        RS.toast('Nothing left to receive on this PO', 'fa-circle-exclamation');
        return false;
      }
      const { updated, created } = await applyStockForLines(lines, {
        ...options,
        poId: p.poNumber || p.po || p.id,
        source: 'po_receive',
      });

      // Track cumulative received quantities
      if (!Array.isArray(p.receivedLines)) p.receivedLines = [];
      lines.forEach((l) => {
        p.receivedLines.push({
          name: l.name,
          unit: l.unit,
          qty: Number(l.qty) || 0,
          at: new Date().toISOString(),
          by: staffName(),
        });
      });
      if (!Array.isArray(p.receipts)) p.receipts = [];
      p.receipts.push({
        at: new Date().toISOString(),
        by: staffName(),
        lines: lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit })),
      });

      const stillLeft = remainingPoLines(p);
      const full = stillLeft.length === 0;
      p.status = full ? 'received' : 'partial';
      p.receivedAt = new Date().toISOString();
      p.receivedBy = staffName();
      p.po = p.poNumber || p.po || p.id;
      // Refresh items string for open remainder
      if (!full) {
        p.items = stillLeft.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(', ');
      }
      await savePo(p);
      try {
        if (window.RSInventoryUI && RSInventoryUI.paintInventoryBadge) RSInventoryUI.paintInventoryBadge();
        if (RS.renderInventory) RS.renderInventory();
      } catch (_) {}
      RS.toast(
        `${full ? 'Fully received' : 'Partial receive'} ${p.poNumber || p.po || p.id}: +stock on ${updated} item(s)${created ? ', ' + created + ' new' : ''}`,
        'fa-box-open'
      );
      return true;
    }

    async function cancelPurchaseOrder(p, reason) {
      if (!p) return false;
      if (p.status === 'received') {
        RS.toast('Cannot cancel a fully received PO', 'fa-circle-exclamation');
        return false;
      }
      if (p.status === 'cancelled' || p.status === 'canceled') {
        RS.toast('PO already cancelled', 'fa-circle-info');
        return false;
      }
      p.status = 'cancelled';
      p.cancelledAt = new Date().toISOString();
      p.cancelledBy = staffName();
      p.cancelReason = reason || 'Cancelled';
      p.po = p.poNumber || p.po || p.id;
      await savePo(p);
      RS.toast('PO ' + (p.poNumber || p.po) + ' cancelled', 'fa-ban');
      return true;
    }

    function openReceiveModal(p) {
      if (!window.RSModal) {
        return receivePurchaseOrder(p);
      }
      const remaining = remainingPoLines(p);
      if (!remaining.length) {
        RS.toast('Nothing left to receive', 'fa-circle-check');
        return Promise.resolve(false);
      }
      const defaultExp = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().slice(0, 10);
      })();
      const rows = remaining
        .map(
          (l, i) => `
        <tr>
          <td style="font-weight:600">${esc(l.name)}</td>
          <td style="color:var(--text-soft);font-size:12px">${esc(l.orderedQty)} ${esc(l.unit)}${l.receivedQty ? ' · got ' + l.receivedQty : ''}</td>
          <td><input type="number" class="form-input" data-recv-i="${i}" min="0" step="any" max="${l.qty}" value="${l.qty}" style="width:90px;padding:6px 8px;font-size:13px"></td>
          <td><input type="date" class="form-input" data-exp-i="${i}" value="${defaultExp}" style="width:140px;padding:6px 8px;font-size:12px" title="Batch expiry — FEFO uses soonest first"></td>
        </tr>`
        )
        .join('');
      return new Promise((resolve) => {
        RSModal.open({
          title: 'Receive stock · ' + (p.poNumber || p.po || p.id),
          sub: 'Qty + expiry per line · soonest expiry is used first (FEFO)',
          icon: 'fa-box-open',
          size: 'md',
          body: `<table class="data-table"><thead><tr><th>Item</th><th>Ordered / prior</th><th>Receive now</th><th>Expiry date</th></tr></thead>
            <tbody>${rows}</tbody></table>
            <p style="margin:10px 0 0;font-size:12px;color:var(--text-soft);line-height:1.45">
              <i class="fa-solid fa-circle-info" style="color:var(--orange)"></i>
              Each receive creates a <b>batch</b>. Kitchen should use the batch that expires soonest first.
            </p>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn-ghost btn-sm" data-all>All remaining</button>
              <button type="button" class="btn btn-ghost btn-sm" data-zero>Clear all</button>
            </div>`,
          foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button>
            <button class="btn btn-primary" style="flex:1.2" data-ok><i class="fa-solid fa-box-open"></i> Confirm receive</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = () => {
              close();
              resolve(false);
            };
            modal.querySelector('[data-all]').onclick = () => {
              remaining.forEach((l, i) => {
                const inp = modal.querySelector(`[data-recv-i="${i}"]`);
                if (inp) inp.value = l.qty;
              });
            };
            modal.querySelector('[data-zero]').onclick = () => {
              modal.querySelectorAll('[data-recv-i]').forEach((inp) => {
                inp.value = '0';
              });
            };
            modal.querySelector('[data-ok]').onclick = async () => {
              const toRecv = remaining
                .map((l, i) => {
                  const inp = modal.querySelector(`[data-recv-i="${i}"]`);
                  const exp = modal.querySelector(`[data-exp-i="${i}"]`);
                  let q = Math.max(0, Number(inp && inp.value) || 0);
                  if (q > l.qty) q = l.qty;
                  return { ...l, qty: q, expiryDate: (exp && exp.value) || null };
                })
                .filter((l) => l.qty > 0);
              if (!toRecv.length) {
                RS.toast('Enter at least one quantity', 'fa-circle-exclamation');
                return;
              }
              close();
              const ok = await receivePurchaseOrder(p, { linesToReceive: toRecv });
              resolve(ok);
            };
          },
        });
      });
    }

    function printPoRow(p) {
      if (window.RSInventoryUI && typeof RSInventoryUI.printPurchaseOrder === 'function') {
        RSInventoryUI.printPurchaseOrder({
          ...p,
          poNumber: p.poNumber || p.po || p.id,
          lines: parsePoLines(p),
        });
        return;
      }
      if (typeof window.RSPrint === 'function') {
        const lines = parsePoLines(p)
          .map((l) => `<div>${esc(l.qty)} ${esc(l.unit)} · ${esc(l.name)}</div>`)
          .join('');
        RSPrint(
          `<div style="max-width:320px;margin:0 auto"><b>PO ${esc(p.poNumber || p.po)}</b><br>${esc(p.sup || p.supplier)}<br>${lines}<br>Total ${rs(p.value)}</div>`,
          'PO'
        );
      }
    }

    function viewPoModal(p) {
      if (!window.RSModal) return;
      const lines = parsePoLines(p);
      const remaining = remainingPoLines(p);
      const bodyLines = lines.length
        ? lines
            .map((l) => {
              const got = (Array.isArray(p.receivedLines) ? p.receivedLines : [])
                .filter((r) => String(r.name).toLowerCase() === String(l.name).toLowerCase())
                .reduce((a, r) => a + (Number(r.qty) || 0), 0);
              const left = Math.max(0, (Number(l.qty) || 0) - got);
              return `<tr><td>${esc(l.name)}</td><td>${esc(l.qty)} ${esc(l.unit)}${got ? ' <span style="color:var(--text-mute)">(got ' + got + (left ? ', left ' + left : '') + ')</span>' : ''}</td><td style="text-align:right">${rs(l.value || l.qty * (l.cost || 0))}</td></tr>`;
            })
            .join('')
        : `<tr><td colspan="3">${esc(p.items || '—')}</td></tr>`;
      const canReceive =
        p.status !== 'received' &&
        p.status !== 'cancelled' &&
        p.status !== 'canceled' &&
        remaining.length > 0;
      const canCancel =
        p.status !== 'received' && p.status !== 'cancelled' && p.status !== 'canceled';
      RSModal.open({
        title: 'PO ' + (p.poNumber || p.po || p.id),
        sub: (p.sup || p.supplier || '') + ' · ' + (p.status || 'pending'),
        icon: 'fa-file-invoice',
        size: 'md',
        body: `<div style="font-size:12.5px;color:var(--text-soft);margin-bottom:10px">
          Date: <b style="color:var(--text)">${esc(p.dateRaw || p.date || '—')}</b>
          ${p.receivedAt ? ' · Last receive: <b style="color:var(--text)">' + esc(new Date(p.receivedAt).toLocaleString()) + '</b>' : ''}
          ${p.cancelReason ? ' · Cancel: ' + esc(p.cancelReason) : ''}
        </div>
        <table class="data-table"><thead><tr><th>Item</th><th>Qty</th><th style="text-align:right">Value</th></tr></thead>
        <tbody>${bodyLines}</tbody></table>
        <div style="margin-top:12px;font-weight:800;text-align:right">Total ${rs(p.value)}</div>`,
        foot: `<button class="btn btn-ghost" style="flex:1" data-x>Close</button>
          <button class="btn btn-ghost" style="flex:1" data-print><i class="fa-solid fa-print"></i> Print</button>
          ${canCancel ? '<button class="btn btn-ghost" style="flex:1;color:var(--red)" data-cancel-po><i class="fa-solid fa-ban"></i> Cancel</button>' : ''}
          ${canReceive ? '<button class="btn btn-primary" style="flex:1.2" data-recv><i class="fa-solid fa-box-open"></i> Receive…</button>' : ''}`,
        onMount(modal, close) {
          modal.querySelector('[data-x]').onclick = close;
          modal.querySelector('[data-print]').onclick = () => printPoRow(p);
          const cancelBtn = modal.querySelector('[data-cancel-po]');
          if (cancelBtn)
            cancelBtn.onclick = async () => {
              const reason = window.prompt('Cancel reason (optional)', 'Not needed');
              if (reason === null) return;
              close();
              const ok = await cancelPurchaseOrder(p, reason || 'Cancelled');
              if (ok) drawPanes();
            };
          const recv = modal.querySelector('[data-recv]');
          if (recv)
            recv.onclick = async () => {
              close();
              const ok = await openReceiveModal(p);
              if (ok) drawPanes();
            };
        },
      });
    }

    function filteredPosOrders() {
      return POS_ORDERS.filter((p) => {
        const s = String(p.status || 'pending').toLowerCase();
        if (poListFilter === 'all') return true;
        if (poListFilter === 'received') return s === 'received';
        if (poListFilter === 'cancelled') return s === 'cancelled' || s === 'canceled';
        // open = pending, sent, partial
        return s === 'pending' || s === 'sent' || s === 'partial';
      });
    }

    function enhanceInventory(){
      const sec = $('#inventory-tab'); if(!sec || sec.dataset.enhanced) return; sec.dataset.enhanced='1';
      // Prefer stock panel by id (not first .panel which can be wrong)
      const stock = sec.querySelector('#inv-panel-stock') || sec.querySelector('.panel');
      if (stock) {
        stock.classList.add('subtab-pane', 'active');
        stock.dataset.pane = 'stock';
      }
      // Remove static stub shells so live panes below are the single source of truth
      ['inv-panel-suppliers', 'inv-panel-pos', 'inv-panel-waste'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
      // Hide static recipes shell so live panes below are the single UI (avoids double tables)
      const staticRec = document.getElementById('inv-panel-recipes');
      if (staticRec) {
        staticRec.style.display = 'none';
        staticRec.hidden = true;
        staticRec.dataset.pane = 'recipes-fallback';
      }
      const panes = document.createElement('div');
      panes.id = 'inv-panes-wrapper';
      sec.appendChild(panes);

      document.addEventListener('rs:render-inventory', drawPanes);

      function openRecipeEditModal(m) {
        let draft = (m.ingredients || []).map((g) => ({
          name: g.name,
          qty: Number(g.qty) || 0,
          unit: g.unit || 'unit',
          key: g.key,
        }));
        let recipeServings = Math.max(1, Number(m.recipeServings) || 1);
        let serveUnit = m.serveUnit || 'plate';
        const RU = window.RSRecipeUnits;

        function serveLabel() {
          if (RU && RU.serveUnitLabel) return RU.serveUnitLabel(serveUnit);
          return serveUnit || 'plate';
        }

        function drawDraft(modalBody) {
          const listEl = modalBody.querySelector('#rec-modal-list');
          const hint = modalBody.querySelector('#rec-serve-hint');
          if (hint) {
            hint.innerHTML = `Enter how much stock is used for <b>${recipeServings}</b> ${esc(serveLabel().toLowerCase())}${
              recipeServings === 1 ? '' : 's'
            }. When the guest orders <b>1</b> ${esc(serveLabel().toLowerCase())}, stock goes down by (qty ÷ ${recipeServings}).`;
          }
          listEl.innerHTML =
            draft
              .map((g, i) => {
                const inv =
                  (RU && RU.findInventory && RU.findInventory(g, RS.INVENTORY)) ||
                  (RS.INVENTORY || []).find((x) => x.name === g.name);
                const invUnit = (inv && inv.unit) || g.unit || 'unit';
                const unitMismatch =
                  inv &&
                  g.unit &&
                  RU &&
                  RU.normUnit &&
                  RU.normUnit(g.unit) !== RU.normUnit(invUnit) &&
                  RU.convertQty(1, g.unit, invUnit) == null;
                return `
            <div class="rec-ing-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;min-width:120px;font-weight:600;font-size:14px">${esc(g.name)}</span>
              <label style="font-size:11px;color:var(--text-mute)">Qty</label>
              <input class="form-input" type="number" step="any" min="0" value="${g.qty}" data-qty-i="${i}" style="width:88px;padding:5px 8px;font-size:13px;text-align:right">
              <select class="form-input" data-unit-i="${i}" style="width:88px;padding:5px 6px;font-size:12.5px" title="Unit: kg, gm, ltr, ml">
                ${(() => {
                  const units = (RU && RU.STOCK_UNITS) || ['kg', 'gm', 'ltr', 'ml'];
                  const cur = RU && RU.displayUnit ? RU.displayUnit(g.unit || invUnit) : g.unit || invUnit || 'kg';
                  let html = units
                    .map(
                      (u) =>
                        `<option value="${esc(u)}" ${String(cur) === u || String(g.unit) === u ? 'selected' : ''}>${esc(u)}</option>`
                    )
                    .join('');
                  if (g.unit && units.indexOf(String(cur)) === -1 && units.indexOf(String(g.unit)) === -1) {
                    html += `<option value="${esc(g.unit)}" selected>${esc(g.unit)} (old)</option>`;
                  }
                  return html;
                })()}
              </select>
              <span style="font-size:11px;color:var(--text-mute);min-width:70px">stock: ${esc(
                RU && RU.displayUnit ? RU.displayUnit(invUnit) : invUnit
              )}</span>
              ${
                unitMismatch
                  ? '<span style="font-size:11px;color:var(--amber);font-weight:700">unit ≠ stock</span>'
                  : ''
              }
              <button class="icon-act danger" data-del-i="${i}" style="width:30px;height:30px"><i class="fa-solid fa-trash"></i></button>
            </div>`;
              })
              .join('') ||
            `<div style="text-align:center;padding:20px 0;color:var(--text-mute);font-style:italic">No stock items yet. Click Add from store room.</div>`;

          listEl.querySelectorAll('[data-qty-i]').forEach((inp) => {
            inp.oninput = () => {
              const idx = +inp.dataset.qtyI;
              draft[idx].qty = Number(inp.value) || 0;
            };
          });
          listEl.querySelectorAll('[data-unit-i]').forEach((sel) => {
            sel.onchange = () => {
              const idx = +sel.dataset.unitI;
              draft[idx].unit = sel.value || 'unit';
              drawDraft(modalBody);
            };
          });
          listEl.querySelectorAll('[data-del-i]').forEach((btn) => {
            btn.onclick = () => {
              const idx = +btn.dataset.delI;
              draft.splice(idx, 1);
              drawDraft(modalBody);
            };
          });
        }

        const servingsHtml =
          RU && RU.servingsSelectHtml
            ? RU.servingsSelectHtml(recipeServings, 'rec-servings')
            : `<input class="form-input" id="rec-servings" type="number" min="1" value="${recipeServings}">`;
        const serveUnitHtml =
          RU && RU.serveUnitSelectHtml
            ? RU.serveUnitSelectHtml(serveUnit, 'rec-serve-unit')
            : `<input class="form-input" id="rec-serve-unit" value="${esc(serveUnit)}">`;

        RSModal.open({
          title: `Recipe · ${m.name}`,
          sub: 'Servings + units · stock deducts when this dish is sold',
          icon: 'fa-clipboard-list',
          size: 'md',
          body: `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div class="rec-serve-bar" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border:1px solid var(--stroke);border-radius:10px;background:var(--glass)">
                <div>
                  <label class="fl">Sold as (menu unit)</label>
                  ${serveUnitHtml}
                </div>
                <div>
                  <label class="fl">Recipe is written for</label>
                  ${servingsHtml}
                  <input class="form-input" id="rec-servings-custom" type="number" min="1" step="1" placeholder="Custom servings" style="display:none;margin-top:6px">
                </div>
              </div>
              <p id="rec-serve-hint" style="margin:0;font-size:13px;color:var(--text-soft);line-height:1.45"></p>
              <div id="rec-modal-list" style="max-height:280px;overflow:auto"></div>
              <button class="btn btn-ghost btn-block" id="rec-modal-add" style="border-style:dashed"><i class="fa-solid fa-plus"></i> Add from store room</button>
            </div>
          `,
          foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-ok><i class="fa-solid fa-circle-check"></i> Save recipe</button>`,
          onMount(modal, close) {
            modal.querySelector('[data-x]').onclick = close;
            const servSel = modal.querySelector('#rec-servings');
            const servCustom = modal.querySelector('#rec-servings-custom');
            const unitSel = modal.querySelector('#rec-serve-unit');
            const syncServe = () => {
              if (unitSel) serveUnit = unitSel.value || 'plate';
              if (servSel) {
                if (servSel.value === '__custom__') {
                  servCustom.style.display = '';
                  recipeServings = Math.max(1, Number(servCustom.value) || 1);
                } else {
                  servCustom.style.display = 'none';
                  recipeServings = Math.max(1, Number(servSel.value) || 1);
                }
              }
              drawDraft(modal);
            };
            if (servSel) servSel.onchange = syncServe;
            if (servCustom) servCustom.oninput = syncServe;
            if (unitSel) unitSel.onchange = syncServe;

            modal.querySelector('#rec-modal-add').onclick = () => {
              const list = RS.INVENTORY || [];
              RSModal.open({
                title: 'Add from store room',
                sub: 'Food or packaging — unit comes from stock',
                icon: 'fa-boxes-stacked',
                size: 'sm',
                body: `<input class="form-input" id="ing-q" placeholder="Search stock…" style="margin-bottom:12px">
                      <div id="ing-pick" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto"></div>`,
                onMount(subModal, subClose) {
                  const q = subModal.querySelector('#ing-q'),
                    box = subModal.querySelector('#ing-pick');
                  function pretty(n) {
                    const s = String(n || '');
                    return /[_-]/.test(s)
                      ? s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                      : s;
                  }
                  function draw() {
                    const t = (q.value || '').toLowerCase();
                    const filtered = list.filter(
                      (i) =>
                        String(i.name || '')
                          .toLowerCase()
                          .includes(t) ||
                        pretty(i.name).toLowerCase().includes(t) ||
                        String(i.cat || '')
                          .toLowerCase()
                          .includes(t)
                    );
                    box.innerHTML =
                      filtered
                        .map((i) => {
                          const cost = Number(i.cost) || 0;
                          const u = i.unit || 'unit';
                          const costLabel = cost > 0 ? rs(cost) + '/' + esc(u) : '₹0 · set cost';
                          return `<div class="sr-item" data-n="${esc(i.name)}" data-u="${esc(u)}"><span class="si-ic"><i class="fa-solid fa-cube"></i></span><div><div class="si-t">${esc(pretty(i.name))}</div><div class="si-s">${esc(i.cat || '—')} · unit <b>${esc(u)}</b> · ${costLabel} · stock ${Number(i.stock) || 0}</div></div><span class="si-meta">+ add</span></div>`;
                        })
                        .join('') ||
                      '<div class="sr-empty">No match — add under Stock levels first</div>';
                    box.querySelectorAll('[data-n]').forEach((el) => {
                      el.onclick = () => {
                        const exists = draft.find((g) => g.name === el.dataset.n);
                        if (!exists) {
                          draft.push({
                            name: el.dataset.n,
                            qty: 1,
                            unit: el.dataset.u || 'unit',
                          });
                        }
                        subClose();
                        drawDraft(modal);
                      };
                    });
                  }
                  q.addEventListener('input', draw);
                  draw();
                  q.focus();
                },
              });
            };

            modal.querySelector('[data-ok]').onclick = async () => {
              syncServe();
              m.ingredients = draft.map((g) => ({
                name: g.name,
                qty: Number(g.qty) || 0,
                unit: g.unit || 'unit',
              }));
              m.recipeServings = recipeServings;
              m.serveUnit = serveUnit;
              if (RS.saveOne) await RS.saveOne('menu', m);
              close();
              drawPanes();
              RS.toast(
                `Recipe saved · per ${recipeServings} ${serveLabel().toLowerCase()}${recipeServings === 1 ? '' : 's'}`,
                'fa-circle-check'
              );
            };

            drawDraft(modal);
          },
        });
      }

      function drawPanes() {
        panes.innerHTML = `
          <div class="panel panel-pad subtab-pane" data-pane="recipes">
            <div id="klc-coach-host" style="margin-bottom:14px">${
              window.RSKitchenLinkCoach && RSKitchenLinkCoach.coachCardHtml
                ? RSKitchenLinkCoach.coachCardHtml()
                : ''
            }</div>
            <div class="panel-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <div>
                <h3 style="margin:0">Menu Recipes</h3>
                <div style="font-size:12.5px;color:var(--text-soft);margin-top:4px">Link each dish to store-room stock (qty + unit). Sales then reduce stock automatically.</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-ghost btn-sm" id="recipe-filter-all">All</button>
                <button type="button" class="btn btn-ghost btn-sm" id="recipe-filter-linked">Linked</button>
                <button type="button" class="btn btn-ghost btn-sm" id="recipe-filter-missing">Needs recipe</button>
                <button type="button" class="btn btn-ghost btn-sm" id="btn-export-recipes" title="Export recipes to CSV (re-importable)"><i class="fa-solid fa-file-export"></i> Export</button>
                <button type="button" class="btn btn-ghost btn-sm" id="bulk-recipe-import" title="For advanced users"><i class="fa-solid fa-file-arrow-up"></i> Bulk Import</button>
              </div>
            </div>
            <div id="recipe-coverage-bar" class="recipe-coverage-bar" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px"></div>
            <div id="recipe-next-step" class="recipe-next-step" style="display:none;margin-bottom:12px"></div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
              <div class="pos-search" style="max-width:280px;padding:8px 12px;flex:1">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input id="recipe-search" placeholder="Search menu item or category…" autocomplete="off" aria-label="Search recipes">
              </div>
            </div>
            <div class="recipe-plain-tip" style="display:flex;gap:8px;align-items:flex-start;padding:10px 12px;margin-bottom:12px;border:1px solid var(--stroke);border-radius:var(--r-sm);background:var(--glass-2);font-size:12px;color:var(--text-soft);line-height:1.5">
              <i class="fa-solid fa-circle-info" style="color:var(--orange);margin-top:2px"></i>
              <div><strong style="color:var(--text)">How stock is calculated:</strong> write the recipe for e.g. <b>1 plate</b> (or 4 servings). When a guest buys that dish, stock falls by <b>recipe amount ÷ servings × sold qty</b>. Units: <b>kg, gm, ltr, ml</b> only (kg↔gm and ltr↔ml convert automatically).</div>
            </div>
            <div class="table-scroll"><table class="data-table recipe-table">
              <thead><tr><th>Menu Item</th><th>Category</th><th>Serve</th><th>Sell</th><th>Plate cost</th><th>Margin</th><th>Uses from stock</th><th>Actions</th></tr></thead>
              <tbody id="recipe-list-body"></tbody>
            </table></div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="suppliers">
            <div class="panel-head" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <h3 style="margin:0">Suppliers</h3>
              <span class="pill" style="padding:3px 9px">${SUPPLIERS.length} vendor${SUPPLIERS.length===1?'':'s'}</span>
              <div class="grow"></div>
              ${window.RSViewMode ? RSViewMode.toggleHtml('suppliers', (window.RSViewMode.get('suppliers','list'))) : ''}
              <button type="button" class="btn btn-primary btn-sm" id="add-sup"><i class="fa-solid fa-plus"></i> Add supplier</button>
            </div>
            ${
              SUPPLIERS.length
                ? (() => {
                    const mode = window.RSViewMode ? RSViewMode.get('suppliers', 'list') : 'list';
                    const colors = (RS && RS.avatarColors) || ['#FF4F00', '#7c3aed', '#0ea5e9', '#16a34a', '#ca8a04'];
                    if (mode === 'list') {
                      return `<div class="rs-line-list">
                        <div class="rs-line-head sup-line-head">
                          <span>Supplier</span><span>Category</span><span>Contact</span><span>Terms</span><span class="rl-num">Items</span><span class="rl-num">Rating</span>
                        </div>
                        ${SUPPLIERS.map((s) => `
                        <div class="rs-line-row sup-line-row" data-sup-id="${esc(s.id || s.name)}">
                          <span class="rl-name">${esc(s.name)}</span>
                          <span class="rl-mute">${esc(s.cat || s.category || 'General')}</span>
                          <span class="rl-mute">${esc(s.contact || '—')}</span>
                          <span class="rl-mute">${esc(s.terms || 'Net 30')}</span>
                          <span class="rl-num">${esc(String(s.items != null ? s.items : s.itemsCount || 0))}</span>
                          <span class="rl-num">${esc(String(s.rating != null ? s.rating : 4))} ★</span>
                        </div>`).join('')}
                      </div>`;
                    }
                    return `<div class="crm-grid">${SUPPLIERS.map((s) => {
                    const bg = colors[(String(s.name || '').length || 0) % colors.length];
                    return `<div class="crm-card" data-sup-id="${esc(s.id || s.name)}">
                <div class="crm-top">
                  <div class="crm-av" style="background:${bg}"><i class="fa-solid fa-truck-field" style="font-size:15px"></i></div>
                  <div><div class="crm-name">${esc(s.name)}</div><div class="crm-phone">${esc(s.cat || s.category || 'General')}</div></div>
                </div>
                <div style="font-size:12.5px;color:var(--text-soft);line-height:1.9">
                  <div><i class="fa-solid fa-phone" style="width:16px;color:var(--text-mute)"></i> ${esc(s.contact || '—')}</div>
                  <div><i class="fa-solid fa-file-contract" style="width:16px;color:var(--text-mute)"></i> ${esc(s.terms || 'Net 30')} · ${esc(String(s.items != null ? s.items : s.itemsCount || 0))} items</div>
                  <div><i class="fa-solid fa-star" style="width:16px;color:var(--amber)"></i> ${esc(String(s.rating != null ? s.rating : 4))} rating</div>
                </div>
              </div>`;
                  }).join('')}</div>`;
                  })()
                : `<div class="sr-empty" style="padding:36px 16px">
              <i class="fa-solid fa-truck-field" style="font-size:28px;opacity:.35;display:block;margin-bottom:10px"></i>
              <div style="font-weight:700;margin-bottom:6px">No suppliers yet</div>
              <div style="font-size:13px;color:var(--text-soft);max-width:360px;margin:0 auto 14px;line-height:1.45">
                Add wholesale vendors here. They appear when you raise a purchase order.
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="add-sup-empty"><i class="fa-solid fa-plus"></i> Add first supplier</button>
            </div>`
            }
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="pos">
            <div class="panel-head" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <h3 style="margin:0">Purchase orders</h3>
              <span class="pill pill-amber" style="padding:3px 9px">${POS_ORDERS.filter(p=>['pending','sent','partial'].includes(p.status)).length} open</span>
              <div class="seg" id="po-filter-seg" style="margin-left:4px">
                ${[['open','Open'],['received','Received'],['cancelled','Cancelled'],['all','All']].map(([k,lab])=>
                  `<button type="button" data-po-filter="${k}" class="${poListFilter===k?'active':''}" style="font-size:11.5px;padding:4px 10px">${lab}</button>`
                ).join('')}
              </div>
              <div class="grow"></div>
              <button class="btn btn-ghost btn-sm" id="btn-po-refresh" title="Reload POs"><i class="fa-solid fa-rotate"></i></button>
              <button class="btn btn-primary btn-sm" id="add-po"><i class="fa-solid fa-plus"></i> Raise PO</button>
            </div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>PO No.</th><th>Supplier</th><th>Items</th><th>Value</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            ${(() => {
              const list = filteredPosOrders();
              if (!list.length) {
                return `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-soft)">${
                  POS_ORDERS.length
                    ? 'No POs in this filter.'
                    : 'No purchase orders yet. Use <b>Auto-draft POs</b> on Stock when items are low, or Raise PO.'
                }</td></tr>`;
              }
              return list
                .map((p) => {
                  const idx = POS_ORDERS.indexOf(p);
                  const canRecv =
                    p.status !== 'received' &&
                    p.status !== 'cancelled' &&
                    p.status !== 'canceled' &&
                    remainingPoLines(p).length > 0;
                  const canCancel =
                    p.status !== 'received' && p.status !== 'cancelled' && p.status !== 'canceled';
                  return `<tr data-po-idx="${idx}">
              <td><b>${esc(p.po)}</b></td><td>${esc(p.sup)}</td>
              <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.items)}">${esc(p.items)}</td>
              <td class="td-strong">${rs(p.value)}</td><td>${esc(p.date)}</td>
              <td><span class="pill ${poPill[p.status] || 'pill-amber'}" style="padding:3px 9px;text-transform:capitalize">${esc(p.status || 'pending')}</span></td>
              <td><div class="row-actions">
                <button class="icon-act go" data-po-view="${idx}" title="View" aria-label="View PO"><i class="fa-solid fa-eye"></i></button>
                <button class="icon-act" data-po-print="${idx}" title="Print" aria-label="Print PO"><i class="fa-solid fa-print"></i></button>
                ${canRecv ? `<button class="icon-act" data-po-recv="${idx}" title="Receive stock (partial OK)" aria-label="Receive stock" style="color:var(--green)"><i class="fa-solid fa-box-open"></i></button>` : ''}
                ${canCancel ? `<button class="icon-act" data-po-cancel="${idx}" title="Cancel PO" aria-label="Cancel PO" style="color:var(--red)"><i class="fa-solid fa-ban"></i></button>` : ''}
              </div></td></tr>`;
                })
                .join('');
            })()}
            </tbody></table></div>
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="waste">
            <div class="panel-head" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <h3 style="margin:0">Waste log</h3>
              <span class="pill pill-red" style="padding:4px 11px">${rs(WASTE.reduce((a,w)=>a+(Number(w.cost)||0),0))} lost</span>
              <span class="pill" style="padding:4px 11px">${WASTE.length} entries</span>
              <div class="grow"></div>
              <button class="btn btn-ghost btn-sm" id="btn-export-waste"><i class="fa-solid fa-file-csv"></i> CSV</button>
              <button class="btn btn-primary btn-sm" id="add-waste"><i class="fa-solid fa-plus"></i> Log waste</button>
            </div>
            <div class="table-scroll"><table class="data-table"><thead><tr><th>Item</th><th>Quantity</th><th>Reason</th><th>Cost lost</th><th>When</th><th>By</th></tr></thead><tbody>
            ${WASTE.length ? WASTE.map(w=>`<tr>
              <td><b>${esc(w.item)}</b></td>
              <td>${esc(w.qtyLabel || (w.qty + ' ' + (w.unit||'')))}</td>
              <td><span class="pill" style="padding:3px 9px">${esc(w.reason)}</span></td>
              <td class="td-strong" style="color:var(--red)">${rs(w.cost)}</td>
              <td>${esc(w.date)}</td>
              <td style="font-size:12px;color:var(--text-soft)">${esc(w.by || '—')}</td>
            </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-soft)">No waste logged yet. Logging deducts stock from inventory.</td></tr>`}
            </tbody></table></div>
          </div>`;

        // Purchase order row actions
        $$('[data-po-view]', panes).forEach((b) => {
          b.onclick = () => {
            const p = POS_ORDERS[+b.dataset.poView];
            if (p) viewPoModal(p);
          };
        });
        $$('[data-po-print]', panes).forEach((b) => {
          b.onclick = () => {
            const p = POS_ORDERS[+b.dataset.poPrint];
            if (p) printPoRow(p);
          };
        });
        $$('[data-po-filter]', panes).forEach((b) => {
          b.onclick = () => {
            poListFilter = b.dataset.poFilter || 'open';
            drawPanes();
          };
        });
        $$('[data-po-recv]', panes).forEach((b) => {
          b.onclick = async () => {
            const p = POS_ORDERS[+b.dataset.poRecv];
            if (!p) return;
            const ok = await openReceiveModal(p);
            if (ok) {
              if (window.RS_DB) {
                try {
                  await reloadPosOrdersFromDb();
                } catch (_) {}
              }
              drawPanes();
              if (RS.render) RS.render('inventory-tab');
            }
          };
        });
        $$('[data-po-cancel]', panes).forEach((b) => {
          b.onclick = async () => {
            const p = POS_ORDERS[+b.dataset.poCancel];
            if (!p) return;
            if (!confirm('Cancel PO ' + (p.po || p.poNumber) + '?')) return;
            const reason = window.prompt('Cancel reason (optional)', 'Not needed');
            if (reason === null) return;
            const ok = await cancelPurchaseOrder(p, reason.trim() || 'Cancelled');
            if (ok) {
              drawPanes();
              if (RS.render) RS.render('inventory-tab');
            }
          };
        });
        const btnPoRefresh = $('#btn-po-refresh', panes);
        async function reloadPosOrdersFromDb() {
          if (!window.RS_DB) return;
          const poRows = await RS_DB.list('purchase_orders');
          POS_ORDERS.length = 0;
          (poRows || []).forEach((r) => {
            POS_ORDERS.push({
              ...r,
              id: r.id || r.poNumber,
              po: r.poNumber || r.po || r.id,
              poNumber: r.poNumber || r.po || r.id,
              sup: r.supplier || '',
              supplier: r.supplier || '',
              items: r.items || '',
              lines: r.lines || null,
              receivedLines: r.receivedLines || null,
              receipts: r.receipts || null,
              value: Number(r.value) || 0,
              status: String(r.status || 'pending').toLowerCase(),
              dateRaw: r.date || '',
              date: r.date
                ? new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '--',
              receivedAt: r.receivedAt || null,
              cancelReason: r.cancelReason || null,
            });
          });
          POS_ORDERS.sort((a, b) => {
            const rank = (s) =>
              s === 'pending' || s === 'sent' || s === 'partial' ? 0 : s === 'received' ? 1 : 2;
            return rank(a.status) - rank(b.status);
          });
        }

        if (btnPoRefresh) {
          btnPoRefresh.onclick = async () => {
            if (!window.RS_DB) return RS.toast('Database unavailable', 'fa-circle-exclamation');
            try {
              await reloadPosOrdersFromDb();
              drawPanes();
              RS.toast('Purchase orders refreshed', 'fa-rotate');
            } catch (e) {
              RS.toast('Could not refresh POs', 'fa-circle-exclamation');
            }
          };
        }

        function findInvForRecipeLine(g) {
          const invList = RS.INVENTORY || [];
          const name = String((g && g.name) || '').toLowerCase();
          const key = String((g && (g.key || g.name)) || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
          return (
            invList.find((i) => i.name && String(i.name).toLowerCase() === name) ||
            invList.find((i) => i.key && String(i.key).toLowerCase() === key) ||
            invList.find(
              (i) =>
                i.name &&
                String(i.name)
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '_') === key
            ) ||
            null
          );
        }

        function plateCost(m) {
          if (window.RSRecipeUnits && typeof RSRecipeUnits.plateCost === 'function') {
            return RSRecipeUnits.plateCost(m, RS.INVENTORY || []);
          }
          const ings = (m && m.ingredients) || [];
          const base = Math.max(1, Number(m.recipeServings) || 1);
          const sum = ings.reduce((s, g) => {
            const inv = findInvForRecipeLine(g);
            const unitCost = inv ? Number(inv.cost) || 0 : 0;
            return s + (Number(g.qty) || 0) * unitCost;
          }, 0);
          return sum / base;
        }

        function prettyInvName(raw) {
          const s = String(raw || '');
          if (!/[_-]/.test(s)) return s;
          return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        }

        if (!sec._recipeFilter) sec._recipeFilter = 'all'; // all | linked | missing
        if (sec._recipeSearch == null) sec._recipeSearch = '';

        const recipeListBody = $('#recipe-list-body', panes);
        if (recipeListBody) {
          const menu = (RS.MENU || []).slice();
          const linkedN = menu.filter((m) => Array.isArray(m.ingredients) && m.ingredients.length).length;
          const missingN = menu.length - linkedN;
          const coverage = menu.length ? Math.round((linkedN / menu.length) * 100) : 0;

          const invN = (RS.INVENTORY || []).length;
          const cov = $('#recipe-coverage-bar', panes);
          if (cov) {
            cov.innerHTML = `
              <span class="pill pill-green" style="padding:4px 10px">${linkedN} linked</span>
              <span class="pill pill-amber" style="padding:4px 10px">${missingN} need recipe</span>
              <span class="pill" style="padding:4px 10px">${coverage}% coverage</span>
              <span class="pill" style="padding:4px 10px">${menu.length} menu items</span>
              <span class="pill" style="padding:4px 10px">${invN} stock items</span>
              ${
                missingN
                  ? `<span style="font-size:12.5px;color:var(--text-soft);align-self:center">Link recipes so selling a dish reduces store-room stock.</span>`
                  : `<span style="font-size:12.5px;color:var(--green);align-self:center;font-weight:600">All dishes are linked to stock.</span>`
              }`;
          }

          // 10/10 next-step strip when setup incomplete
          const nextEl = $('#recipe-next-step', panes);
          if (nextEl) {
            if (!invN) {
              nextEl.style.display = 'flex';
              nextEl.className = 'recipe-next-step recipe-next-urgent';
              nextEl.innerHTML = `<i class="fa-solid fa-boxes-stacked"></i>
                <div style="flex:1"><b>Step 1 of 2 — Add store-room stock first</b><br>
                <span style="font-size:12.5px;color:var(--text-soft)">You have ${menu.length} menu dishes but <b>0 stock items</b>. Add milk, coffee, flour… (units: kg, gm, ltr, ml), then come back to link recipes.</span></div>
                <button type="button" class="btn btn-primary btn-sm" id="recipe-go-stock"><i class="fa-solid fa-plus"></i> Add stock</button>`;
              const go = nextEl.querySelector('#recipe-go-stock');
              if (go)
                go.onclick = () => {
                  if (window.RSKitchenLinkCoach && RSKitchenLinkCoach.goInventoryTab) {
                    RSKitchenLinkCoach.goInventoryTab('stock');
                  } else {
                    const b = document.querySelector('#inv-seg [data-inv-tab="stock"], #inv-seg button');
                    if (b) b.click();
                  }
                  setTimeout(() => {
                    if (window.RSInventoryUI && RSInventoryUI.openAddStockModal) {
                      RSInventoryUI.openAddStockModal({ typeId: 'food' });
                    } else {
                      const add = document.getElementById('btn-add-ingredient');
                      if (add) add.click();
                    }
                  }, 200);
                };
            } else if (missingN > 0) {
              nextEl.style.display = 'flex';
              nextEl.className = 'recipe-next-step';
              nextEl.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i>
                <div style="flex:1"><b>Step 2 — Link dishes to stock</b><br>
                <span style="font-size:12.5px;color:var(--text-soft)"><b>${missingN}</b> of ${menu.length} still need a recipe. Tap <b>Help me</b> on a row (or below) — set servings + qty in kg/gm/ltr/ml.</span></div>
                <button type="button" class="btn btn-primary btn-sm" id="recipe-go-help"><i class="fa-solid fa-wand-magic-sparkles"></i> Help me link next</button>`;
              const gh = nextEl.querySelector('#recipe-go-help');
              if (gh)
                gh.onclick = () => {
                  if (window.RSKitchenLinkCoach && RSKitchenLinkCoach.openLinkWizard) {
                    RSKitchenLinkCoach.openLinkWizard();
                  }
                };
            } else {
              nextEl.style.display = 'none';
              nextEl.innerHTML = '';
            }
          }

          // Default filter: show "needs recipe" first when nothing linked yet
          if (!sec._recipeFilterUserSet && missingN === menu.length && menu.length) {
            sec._recipeFilter = 'missing';
          }

          const q = String(sec._recipeSearch || '').toLowerCase().trim();
          let rows = menu;
          if (sec._recipeFilter === 'linked') {
            rows = rows.filter((m) => Array.isArray(m.ingredients) && m.ingredients.length);
          } else if (sec._recipeFilter === 'missing') {
            rows = rows.filter((m) => !Array.isArray(m.ingredients) || !m.ingredients.length);
          }
          if (q) {
            rows = rows.filter((m) => {
              const hay = [m.name, m.cat, m.category]
                .map((x) => String(x || '').toLowerCase())
                .join(' ');
              return hay.includes(q);
            });
          }
          // Needs-recipe first when showing all
          if (sec._recipeFilter === 'all') {
            rows = rows.slice().sort((a, b) => {
              const al = Array.isArray(a.ingredients) && a.ingredients.length ? 1 : 0;
              const bl = Array.isArray(b.ingredients) && b.ingredients.length ? 1 : 0;
              if (al !== bl) return al - bl;
              return String(a.name || '').localeCompare(String(b.name || ''));
            });
          }

          // Filter chip active styles
          [
            ['recipe-filter-all', 'all'],
            ['recipe-filter-linked', 'linked'],
            ['recipe-filter-missing', 'missing'],
          ].forEach(([id, key]) => {
            const el = $('#' + id, panes);
            if (el) {
              el.classList.toggle('active', sec._recipeFilter === key);
              if (sec._recipeFilter === key) {
                el.style.borderColor = 'var(--orange)';
                el.style.color = 'var(--orange)';
                el.style.fontWeight = '700';
              } else {
                el.style.borderColor = '';
                el.style.color = '';
                el.style.fontWeight = '';
              }
            }
          });

          const searchEl = $('#recipe-search', panes);
          if (searchEl && searchEl.value !== sec._recipeSearch) searchEl.value = sec._recipeSearch || '';

          if (!rows.length) {
            recipeListBody.innerHTML = `<tr><td colspan="8" style="padding:0;border:none">
              <div class="sr-empty" style="padding:36px 16px">
                <div style="font-weight:700;margin-bottom:6px">${
                  q || sec._recipeFilter !== 'all' ? 'No menu items match' : 'No menu items yet'
                }</div>
                <div style="font-size:13px;color:var(--text-soft);max-width:380px;margin:0 auto 12px">
                  ${
                    !menu.length
                      ? 'Add dishes in Menu Editor first, then link ingredients here.'
                      : sec._recipeFilter === 'missing'
                        ? 'All items already have recipes — switch to All or Linked.'
                        : 'Try another search or filter.'
                  }
                </div>
                ${
                  !menu.length
                    ? '<button type="button" class="btn btn-primary btn-sm" id="recipe-go-menu"><i class="fa-solid fa-utensils"></i> Open Menu Editor</button>'
                    : ''
                }
              </div>
            </td></tr>`;
            const go = $('#recipe-go-menu', panes);
            if (go)
              go.onclick = () => {
                if (RS.activateTab) RS.activateTab('editor-tab');
              };
          } else {
            recipeListBody.innerHTML = rows
              .map((m) => {
                const ings = Array.isArray(m.ingredients) ? m.ingredients : [];
                const cost = plateCost(m);
                const sell = Number(m.price || m.salePrice || 0) || 0;
                const margin =
                  sell > 0 && cost > 0 ? Math.round((1 - cost / sell) * 100) : sell > 0 && !ings.length ? null : sell > 0 ? 100 : null;
                const marginHtml =
                  margin == null
                    ? `<span style="color:var(--text-mute)">—</span>`
                    : `<span class="stock-dot ${margin >= 50 ? 'stock-ok' : margin >= 25 ? 'stock-low' : 'stock-out'}">${margin}%</span>`;
                const missingCost = ings.some((g) => {
                  const inv = findInvForRecipeLine(g);
                  return !inv || !(Number(inv.cost) > 0);
                });
                const ingsHtml = ings.length
                  ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${ings
                      .map((g) => {
                        const inv = findInvForRecipeLine(g);
                        const missing = !inv;
                        const zeroCost = inv && !(Number(inv.cost) > 0);
                        const tip = missing
                          ? 'Not in stock list'
                          : zeroCost
                            ? 'In stock but unit cost is ₹0'
                            : 'Linked · unit ' + (g.unit || inv.unit || '');
                        return `<span class="pill" title="${esc(tip)}" style="font-size:11.5px;padding:2px 7px;${
                          missing
                            ? 'border-color:var(--red);color:var(--red)'
                            : zeroCost
                              ? 'border-color:var(--amber);color:var(--amber)'
                              : 'background:var(--hover);border-color:var(--border)'
                        }">${esc(prettyInvName(g.name))} (${esc(g.qty)} ${esc(g.unit || inv && inv.unit || '')})</span>`;
                      })
                      .join('')}</div>`
                  : `<span class="recipe-missing-label">Not linked to stock yet</span>`;
                const servesN = Math.max(1, Number(m.recipeServings) || 1);
                const serveU =
                  (window.RSRecipeUnits && RSRecipeUnits.serveUnitLabel
                    ? RSRecipeUnits.serveUnitLabel(m.serveUnit || 'plate')
                    : m.serveUnit || 'plate') || 'plate';
                return `
              <tr data-id="${esc(m.id)}" class="${ings.length ? 'recipe-row-linked' : 'recipe-row-missing'}">
                <td><div style="display:flex;align-items:center;gap:11px"><span class="veg ${m.veg ? '' : 'nonveg'}"></span><b>${esc(m.name)}</b></div></td>
                <td style="font-size:12px;color:var(--text-soft)">${esc(m.cat || '—')}</td>
                <td style="font-size:12px;font-weight:700;color:var(--text-soft)" title="Recipe written for this many servings">${servesN}× ${esc(String(serveU).toLowerCase())}</td>
                <td class="td-strong">${sell ? rs(sell) : '—'}</td>
                <td class="td-strong">${
                  ings.length
                    ? cost
                      ? rs(Math.round(cost * 100) / 100)
                      : missingCost
                        ? `<span style="color:var(--amber)" title="Set unit costs on ingredients">₹0 · set costs</span>`
                        : rs(0)
                    : `<span style="color:var(--text-mute)">—</span>`
                }</td>
                <td>${marginHtml}</td>
                <td style="max-width:280px">${ingsHtml}</td>
                <td>
                  <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${
                      !ings.length
                        ? `<button type="button" class="btn btn-primary btn-sm" data-help-link="${esc(m.id)}" style="padding:4px 10px;font-size:12px;gap:4px;" title="Simple step-by-step">
                      <i class="fa-solid fa-wand-magic-sparkles"></i> Help me
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" data-copy-rec="${esc(m.id)}" style="padding:4px 10px;font-size:12px;gap:4px;" title="Copy recipe from another dish">
                      <i class="fa-solid fa-copy"></i> Copy
                    </button>`
                        : ''
                    }
                    <button type="button" class="btn btn-ghost btn-sm" data-edit-rec="${esc(m.id)}" style="padding:4px 10px;font-size:12px;gap:4px;">
                      <i class="fa-solid fa-flask"></i> ${ings.length ? 'Edit' : 'Manual'}
                    </button>
                  </div>
                </td>
              </tr>`;
              })
              .join('');
          }

          recipeListBody.querySelectorAll('[data-edit-rec]').forEach((b) => {
            b.onclick = () => {
              const m = (RS.MENU || []).find((x) => String(x.id) === String(b.dataset.editRec));
              if (m) openRecipeEditModal(m);
            };
          });
          recipeListBody.querySelectorAll('[data-help-link]').forEach((b) => {
            b.onclick = () => {
              if (window.RSKitchenLinkCoach && RSKitchenLinkCoach.openLinkWizard) {
                RSKitchenLinkCoach.openLinkWizard(b.getAttribute('data-help-link'));
              } else {
                const m = (RS.MENU || []).find((x) => String(x.id) === String(b.getAttribute('data-help-link')));
                if (m) openRecipeEditModal(m);
              }
            };
          });
          recipeListBody.querySelectorAll('[data-copy-rec]').forEach((b) => {
            b.onclick = async () => {
              const target = (RS.MENU || []).find((x) => String(x.id) === String(b.getAttribute('data-copy-rec')));
              if (!target) return;
              if (!window.RSKitchenLinkCoach || !RSKitchenLinkCoach.openCopyRecipePicker) {
                RS.toast('Open Help me wizard to copy a recipe', 'fa-circle-info');
                return;
              }
              RSKitchenLinkCoach.openCopyRecipePicker(target, async (src) => {
                if (!src || !Array.isArray(src.ingredients) || !src.ingredients.length) return;
                target.ingredients = src.ingredients.map((g) => ({
                  name: g.name,
                  qty: Number(g.qty) || 0,
                  unit: g.unit || 'unit',
                }));
                try {
                  if (RS.saveOne) await RS.saveOne('menu', target);
                  else if (RS.save) await RS.save('menu');
                  RS.toast('Copied recipe from “' + src.name + '” to “' + target.name + '”', 'fa-copy');
                  if (window.RSKitchenLinkCoach && RSKitchenLinkCoach.refreshSetupNav) {
                    RSKitchenLinkCoach.refreshSetupNav();
                  }
                  drawPanes();
                } catch (err) {
                  console.warn(err);
                  RS.toast('Could not save copied recipe', 'fa-circle-exclamation');
                }
              });
            };
          });

          const wireFilter = (id, key) => {
            const el = $('#' + id, panes);
            if (!el || el._rsWired) return;
            el._rsWired = true;
            el.onclick = () => {
              sec._recipeFilterUserSet = true;
              sec._recipeFilter = key;
              drawPanes();
            };
          };
          wireFilter('recipe-filter-all', 'all');
          wireFilter('recipe-filter-linked', 'linked');
          wireFilter('recipe-filter-missing', 'missing');

          if (searchEl && !searchEl._rsWired) {
            searchEl._rsWired = true;
            let t;
            searchEl.addEventListener('input', () => {
              clearTimeout(t);
              t = setTimeout(() => {
                sec._recipeSearch = searchEl.value || '';
                drawPanes();
              }, 140);
            });
          }

          // Plain-language coach (Help me link a dish)
          if (window.RSKitchenLinkCoach && RSKitchenLinkCoach.wireCoachCard) {
            RSKitchenLinkCoach.wireCoachCard(panes);
          }
        }

        // ── Export recipes CSV (same shape as bulk import) ──
        const exportRecBtn = $('#btn-export-recipes', panes);
        if (exportRecBtn && !exportRecBtn._rsWired) {
          exportRecBtn._rsWired = true;
          exportRecBtn.onclick = () => {
            const menu = RS.MENU || [];
            const rows = [];
            menu.forEach((m) => {
              const ings = Array.isArray(m.ingredients) ? m.ingredients : [];
              if (!ings.length) {
                // Include unlinked dishes so export shows coverage gaps
                rows.push([m.name || '', '', '', '', m.cat || '', m.price != null ? m.price : '']);
                return;
              }
              ings.forEach((g) => {
                rows.push([
                  m.name || '',
                  g.name || '',
                  g.qty != null ? g.qty : '',
                  g.unit || '',
                  m.cat || '',
                  m.price != null ? m.price : '',
                ]);
              });
            });
            if (!menu.length) {
              RS.toast('No menu items to export recipes for', 'fa-circle-info');
              return;
            }
            const escCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
            const headers = [
              'Menu Item',
              'Ingredient',
              'Qty',
              'Unit',
              'Recipe Servings',
              'Serve Unit',
              'Category',
              'Sell Price',
            ];
            // Rebuild with servings columns
            const fullRows = [];
            menu.forEach((m) => {
              const ings = Array.isArray(m.ingredients) ? m.ingredients : [];
              const rsN = Math.max(1, Number(m.recipeServings) || 1);
              const su = m.serveUnit || 'plate';
              if (!ings.length) {
                fullRows.push([m.name || '', '', '', '', rsN, su, m.cat || '', m.price != null ? m.price : '']);
                return;
              }
              ings.forEach((g) => {
                fullRows.push([
                  m.name || '',
                  g.name || '',
                  g.qty != null ? g.qty : '',
                  g.unit || '',
                  rsN,
                  su,
                  m.cat || '',
                  m.price != null ? m.price : '',
                ]);
              });
            });
            const csv =
              '\uFEFF' +
              [headers.map(escCell).join(','), ...fullRows.map((r) => r.map(escCell).join(','))].join('\r\n');
            const stamp = new Date().toISOString().slice(0, 10);
            const fname = 'recipes-export-' + stamp + '.csv';
            if (RS.downloadFile) RS.downloadFile(csv, 'text/csv;charset=utf-8;', fname);
            else {
              const a = document.createElement('a');
              a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
              a.download = fname;
              a.click();
            }
            const linked = menu.filter((m) => Array.isArray(m.ingredients) && m.ingredients.length).length;
            RS.toast(
              'Recipes CSV · ' + linked + ' linked dish' + (linked === 1 ? '' : 'es') + ' · servings + units',
              'fa-file-export'
            );
          };
        }

        // ── Bulk recipe import: paste CSV lines, link many recipes at once ──
        const bulkBtn = $('#bulk-recipe-import', panes);
        if (bulkBtn) {
          bulkBtn.onclick = () => {
            if (!window.RSModal) return RS.toast('Modal utility not available', 'fa-circle-exclamation');
            RSModal.open({
              title: 'Bulk Recipe Import', sub: 'One ingredient per line: Menu Item, Ingredient, Qty, Unit', icon: 'fa-file-arrow-up', size: 'md',
              body: `
                <div style="display:flex;flex-direction:column;gap:10px">
                  <div style="font-size:12px;color:var(--text-soft);line-height:1.55">
                    Paste one row per ingredient in CSV format:<br>
                    <code style="display:block;background:var(--glass-2);border:1px solid var(--stroke);border-radius:6px;padding:8px 10px;margin-top:6px;font-size:11.5px;line-height:1.7">Paneer Tikka, Paneer, 0.2, kg<br>Paneer Tikka, Curd, 0.05, kg<br>Masala Dosa, Dosa Batter, 0.15, kg</code>
                    Menu items and ingredients must already exist (Menu Editor / Inventory Stock). Repeated menu-item rows accumulate into one recipe. Existing recipes for the listed items are replaced.
                  </div>
                  <textarea id="bulk-rec-input" class="form-input" rows="9" placeholder="Menu Item, Ingredient, Qty, Unit" style="width:100%;resize:vertical;font-family:monospace;font-size:12.5px;line-height:1.6"></textarea>
                  <div id="bulk-rec-result" style="font-size:12px;line-height:1.5"></div>
                </div>`,
              foot: `<button class="btn btn-ghost" style="flex:1" data-x>Cancel</button><button class="btn btn-primary" style="flex:1" data-import><i class="fa-solid fa-circle-check"></i> Import Recipes</button>`,
              onMount(modal, close) {
                modal.querySelector('[data-x]').onclick = close;
                modal.querySelector('[data-import]').onclick = async () => {
                  const raw = (modal.querySelector('#bulk-rec-input').value || '').trim();
                  const resBox = modal.querySelector('#bulk-rec-result');
                  const prog =
                    window.RSProgress &&
                    RSProgress.open({
                      title: 'Importing recipes…',
                      sub: 'Validating lines and linking ingredients',
                      total: 0,
                      unit: 'lines',
                    });
                  if (!raw) {
                    if (prog) prog.close();
                    resBox.innerHTML = '<span style="color:var(--red)">Nothing to import.</span>';
                    return;
                  }
                  const byItem = {}; const errors = [];
                  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
                  if (prog) prog.update({ total: lines.length, done: 0, unit: 'lines' });
                  lines.forEach((line, idx) => {
                    const t = line.trim();
                    if (!t) return;
                    const parts = t.split(',').map(s => s.trim());
                    if (parts.length < 3) { errors.push(`Line ${idx + 1}: expected "Item, Ingredient, Qty, Unit"`); if (prog) prog.update({ done: idx + 1 }); return; }
                    const itemName = parts[0], ingName = parts[1], qtyStr = parts[2], unitRaw = parts[3];
                    const menuItem = (RS.MENU || []).find(m => m.name.toLowerCase() === itemName.toLowerCase());
                    if (!menuItem) { errors.push(`Line ${idx + 1}: menu item "${esc(itemName)}" not found`); if (prog) prog.update({ done: idx + 1 }); return; }
                    const invItem = (RS.INVENTORY || []).find(i => i.name.toLowerCase() === ingName.toLowerCase());
                    if (!invItem) { errors.push(`Line ${idx + 1}: ingredient "${esc(ingName)}" not in inventory`); if (prog) prog.update({ done: idx + 1 }); return; }
                    const qty = parseFloat(qtyStr);
                    if (!(qty > 0)) { errors.push(`Line ${idx + 1}: invalid qty "${esc(qtyStr)}"`); if (prog) prog.update({ done: idx + 1 }); return; }
                    (byItem[menuItem.id] = byItem[menuItem.id] || { m: menuItem, ings: [] }).ings.push({ name: invItem.name, qty: qty, unit: unitRaw || invItem.unit || '' });
                    if (prog) prog.update({ done: idx + 1 });
                  });
                  const itemIds = Object.keys(byItem);
                  if (!itemIds.length) {
                    if (prog) prog.close();
                    resBox.innerHTML = `<span style="color:var(--red)">No valid rows.</span>${errors.length ? '<br>' + errors.slice(0, 6).join('<br>') : ''}`;
                    return;
                  }
                  let ingTotal = 0;
                  itemIds.forEach(id => { byItem[id].m.ingredients = byItem[id].ings; ingTotal += byItem[id].ings.length; });
                  try {
                    if (prog) prog.update({ title: 'Saving…', total: itemIds.length, done: 0, unit: 'items' });
                    for (let i = 0; i < itemIds.length; i++) {
                      if (RS.saveOne) await RS.saveOne('menu', byItem[itemIds[i]].m);
                      if (prog) prog.update({ done: i + 1 });
                    }
                    if (RS.save && !RS.saveOne) await RS.save('menu');
                    if (prog) prog.close();
                    // Toast only after the save has actually completed successfully.
                    RS.toast(`Recipes imported: ${itemIds.length} item${itemIds.length === 1 ? '' : 's'}, ${ingTotal} ingredient links`, 'fa-circle-check');
                    if (errors.length) {
                      resBox.innerHTML = `<span style="color:var(--green)">Imported ${itemIds.length} recipe(s).</span> <span style="color:var(--red)">${errors.length} line(s) skipped:</span><br>` + errors.slice(0, 6).join('<br>') + (errors.length > 6 ? '<br>…' : '');
                    } else {
                      close();
                      drawPanes();
                    }
                  } catch (e) {
                    if (prog) prog.close();
                    console.warn('Recipe import save failed', e);
                    resBox.innerHTML = '<span style="color:var(--red)">Save failed -- recipes were not saved. Try again.</span>';
                    RS.toast('Recipe import failed to save -- try again', 'fa-circle-exclamation');
                  }
                };
              }
            });
          };
        }

        function openAddSupplierModal() {
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
                    <option value="5">5</option>
                    <option value="4" selected>4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
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
                const name = (modal.querySelector('#sup-name').value || '').trim();
                if (!name) return RS.toast('Supplier name is required', 'fa-circle-exclamation');
                const category = (modal.querySelector('#sup-cat').value || 'General').trim() || 'General';
                const contact = (modal.querySelector('#sup-contact').value || '').trim();
                const terms = (modal.querySelector('#sup-terms').value || 'Net 30').trim() || 'Net 30';
                const rating = Number(modal.querySelector('#sup-rating').value) || 4;

                const supId =
                  (RS.nextLogicalNo && RS.nextLogicalNo('SUP')) ||
                  'sup_' + Date.now();
                const newSup = {
                  id: supId,
                  name,
                  category,
                  cat: category,
                  contact,
                  terms,
                  rating,
                  itemsCount: 0,
                  items: 0,
                };
                close();
                try {
                  let saved = newSup;
                  if (window.RS_DB && RS_DB.put) saved = (await RS_DB.put('vendors', newSup.id, newSup)) || newSup;
                  else if (RS.saveOne) saved = (await RS.saveOne('vendors', newSup)) || newSup;
                  const row = {
                    id: saved.id || newSup.id,
                    name: saved.name || name,
                    cat: saved.category || saved.cat || category,
                    category: saved.category || category,
                    contact: saved.contact || contact,
                    terms: saved.terms || terms,
                    rating: saved.rating != null ? saved.rating : rating,
                    items: saved.itemsCount != null ? saved.itemsCount : 0,
                    itemsCount: saved.itemsCount != null ? saved.itemsCount : 0,
                  };
                  const idx = SUPPLIERS.findIndex(
                    (s) => String(s.id) === String(row.id) || String(s.name).toLowerCase() === String(row.name).toLowerCase()
                  );
                  if (idx >= 0) SUPPLIERS[idx] = row;
                  else SUPPLIERS.unshift(row);
                  RS.toast('Supplier added · ' + name, 'fa-circle-check');
                  drawPanes();
                } catch (e) {
                  console.warn('add supplier failed', e);
                  RS.toast('Could not save supplier — try again', 'fa-circle-exclamation');
                }
              };
            },
          });
        }

        const btnAddSup = $('#add-sup', panes) || $('#add-sup');
        if (btnAddSup) btnAddSup.onclick = () => openAddSupplierModal();
        const btnAddSupEmpty = $('#add-sup-empty', panes);
        if (btnAddSupEmpty) btnAddSupEmpty.onclick = () => openAddSupplierModal();
        if (window.RSViewMode && panes) {
          RSViewMode.wire(panes, 'suppliers', () => drawPanes(), 'list');
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

                  const poNum = RS.nextLogicalNo('PO');
                  const newPo = {
                    id: poNum,
                    poNumber: poNum,
                    supplier,
                    items,
                    lines: parsePoLines({ items }),
                    value,
                    date: new Date().toISOString(),
                    status: 'pending',
                  };
                  close();
                  try {
                    await savePo(newPo);
                    POS_ORDERS.unshift({
                      ...newPo,
                      po: poNum,
                      sup: supplier,
                      dateRaw: newPo.date,
                      date: new Date(newPo.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      }),
                    });
                    RS.toast('Purchase order raised successfully', 'fa-circle-check');
                    drawPanes();
                    if (RS.render) RS.render('inventory-tab');
                  } catch (e) {
                    RS.toast('Could not save PO', 'fa-circle-exclamation');
                  }
                };
              }
            });
          };
        }

        // Expose for inventory auto-draft refresh
        window.RS_receivePurchaseOrder = receivePurchaseOrder;

        async function logWasteEntry({ invId, itemName, qty, unit, reason, note }) {
          const inv = RS.INVENTORY || [];
          let item =
            (invId && inv.find((i) => String(i.id) === String(invId))) ||
            inv.find((i) => i.name && String(i.name).toLowerCase() === String(itemName).toLowerCase());
          if (!item) {
            RS.toast('Ingredient not found in inventory', 'fa-circle-exclamation');
            return false;
          }
          const q = Math.max(0, Number(qty) || 0);
          if (!(q > 0)) {
            RS.toast('Enter a quantity greater than 0', 'fa-circle-exclamation');
            return false;
          }
          const have = Math.max(0, Number(item.stock) || 0);
          if (q > have) {
            if (!confirm(`Only ${have} ${item.unit || unit || ''} in stock. Log ${q} and set stock to 0?`)) return false;
          }
          const deducted = Math.min(q, have);
          item.stock = Math.max(0, have - q);
          const cost = Math.round(deducted * (Number(item.cost) || 0) * 100) / 100;
          await saveInventoryItem(item);
          // FEFO: waste also consumes soonest-expiring batch first
          try {
            if (window.RSInventoryBatches && RSInventoryBatches.deductFefo) {
              await RSInventoryBatches.deductFefo(item, deducted);
            }
          } catch (e) {
            console.warn('[FEFO] waste batch deduct', e);
          }

          const now = new Date();
          const entry = {
            id: 'waste_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            invId: item.id,
            item: item.name,
            qty: deducted,
            qtyLogged: q,
            unit: item.unit || unit || 'unit',
            qtyLabel: deducted + ' ' + (item.unit || unit || 'unit'),
            reason: reason || 'Other',
            note: note || '',
            cost,
            dateTime: now.toISOString(),
            date: now.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            by: staffName(),
          };
          try {
            if (window.RS_DB && RS_DB.put) await RS_DB.put('waste_log', entry.id, entry);
            else if (RS.saveOne) await RS.saveOne('waste_log', entry);
          } catch (e) {
            console.warn('waste_log save failed', e);
          }
          WASTE.unshift(entry);
          try {
            if (window.RSInventoryUI && RSInventoryUI.paintInventoryBadge) RSInventoryUI.paintInventoryBadge();
            if (RS.renderInventory) RS.renderInventory();
          } catch (_) {}
          RS.toast(
            `Waste logged: ${entry.qtyLabel} ${item.name} (−${rs(cost)})`,
            'fa-trash-can'
          );
          return true;
        }

        function exportWasteCsv() {
          if (!WASTE.length) return RS.toast('No waste entries to export', 'fa-circle-info');
          const lines = [['item', 'qty', 'unit', 'reason', 'cost', 'when', 'by', 'note'].join(',')];
          WASTE.forEach((w) => {
            lines.push(
              [w.item, w.qty, w.unit, w.reason, w.cost, w.dateTime || w.date, w.by, w.note || '']
                .map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"')
                .join(',')
            );
          });
          const csv = lines.join('\n');
          const name = 'waste-log-' + new Date().toISOString().slice(0, 10) + '.csv';
          if (RS.downloadFile) RS.downloadFile(csv, 'text/csv;charset=utf-8;', name);
          else {
            const a = document.createElement('a');
            a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a.download = name;
            a.click();
          }
          RS.toast('Waste CSV · ' + WASTE.length + ' rows', 'fa-file-csv');
        }

        const btnExportWaste = $('#btn-export-waste');
        if (btnExportWaste) btnExportWaste.onclick = () => exportWasteCsv();

        const btnAddWaste = $('#add-waste');
        if (btnAddWaste) {
          btnAddWaste.onclick = () => {
            if (!window.RSModal) return RS.toast('Modal utility not available', 'fa-circle-exclamation');
            const inv = RS.INVENTORY || [];
            const opts = inv
              .slice()
              .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
              .map(
                (i) =>
                  `<option value="${esc(i.id)}" data-unit="${esc(i.unit || 'unit')}" data-name="${esc(i.name)}" data-stock="${Number(i.stock) || 0}" data-cost="${Number(i.cost) || 0}">${esc(i.name)} (${Number(i.stock) || 0} ${esc(i.unit || '')})</option>`
              )
              .join('');
            if (!opts) return RS.toast('Add inventory ingredients first', 'fa-circle-exclamation');
            const body = `
              <div style="display:flex;flex-direction:column;gap:12px">
                <div>
                  <label class="fl">Ingredient</label>
                  <select id="waste-item" class="form-input">${opts}</select>
                  <div id="waste-stock-hint" style="font-size:12px;color:var(--text-soft);margin-top:4px"></div>
                </div>
                <div class="form-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <div>
                    <label class="fl">Quantity wasted</label>
                    <input type="number" id="waste-qty" class="form-input" min="0" step="any" value="1" placeholder="Qty">
                  </div>
                  <div>
                    <label class="fl">Unit</label>
                    <input type="text" id="waste-unit" class="form-input" readonly>
                  </div>
                </div>
                <div>
                  <label class="fl">Reason</label>
                  <select id="waste-reason" class="form-input">
                    <option value="Spoiled">Spoiled / Expired</option>
                    <option value="Dropped">Dropped / Spilled</option>
                    <option value="Incorrect prep">Incorrect preparation</option>
                    <option value="Overproduction">Overproduction</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="fl">Note (optional)</label>
                  <input type="text" id="waste-note" class="form-input" placeholder="e.g. fridge failure">
                </div>
                <div style="font-size:12.5px;color:var(--text-soft)">Est. cost lost: <b id="waste-cost-preview" style="color:var(--red)">${rs(0)}</b> · stock will be deducted</div>
              </div>
            `;
            RSModal.open({
              title: 'Log kitchen waste',
              sub: 'Deducts from inventory stock',
              icon: 'fa-trash-can',
              size: 'sm',
              body,
              foot: `<button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm style="background:var(--red);border-color:var(--red)"><i class="fa-solid fa-trash-can"></i> Log &amp; deduct</button>`,
              onMount(modal, close) {
                const sel = modal.querySelector('#waste-item');
                const qtyEl = modal.querySelector('#waste-qty');
                const unitEl = modal.querySelector('#waste-unit');
                const hint = modal.querySelector('#waste-stock-hint');
                const costEl = modal.querySelector('#waste-cost-preview');
                const sync = () => {
                  const opt = sel.options[sel.selectedIndex];
                  if (!opt) return;
                  unitEl.value = opt.dataset.unit || 'unit';
                  const stock = Number(opt.dataset.stock) || 0;
                  const cost = Number(opt.dataset.cost) || 0;
                  const q = Math.max(0, Number(qtyEl.value) || 0);
                  hint.textContent = `On hand: ${stock} ${opt.dataset.unit || ''}`;
                  costEl.textContent = rs(Math.round(Math.min(q, stock) * cost * 100) / 100);
                };
                sel.onchange = sync;
                qtyEl.oninput = sync;
                sync();
                modal.querySelector('[data-cancel]').onclick = close;
                modal.querySelector('[data-confirm]').onclick = async () => {
                  const opt = sel.options[sel.selectedIndex];
                  if (!opt) return;
                  const ok = await logWasteEntry({
                    invId: sel.value,
                    itemName: opt.dataset.name || opt.textContent,
                    qty: qtyEl.value,
                    unit: unitEl.value,
                    reason: modal.querySelector('#waste-reason').value,
                    note: modal.querySelector('#waste-note').value.trim(),
                  });
                  if (ok) {
                    close();
                    drawPanes();
                    if (RS.render) RS.render('inventory-tab');
                  }
                };
              },
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
        Promise.all([
          RS_DB.list('vendors'),
          RS_DB.list('purchase_orders'),
          RS_DB.list('waste_log').catch(() => []),
        ]).then(([vRows, poRows, wasteRows]) => {
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
            const mapped = poRows.map((r) => ({
              ...r,
              id: r.id || r.poNumber,
              po: r.poNumber || r.po || r.id,
              poNumber: r.poNumber || r.po || r.id,
              sup: r.supplier || r.sup || '',
              supplier: r.supplier || r.sup || '',
              items: r.items || (Array.isArray(r.lines) ? r.lines.map((l) => `${l.qty} ${l.unit || ''} ${l.name}`).join(', ') : ''),
              lines: r.lines || null,
              receivedLines: r.receivedLines || null,
              receipts: r.receipts || null,
              value: Number(r.value) || 0,
              status: String(r.status || 'pending').toLowerCase(),
              dateRaw: r.date || '',
              date: r.date
                ? new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '--',
              receivedAt: r.receivedAt || null,
              cancelReason: r.cancelReason || null,
            }));
            // Open first, then newest
            mapped.sort((a, b) => {
              const rank = (s) =>
                s === 'pending' || s === 'sent' || s === 'partial' ? 0 : s === 'received' ? 1 : 2;
              const d = rank(a.status) - rank(b.status);
              if (d) return d;
              return String(b.dateRaw || '').localeCompare(String(a.dateRaw || ''));
            });
            mapped.forEach((row) => POS_ORDERS.push(row));
          }

          WASTE.length = 0;
          (wasteRows || [])
            .slice()
            .sort((a, b) => String(b.dateTime || b.date || '').localeCompare(String(a.dateTime || a.date || '')))
            .forEach((w) => {
              WASTE.push({
                ...w,
                item: w.item || w.name || 'Item',
                qty: Number(w.qty) || 0,
                unit: w.unit || '',
                qtyLabel: w.qtyLabel || `${w.qty || 0} ${w.unit || ''}`.trim(),
                reason: w.reason || 'Other',
                cost: Number(w.cost) || 0,
                date:
                  w.date ||
                  (w.dateTime
                    ? new Date(w.dateTime).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'),
                by: w.by || w.loggedBy || '',
              });
            });

          drawPanes();
        }).catch(e => {
          console.warn("Failed loading vendors/purchase orders/waste from DB", e);
          drawPanes();
        });
      } else {
        drawPanes();
      }

      // Segmented tabs: stock + recipes/suppliers/POs/waste (single handler, not stub)
      (function wireInventoryTabs() {
        const names = ['stock', 'recipes', 'suppliers', 'pos', 'waste'];
        const stockOnlyIds = [
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
        const segBtns = $$('.seg button', sec);
        segBtns.forEach((b, i) => {
          b.onclick = () => {
            const pane = names[i] || 'stock';
            segBtns.forEach((x) => x.classList.toggle('active', x === b));
            $$('.subtab-pane', sec).forEach((p) => {
              const match = p.dataset.pane === pane;
              p.classList.toggle('active', match);
              // Clear inline display left by inventory-ui fallback
              if (match) p.style.display = '';
              else if (p.id && p.id.startsWith('inv-panel-')) p.style.display = 'none';
            });
            // Stock panel id
            const stock = $('#inv-panel-stock', sec);
            if (stock) {
              stock.classList.toggle('active', pane === 'stock');
              stock.style.display = pane === 'stock' ? '' : 'none';
            }
            if (window.RSInventoryToolbar && RSInventoryToolbar.sync) {
              RSInventoryToolbar.sync(pane);
            } else {
              stockOnlyIds.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (id === 'inv-stock-search') {
                  const wrap = el.closest('.inv-search-wrap') || el;
                  wrap.style.display = pane === 'stock' ? '' : 'none';
                } else {
                  el.style.display = pane === 'stock' ? '' : 'none';
                }
              });
            }
            sec.dispatchEvent(new CustomEvent('rs:subtab-change', { detail: { pane, index: i } }));
          };
        });
        // Apply immediately (e.g. user lands on Recipes — hide Variance/Prep/Export)
        try {
          const active = sec.querySelector('.seg button.active');
          const pane0 =
            (active && (active.getAttribute('data-inv-tab') || active.dataset.invTab)) || 'stock';
          if (window.RSInventoryToolbar && RSInventoryToolbar.sync) RSInventoryToolbar.sync(pane0);
        } catch (_) {}
        sec.dataset.segWired = '1';
      })();

      // Reload POs when inventory re-renders (after auto-draft)
      if (!sec._poReloadBound) {
        sec._poReloadBound = true;
        document.addEventListener('rs:render-inventory', () => {
          if (window.RS_DB) {
            RS_DB.list('purchase_orders')
              .then((poRows) => {
                if (!poRows) return;
                POS_ORDERS.length = 0;
                poRows.forEach((r) => {
                  POS_ORDERS.push({
                    ...r,
                    id: r.id || r.poNumber,
                    po: r.poNumber || r.po || r.id,
                    poNumber: r.poNumber || r.po || r.id,
                    sup: r.supplier || '',
                    supplier: r.supplier || '',
                    items: r.items || '',
                    lines: r.lines || null,
                    value: Number(r.value) || 0,
                    status: String(r.status || 'pending').toLowerCase(),
                    dateRaw: r.date || '',
                    date: r.date
                      ? new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '--',
                    receivedAt: r.receivedAt || null,
                  });
                });
                POS_ORDERS.sort((a, b) => {
                  const rank = (s) => (s === 'pending' || s === 'sent' ? 0 : 1);
                  return rank(a.status) - rank(b.status);
                });
              })
              .catch(() => {});
          }
        });
      }
    }

    /* ============== EMPLOYEES ============== */
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    // Map directory shift label → week pattern (honest, not random fake roster)
    const shiftPatternFromLabel = (shift) => {
      const s = String(shift || 'Day').toLowerCase();
      if (s.includes('off')) return ['O','O','O','O','O','O','O'];
      if (s.includes('night') || s.includes('eve')) return ['E','E','E','E','E','E','O'];
      if (s.includes('morn')) return ['M','M','M','M','M','M','O'];
      // Day / Full day default: work Mon–Sat, off Sun
      return ['D','D','D','D','D','D','O'];
    };
    const shiftName = {M:'Morning',E:'Evening',D:'Full day',O:'Off'};
    const shiftCls = {M:'pill-amber',E:'pill-violet',D:'pill-green',O:''};
    let ATT = [];
    let ATT_FROM_DB = false;
    const attPill = {present:'pill-green',late:'pill-amber',absent:'pill-red'};

    function enhanceEmployees(){
      const sec = $('#employees-tab'); if(!sec || sec.dataset.enhanced) return; sec.dataset.enhanced='1';
      const grid = sec.querySelector('#emp-grid'); if(grid){ grid.classList.add('subtab-pane','active'); grid.dataset.pane='directory'; }
      const panes = document.createElement('div');
      panes.id = 'emp-panes-wrapper';
      sec.appendChild(panes);

      document.addEventListener('rs:render-employees', () => {
        drawPanes();
      });

      function parsePayroll(emp) {
        const n = parseFloat(String(emp.payroll || emp.salary || '').replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : 0;
      }

      function fmtClock(v) {
        if (!v) return '—';
        const s = String(v);
        // ISO → local time
        const d = new Date(s);
        if (!Number.isNaN(d.getTime()) && /T|\d{4}-\d{2}/.test(s)) {
          try {
            return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
          } catch (_) {}
        }
        return s;
      }

      function drawPanes() {
        const currentEmployees = RS.EMPLOYEES || [];
        const monthLabel = new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' });

        // Attendance: DB only — never invent clock times
        let attRows = ATT_FROM_DB ? ATT.slice() : [];
        if (!ATT_FROM_DB || !attRows.length) {
          // Show directory as not clocked (honest empty day)
          attRows = currentEmployees.map((e) => ({
            name: e.name,
            role: e.role || 'Staff',
            rc: e.rc || '',
            inT: '—',
            outT: '—',
            status: 'absent',
            placeholder: true,
          }));
        }
        const presentCount = attRows.filter((a) => a.status !== 'absent' && !a.placeholder).length;

        // Payroll from directory salary only (no fake incentives)
        const currentPay = currentEmployees.map((e) => {
          const base = parsePayroll(e);
          return {
            name: e.name,
            role: e.role || 'Staff',
            rc: e.rc || '',
            base,
            inc: 0,
            ded: 0,
            net: base,
            hasPay: base > 0,
          };
        });
        const payTotal = currentPay.reduce((a, p) => a + p.net, 0);

        panes.innerHTML = `
          <div class="panel panel-pad subtab-pane" data-pane="roster">
            <div class="panel-head">
              <div>
                <h3>Weekly shift roster</h3>
                <div style="font-size:12px;color:var(--text-soft);margin-top:2px">From each member’s directory shift · not auto-generated fiction</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" id="emp-roster-hint" title="How roster works"><i class="fa-solid fa-circle-info"></i> How it works</button>
            </div>
            ${
              currentEmployees.length
                ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th>${DAYS.map((d) => `<th>${d}</th>`).join('')}</tr></thead><tbody>
            ${currentEmployees
              .map((e) => {
                const pat = shiftPatternFromLabel(e.shift);
                return `<tr><td><b>${esc(e.name)}</b><div style="font-size:11px;color:var(--text-mute)">${esc(e.role || '')} · ${esc(e.shift || 'Day')}</div></td>${DAYS.map((d, di) => {
                  const s = pat[di] || 'O';
                  return `<td>${
                    s === 'O'
                      ? '<span style="color:var(--text-faint);font-size:12px">Off</span>'
                      : `<span class="pill ${shiftCls[s]}" style="padding:3px 8px;font-size:11px">${shiftName[s]}</span>`
                  }</td>`;
                }).join('')}</tr>`;
              })
              .join('')}
            </tbody></table></div>`
                : `<div class="sr-empty" style="padding:28px">Add team members in Directory to build a roster.</div>`
            }
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="attendance">
            <div class="panel-head">
              <div>
                <h3>Today’s attendance</h3>
                <div style="font-size:12px;color:var(--text-soft);margin-top:2px">${
                  ATT_FROM_DB
                    ? 'Live from attendance records'
                    : 'No punches recorded today — mark present when staff clock in'
                }</div>
              </div>
              <span class="pill ${presentCount ? 'pill-green' : ''}" style="padding:4px 11px">${presentCount}/${currentEmployees.length || 0} present</span>
            </div>
            ${
              currentEmployees.length
                ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Clock in</th><th>Clock out</th><th>Status</th><th></th></tr></thead><tbody>
            ${attRows
              .map((a, i) => {
                const emp = currentEmployees.find((e) => e.name === a.name) || currentEmployees[i];
                return `<tr data-att-i="${i}">
                  <td><b>${esc(a.name)}</b></td>
                  <td><span class="role-tag ${esc(a.rc || '')}">${esc(a.role || '')}</span></td>
                  <td class="td-strong">${esc(fmtClock(a.inT))}</td>
                  <td>${esc(fmtClock(a.outT))}</td>
                  <td><span class="pill ${attPill[a.status] || ''}" style="padding:3px 9px;text-transform:capitalize">${esc(a.status || '—')}</span></td>
                  <td>${
                    a.placeholder || a.status === 'absent'
                      ? `<button type="button" class="btn btn-ghost btn-sm emp-mark-present" data-emp-id="${esc(emp && emp.id)}" data-name="${esc(a.name)}">Mark present</button>`
                      : a.outT === '—' || a.outT === '--'
                        ? `<button type="button" class="btn btn-ghost btn-sm emp-mark-out" data-emp-id="${esc(emp && emp.id)}" data-name="${esc(a.name)}">Clock out</button>`
                        : ''
                  }</td>
                </tr>`;
              })
              .join('')}
            </tbody></table></div>`
                : `<div class="sr-empty" style="padding:28px">No employees yet — add people in Directory first.</div>`
            }
          </div>
          <div class="panel panel-pad subtab-pane" data-pane="payroll">
            <div class="panel-head">
              <div>
                <h3>Payroll · ${esc(monthLabel)}</h3>
                <div style="font-size:12px;color:var(--text-soft);margin-top:2px">Base pay from directory · set salary when adding/editing staff</div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="emp-export-payroll"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
            </div>
            ${
              currentEmployees.length
                ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Team member</th><th>Role</th><th>Base</th><th>Net pay</th></tr></thead><tbody>
            ${currentPay
              .map(
                (p) =>
                  `<tr><td><b>${esc(p.name)}</b></td><td><span class="role-tag ${esc(p.rc)}">${esc(p.role)}</span></td><td>${
                    p.hasPay ? rs(p.base) : '<span style="color:var(--text-mute)">Not set</span>'
                  }</td><td class="td-strong">${p.hasPay ? rs(p.net) : '—'}</td></tr>`
              )
              .join('')}
            <tr><td colspan="3" style="text-align:right"><b style="color:var(--text)">Total (with salary set)</b></td><td><b style="color:var(--orange);font-size:15px">${rs(payTotal)}</b></td></tr>
            </tbody></table></div>
            <p style="font-size:12px;color:var(--text-soft);margin:12px 0 0;line-height:1.45">Incentives &amp; deductions can be added later — we only show real directory salary so payroll never invents numbers.</p>`
                : `<div class="sr-empty" style="padding:28px">Add employees with a monthly payroll amount to estimate payout.</div>`
            }
          </div>`;

        const rosterHint = panes.querySelector('#emp-roster-hint');
        if (rosterHint)
          rosterHint.onclick = () => {
            RS.toast('Roster follows each member’s Day / Evening / Night / Off shift from Directory', 'fa-circle-info');
          };

        const exportPay = panes.querySelector('#emp-export-payroll');
        if (exportPay)
          exportPay.onclick = () => {
            if (!currentPay.length) {
              RS.toast('No employees to export', 'fa-circle-exclamation');
              return;
            }
            const csv =
              '\uFEFF' +
              [
                'Name,Role,Shift,Base,Net',
                ...currentEmployees.map((e, i) => {
                  const p = currentPay[i];
                  return [e.name, e.role || '', e.shift || '', p.base, p.net]
                    .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
                    .join(',');
                }),
              ].join('\r\n');
            if (RS.downloadFile) RS.downloadFile(csv, 'text/csv;charset=utf-8;', 'payroll-' + monthLabel.replace(/\s+/g, '-') + '.csv');
            RS.toast('Payroll CSV exported', 'fa-file-csv');
          };

        // Mark present / clock out → write attendance store
        panes.querySelectorAll('.emp-mark-present').forEach((btn) => {
          btn.onclick = async () => {
            const empId = btn.dataset.empId;
            const name = btn.dataset.name;
            const emp = (RS.EMPLOYEES || []).find((e) => String(e.id) === String(empId) || e.name === name);
            const now = new Date();
            const row = {
              id: 'att-' + (emp && emp.id ? emp.id : name) + '-' + now.toISOString().slice(0, 10),
              employeeId: emp && emp.id,
              employeeName: name,
              date: now.toISOString().slice(0, 10),
              clockInTime: now.toISOString(),
              clockOutTime: null,
              status: 'present',
            };
            try {
              if (window.RS_DB) await RS_DB.put('attendance', row.id, row);
              ATT_FROM_DB = true;
              const existing = ATT.findIndex((a) => a.name === name);
              const view = {
                name,
                role: (emp && emp.role) || 'Staff',
                rc: (emp && emp.rc) || '',
                inT: row.clockInTime,
                outT: '—',
                status: 'present',
              };
              if (existing >= 0) ATT[existing] = view;
              else ATT.push(view);
              RS.toast(name + ' marked present', 'fa-user-check');
              drawPanes();
            } catch (e) {
              console.warn(e);
              RS.toast('Could not save attendance', 'fa-circle-exclamation');
            }
          };
        });
        panes.querySelectorAll('.emp-mark-out').forEach((btn) => {
          btn.onclick = async () => {
            const name = btn.dataset.name;
            const empId = btn.dataset.empId;
            const now = new Date();
            const day = now.toISOString().slice(0, 10);
            const id = 'att-' + (empId || name) + '-' + day;
            try {
              let row = null;
              if (window.RS_DB && RS_DB.get) row = await RS_DB.get('attendance', id).catch(() => null);
              if (!row) {
                row = {
                  id,
                  employeeId: empId,
                  employeeName: name,
                  date: day,
                  clockInTime: now.toISOString(),
                  status: 'present',
                };
              }
              row.clockOutTime = now.toISOString();
              if (window.RS_DB) await RS_DB.put('attendance', id, row);
              ATT_FROM_DB = true;
              const existing = ATT.findIndex((a) => a.name === name);
              if (existing >= 0) {
                ATT[existing].outT = row.clockOutTime;
                ATT[existing].status = 'present';
              }
              RS.toast(name + ' clocked out', 'fa-clock');
              drawPanes();
            } catch (e) {
              console.warn(e);
              RS.toast('Could not clock out', 'fa-circle-exclamation');
            }
          };
        });

        const activeBtn = sec.querySelector('.seg button.active');
        if (activeBtn) {
          const tabName = activeBtn.textContent.trim().toLowerCase();
          const paneMap = { directory: 'directory', roster: 'roster', attendance: 'attendance', payroll: 'payroll', logins: 'logins' };
          const activePane = paneMap[tabName] || 'directory';
          $$('.subtab-pane', sec).forEach(p => p.classList.toggle('active', p.dataset.pane === activePane));
        }
      }

      // Load from DB — real rows only
      if (window.RS_DB) {
        RS_DB.list('attendance').then(rows => {
          const today = new Date().toISOString().slice(0, 10);
          const todayRows = (rows || []).filter((r) => {
            const d = String(r.date || r.clockInTime || '').slice(0, 10);
            return d === today || (r.clockInTime && String(r.clockInTime).slice(0, 10) === today);
          });
          if (todayRows.length) {
            ATT_FROM_DB = true;
            ATT.length = 0;
            todayRows.forEach(r => {
              const emp = (RS.EMPLOYEES||[]).find(e => e.id === r.employeeId) || {};
              ATT.push({
                name: r.employeeName || emp.name || 'Unknown',
                role: emp.role || 'Staff',
                rc: emp.rc || 'r-waiter',
                inT: r.clockInTime || '--',
                outT: r.clockOutTime || '—',
                status: r.status || 'present'
              });
            });
          } else {
            ATT_FROM_DB = false;
            ATT.length = 0;
          }
          drawPanes();
        }).catch(e => {
          console.warn("Failed to load attendance", e);
          ATT_FROM_DB = false;
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
        const used = Number.isFinite(Number(staffUsage.active_staff)) ? Number(staffUsage.active_staff) : staffUsers.length;
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
                        <button class="icon-act danger sl-delete-btn" data-idx="${i}" title="Delete account"><i class="fa-solid fa-user-minus"></i></button>
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

        // -- Delete account --
        loginPane.querySelectorAll('.sl-delete-btn').forEach(b => b.addEventListener('click', async () => {
          const u = staffUsers[+b.dataset.idx];
          if (!confirm(`Delete account for ${u.display_name || u.username}? This cannot be undone.`)) return;
          try {
            await RS_API.staffUsers({ action:'delete_user', user_id:u.id });
            RS.toast(`${u.display_name || u.username} deleted`, 'fa-user-minus');
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
            .catch(e => { console.warn(e); RS.toast(String(e.message || e), 'fa-circle-exclamation'); });
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
            .catch(e => { console.warn(e); RS.toast(String(e.message || e), 'fa-circle-exclamation'); });
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
            .catch(e => { console.warn(e); RS.toast(String(e.message || e), 'fa-circle-exclamation'); });
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
      sec.addEventListener('rs:subtab-change', e => {
        if (e.detail && e.detail.pane === 'logins') setTimeout(() => loadStaffUsers(), 50);
      });
      sec.addEventListener('click', e => {
        const btn = e.target.closest('.seg button');
        if (btn && btn.textContent.trim().toLowerCase() === 'logins') setTimeout(() => loadStaffUsers(), 50);
      });
    }

    enhanceInventory();
    enhanceEmployees();
  }
  if(window.RS) boot(); else document.addEventListener('rs:ready', boot, { once:true });
})();
