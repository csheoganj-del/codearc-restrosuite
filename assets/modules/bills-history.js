/* ============================================================
   RestroSuite — Bills history UI (Wave 6 code-split)
   Extracted from dashboard.js — operates on window.RS.BILLS.
   ============================================================ */
(function (global) {
  'use strict';

  const payPill = {
    UPI: 'pill-violet',
    Cash: 'pill-green',
    Card: 'pill-orange',
    Split: 'pill-amber',
    Due: 'pill-red',
  };

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') RS.toast(msg, icon);
  }

  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') return RS.rs(n);
    const v = Number(n) || 0;
    return '₹' + v.toLocaleString('en-IN');
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

  function getBills() {
    return (global.RS && Array.isArray(RS.BILLS) ? RS.BILLS : []) || [];
  }

  function getMenu() {
    return (global.RS && RS.MENU) || [];
  }

  function getInventory() {
    return (global.RS && RS.INVENTORY) || [];
  }

  function receiptPayloadFromBill(b) {
    const items =
      Array.isArray(b._items) && b._items.length
        ? b._items.map((i) => ({
            name: i.name || 'Item',
            qty: Number(i.qty || 1),
            price: Number(i.price || 0),
          }))
        : [{ name: 'Bill total', qty: 1, price: Number(b.amount || 0) }];
    const sub = Number(b.subtotal || items.reduce((sum, i) => sum + i.price * i.qty, 0));
    const gst = Number(b.gst || 0);
    const grand = Number(b.amount || sub + gst);
    return {
      no: b.no || b.id || 'Invoice',
      time: b.time || '',
      table: b.table || 'Walk-in / Takeaway',
      customer: b.customerName || '',
      customerPhone: b.customerPhone || '',
      customerGst: b.customerGst || '',
      items,
      sub,
      disc: Number(b.discount || 0),
      gst,
      grand,
      tenders:
        Array.isArray(b.tenders) && b.tenders.length
          ? b.tenders
          : [{ method: b.pay || b.paymentMethod || 'Cash', amount: grand }],
      change: Number(b.changeAmount || b.change || 0),
      serviceChargeAmount: Number(b.serviceChargeAmount || 0),
      serviceChargePct: b.serviceChargePct,
      tipAmount: Number(b.tipAmount || b.tip || 0),
      deliveryCharge: Number(b.deliveryCharge || 0),
      liquorTaxAmount: Number(b.liquorTaxAmount || 0),
    };
  }

  /** Load bill lines into POS cart for rebill / amend (new sale). */
  async function rebillToPos(b) {
    if (!b) return;
    const items =
      Array.isArray(b._items) && b._items.length
        ? b._items.map((i) => ({
            id: i.id || i.name,
            name: i.name || 'Item',
            qty: Math.max(1, Number(i.qty || 1)),
            price: Number(i.price || 0),
            cat: i.cat || i.category || 'Rebill',
            stock: 'ok',
            taxCategory: i.taxCategory || i.tax_category,
          }))
        : [];
    if (!items.length) {
      toast('No line items on this bill to rebill', 'fa-circle-exclamation');
      return;
    }
    if (global.RS && typeof RS.activateTab === 'function') await RS.activateTab('pos-tab');
    await new Promise((r) => setTimeout(r, 100));
    if (global.RS && typeof RS.setCart === 'function') RS.setCart(items);
    const nameEl = document.getElementById('cust-input-name') || document.getElementById('cust-name');
    const phoneEl = document.getElementById('cust-input-phone') || document.getElementById('cust-phone');
    if (nameEl && b.customerName) {
      nameEl.value = b.customerName;
      nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneEl && b.customerPhone) {
      phoneEl.value = b.customerPhone;
      phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const tableSelect = document.getElementById('cart-table');
    if (tableSelect && b.table) {
      let opt = [...tableSelect.options].find(
        (o) => o.value === b.table || o.text === b.table
      );
      if (!opt) {
        opt = document.createElement('option');
        opt.value = b.table;
        opt.textContent = b.table;
        tableSelect.appendChild(opt);
      }
      tableSelect.value = opt.value;
      tableSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (b.tipAmount && global.RS && typeof RS.setTip === 'function') {
      RS.setTip(b.tipAmount);
    }
    if (b.deliveryCharge) {
      const dc = document.getElementById('delivery-charge');
      if (dc) {
        dc.value = b.deliveryCharge;
        dc.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    try {
      if (global.RS && typeof RS.renderCart === 'function') RS.renderCart();
    } catch (_) {}
    toast(
      'Rebill loaded · ' + (b.no || '') + (b.status === 'refunded' ? ' (voided original)' : ' — void first if correcting a paid bill'),
      'fa-rotate'
    );
  }

  function showBillReceipt(b) {
    if (global.RSReceipt && typeof RSReceipt.show === 'function') {
      RSReceipt.show(receiptPayloadFromBill(b));
      return;
    }
    toast('Receipt preview is unavailable on this screen', 'fa-circle-exclamation');
  }

  function printBillThermal(b) {
    const payload = receiptPayloadFromBill(b);
    if (global.RSOps && typeof RSOps.printBillThermal === 'function') {
      return RSOps.printBillThermal(payload);
    }
    if (global.RSReceipt && typeof RSReceipt.print === 'function') {
      return RSReceipt.print(payload);
    }
    toast('Thermal print unavailable', 'fa-circle-exclamation');
  }

  function shareBillReceipt(b) {
    const bill = receiptPayloadFromBill(b);
    if (global.RSReceipt && typeof RSReceipt.share === 'function') {
      RSReceipt.share(bill);
    } else {
      const text =
        global.RSReceipt && typeof RSReceipt.text === 'function'
          ? RSReceipt.text(bill)
          : `${bill.no}\nTotal: ${rs(bill.grand)}`;

      let phone = bill.customerPhone ? bill.customerPhone.replace(/\D/g, '') : '';
      if (phone.length === 10) {
        phone = '91' + phone;
      }

      const url = phone
        ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;

      window.open(url, '_blank', 'noopener,noreferrer');
      toast('WhatsApp receipt ready', 'fa-whatsapp');
    }
  }

  /** Refund detail modal — returns reason string, or null if cancelled */
  function showRefundModal(b) {
    return new Promise((resolve) => {
      document.getElementById('rs-refund-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'rs-refund-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:9998;background:rgba(17,24,39,0.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;animation:rsPinFadeIn 0.18s ease;';
      const amt = rs(b.amount || 0);
      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border:1px solid var(--stroke-2,#e5e7eb);border-radius:20px;padding:28px 24px 24px;width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.15);animation:rsPinSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
            <div style="width:42px;height:42px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;color:#ef4444;flex-shrink:0;"><i class="fa-solid fa-rotate-left"></i></div>
            <div>
              <div style="font-weight:800;font-size:15px;color:var(--text,#111);">Void / Refund</div>
              <div style="font-size:12px;color:var(--text-soft,#6b7280);">${_e(b.no || b.id)} &middot; ${amt}</div>
            </div>
          </div>
          <p style="font-size:12.5px;color:var(--text-soft);line-height:1.45;margin:0 0 12px">Marks the bill voided. Stock is not restored (food already served). Use <b>Rebill</b> after to correct items on a new bill.</p>
          <div style="font-size:12.5px;color:var(--text-soft,#6b7280);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Reason</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;" id="rfund-reason-chips">
            ${['Customer complaint', 'Wrong order', 'Quality issue', 'Duplicate charge', 'Amend / rebill', 'Other']
              .map(
                (r) =>
                  `<button data-r="${_e(r)}" style="padding:8px 10px;border-radius:10px;border:1.5px solid var(--stroke-2,#e5e7eb);background:var(--glass,#f9fafb);font-size:12px;cursor:pointer;font-family:inherit;color:var(--text,#111);text-align:left;transition:all .15s;" class="rfund-chip">${_e(r)}</button>`
              )
              .join('')}
          </div>
          <textarea id="rfund-note" placeholder="Additional notes (optional)..." rows="2" style="width:100%;padding:10px 12px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;font-family:inherit;font-size:13px;resize:none;outline:none;background:var(--glass,#f9fafb);color:var(--text,#111);box-sizing:border-box;"></textarea>
          <div style="display:flex;gap:10px;margin-top:16px;">
            <button id="rfund-cancel" style="flex:1;padding:11px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;background:transparent;font-family:inherit;font-size:13px;cursor:pointer;color:var(--text-soft,#6b7280);">Cancel</button>
            <button id="rfund-confirm" style="flex:2;padding:11px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">Confirm void</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      let selectedReason = '';
      overlay.querySelectorAll('.rfund-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          overlay.querySelectorAll('.rfund-chip').forEach((c) => {
            c.style.cssText +=
              ';background:var(--glass,#f9fafb);border-color:var(--stroke-2,#e5e7eb);color:var(--text,#111);font-weight:normal;';
          });
          chip.style.background = '#ef4444';
          chip.style.borderColor = '#ef4444';
          chip.style.color = '#fff';
          chip.style.fontWeight = '700';
          selectedReason = chip.dataset.r;
        });
      });
      document.getElementById('rfund-confirm').onclick = () => {
        const note = document.getElementById('rfund-note').value.trim();
        const reason = [selectedReason, note].filter(Boolean).join(' -- ') || 'POS refund';
        overlay.remove();
        resolve(reason);
      };
      document.getElementById('rfund-cancel').onclick = () => {
        overlay.remove();
        resolve(null);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(null);
        }
      });
    });
  }

  function showDeleteConfirm(b) {
    return new Promise((resolve) => {
      document.getElementById('rs-del-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'rs-del-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:9998;background:rgba(17,24,39,0.5);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;animation:rsPinFadeIn 0.18s ease;';
      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border:1px solid var(--stroke-2,#e5e7eb);border-radius:20px;padding:28px 24px 24px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.15);animation:rsPinSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1);text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;font-size:20px;color:#ef4444;margin:0 auto 16px;"><i class="fa-solid fa-trash-can"></i></div>
          <div style="font-weight:800;font-size:16px;color:var(--text,#111);margin-bottom:8px;">Delete Bill?</div>
          <div style="font-size:13px;color:var(--text-soft,#6b7280);line-height:1.6;margin-bottom:22px;"><strong>${_e(b.no || b.id || 'This bill')}</strong> will be permanently removed from records.<br>This action <strong>cannot be undone</strong>.</div>
          <div style="display:flex;gap:10px;">
            <button id="rs-del-cancel" style="flex:1;padding:11px;border:1px solid var(--stroke-2,#e5e7eb);border-radius:10px;background:transparent;font-family:inherit;font-size:13px;cursor:pointer;color:var(--text-soft,#6b7280);">Cancel</button>
            <button id="rs-del-confirm" style="flex:2;padding:11px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">Yes, Delete</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('rs-del-confirm').onclick = () => {
        overlay.remove();
        resolve(true);
      };
      document.getElementById('rs-del-cancel').onclick = () => {
        overlay.remove();
        resolve(false);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      });
    });
  }

  async function markBillRefunded(b) {
    if (!b || b.status === 'refunded') return;

    if (global.RSPinModal) {
      const ok = await RSPinModal.request(`Void / Refund ${b.no || b.id || 'bill'}`);
      if (!ok) return;
    }

    const reason = await showRefundModal(b);
    if (reason === null) return;

    b.status = 'refunded';
    b.refundReason = reason || 'POS void/refund';
    b.refundedAt = new Date().toISOString();
    b.voided = true;
    try {
      const s = global.RS_API && RS_API.session ? RS_API.session() : {};
      b.refundedBy = s.display_name || s.username || 'staff';
      b.refundStation =
        global.RSOps && RSOps.getStationLabel ? RSOps.getStationLabel() : '';
      b.refundShiftId =
        global.RSOps && RSOps.getOpenShift && RSOps.getOpenShift()
          ? RSOps.getOpenShift().shiftId
          : b.shiftId || '';
    } catch (_) {}

    const BILLS = getBills();
    let cloudMarked = false;
    try {
      if (global.RS_DB && RS_DB.writeLocal) await RS_DB.writeLocal('bills', BILLS);
      if (global.RS_API && RS_API.data && RS_API.session && RS_API.session()) {
        await RS_API.data({
          table: 'doppio_refund_requests',
          operation: 'insert',
          data: {
            order_id: String(b.no || b.orderId || b.id),
            amount: Number(b.amount || b.total || 0),
            reason: b.refundReason,
            status: 'approved',
            metadata: {
              refunded_by: b.refundedBy || '',
              station: b.refundStation || '',
              shift_id: b.refundShiftId || '',
              bill_id: b.id,
            },
          },
          returning: false,
        }).catch(() => {});
        try {
          await RS_API.data({
            table: 'tenant_audit_logs',
            operation: 'insert',
            data: {
              action: 'bill.refund',
              target_type: 'doppio_bills',
              metadata: {
                order_id: b.no || b.orderId,
                amount: Number(b.amount || b.total || 0),
                reason: b.refundReason,
                station: b.refundStation,
              },
            },
            returning: false,
          });
        } catch (_) {}
        const billFilters = Number.isFinite(Number(b.id))
          ? [{ operator: 'eq', column: 'id', value: Number(b.id) }]
          : [{ operator: 'eq', column: 'order_id', value: String(b.no || b.orderId || '') }];
        await RS_API.update(
          'doppio_bills',
          {
            status: 'refunded',
            refund_reason: b.refundReason,
            refunded_at: b.refundedAt,
          },
          billFilters,
          { returning: false }
        );
        cloudMarked = true;
      }
    } catch (e) {
      console.warn('Refund cloud update failed', e);
    }
    renderBills();
    const msg = cloudMarked
      ? 'Void recorded + audit · tap to rebill'
      : 'Void marked locally · tap to rebill';
    if (typeof global.__toast === 'function') {
      global.__toast(msg, 'fa-rotate-left', () => rebillToPos(b));
    } else {
      toast(msg, 'fa-rotate-left');
    }
    // Auto-offer rebill when reason is amend
    if (/amend|rebill|wrong order|duplicate/i.test(String(reason || ''))) {
      setTimeout(() => rebillToPos(b), 350);
    }
  }

  async function deleteBill(b) {
    if (!b) return;
    if (global.RSPinModal) {
      const ok = await RSPinModal.request(`Delete Bill ${b.no || b.id || ''}`);
      if (!ok) return;
    }
    const confirmed = await showDeleteConfirm(b);
    if (!confirmed) return;

    const BILLS = getBills();
    const idx = BILLS.findIndex((x) => x === b || x.no === b.no);
    if (idx !== -1) BILLS.splice(idx, 1);

    // Only on DELETE — refund does NOT restore stock (food was served)
    try {
      const MENU = getMenu();
      const INVENTORY = getInventory();
      const bItems = b._items || [];
      let invChanged = false;
      bItems.forEach((it) => {
        const menuItem = MENU.find((m) => m.name === it.name);
        if (!menuItem || !Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) return;
        const orderedQty = Number(it.qty) || 1;
        menuItem.ingredients.forEach((ing) => {
          const invItem = INVENTORY.find((x) => x.name === ing.name);
          if (!invItem) return;
          invItem.stock = (Number(invItem.stock) || 0) + (Number(ing.qty) || 0) * orderedQty;
          invChanged = true;
        });
      });
      if (invChanged && global.RS_DB && RS_DB.writeLocal) {
        await RS_DB.writeLocal('inventory', INVENTORY);
      }
    } catch (e) {
      console.warn('Inventory restore failed', e);
    }

    try {
      if (global.RS_DB && RS_DB.writeLocal) await RS_DB.writeLocal('bills', BILLS);
      if (global.RS_API && RS_API.data && RS_API.session && RS_API.session()) {
        await RS_API.data({
          table: 'doppio_bills',
          operation: 'delete',
          filters: { bill_no: b.no || b.id },
          returning: false,
        }).catch((e) => console.warn('Cloud delete', e));
      }
    } catch (e) {
      console.warn('Bill delete sync failed', e);
    }
    renderBills();
    toast(`Bill ${b.no || b.id || ''} deleted -- inventory restored`, 'fa-trash');
  }

  /**
   * Wave 6/7: broader client filter — bill no, table, customer name/phone, pay method.
   */
  function filterBills(bills, q, payFilter, statusFilter) {
    const needle = String(q || '').toLowerCase().trim();
    let filtered = bills;
    if (needle) {
      filtered = bills.filter((b) => {
        const hay = [
          b.no,
          b.orderId,
          b.id,
          b.table,
          b.customerName,
          b.customer,
          b.customerPhone,
          b.pay,
          b.paymentMethod,
        ]
          .map((x) => String(x || '').toLowerCase())
          .join(' ');
        return hay.includes(needle);
      });
    }
    const pf = String(payFilter || 'All').toLowerCase();
    if (pf !== 'all') {
      filtered = filtered.filter((b) => b.pay && String(b.pay).toLowerCase() === pf);
    }
    const sf = String(statusFilter || 'All').toLowerCase();
    if (sf !== 'all') {
      filtered = filtered.filter((b) => b.status && String(b.status).toLowerCase() === sf);
    }
    return filtered;
  }

  /** Map cloud doppio_bills row → local bill shape used by the table. */
  function normalizeServerBill(row) {
    if (!row || typeof row !== 'object') return null;
    const items = row.items;
    let itemCount = row.items;
    if (Array.isArray(items)) itemCount = items.length;
    else if (typeof items === 'object' && items) itemCount = Object.keys(items).length;
    return {
      id: row.id,
      no: row.orderId || row.order_id || row.no || String(row.id || ''),
      orderId: row.orderId || row.order_id || row.no,
      time: row.dateTime || row.date_time || row.created_at || '',
      dateTime: row.dateTime || row.date_time || row.created_at || '',
      table: row.tableNumber || row.table_number || row.table || '',
      items: itemCount,
      amount: Number(row.total != null ? row.total : row.amount) || 0,
      pay: row.paymentMethod || row.payment_method || row.pay || 'Cash',
      paymentMethod: row.paymentMethod || row.payment_method || row.pay || 'Cash',
      status: String(row.status || 'paid').toLowerCase() === 'refunded' ? 'refunded' : 'paid',
      customerName: row.customerName || row.customer_name || '',
      customerPhone: row.customerPhone || row.customer_phone || '',
      subtotal: Number(row.subtotal) || 0,
      gst: Number(row.gst) || 0,
      discount: Number(row.discount) || 0,
      _items: Array.isArray(items) ? items : [],
      _fromServer: true,
    };
  }

  let _serverHits = [];
  let _searchGen = 0;

  /**
   * Wave 7: query tenant-data search_bills for history beyond the client cache.
   * Returns [] on empty, null on skip/failure (caller keeps local-only).
   */
  async function searchBillsServer(q, limit) {
    const needle = String(q || '').trim();
    if (needle.length < 2) return null;
    if (!global.RS_API || typeof RS_API.data !== 'function') return null;
    if (global.RS_API.zeroCostLaunchMode) return null;
    if (navigator.onLine === false) return null;
    try {
      const res = await Promise.race([
        RS_API.data({ operation: 'search_bills', q: needle, limit: limit || 50 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('search_bills timeout')), 5000)),
      ]);
      const rows =
        (res && res.data && Array.isArray(res.data.rows) && res.data.rows) ||
        (res && Array.isArray(res.rows) && res.rows) ||
        (res && Array.isArray(res.data) && res.data) ||
        [];
      return rows.map(normalizeServerBill).filter(Boolean);
    } catch (e) {
      console.warn('[BillsHistory] server search failed', e && e.message);
      return null;
    }
  }

  function mergeBillsForDisplay(localFiltered, serverRows, q, payFilter, statusFilter) {
    const map = new Map();
    (localFiltered || []).forEach((b) => {
      const key = String(b.no || b.orderId || b.id || '');
      if (key) map.set(key, b);
    });
    const serverFiltered = filterBills(serverRows || [], q, payFilter, statusFilter);
    serverFiltered.forEach((b) => {
      const key = String(b.no || b.orderId || b.id || '');
      if (key && !map.has(key)) map.set(key, b);
    });
    return Array.from(map.values());
  }

  function paintBillsTable(filtered) {
    const body = $('#bills-table-body');
    if (!body) return;

    body.innerHTML = filtered
      .map(
        (b) => `
      <tr data-bill-no="${_e(b.no || b.orderId || b.id || '')}">
        <td><b>${_e(b.no || b.orderId || b.id || '-')}</b></td><td>${_e(b.time || b.dateTime || '-')}</td><td>${_e(b.table || '-')}</td><td>${_e(b.items)}</td>
        <td><span class="pill ${payPill[b.pay] || ''}" style="padding:3px 9px">${_e(b.pay)}</span></td>
        <td class="td-strong">${rs(b.amount)}</td>
        <td>${b.status === 'paid' ? '<span class="pill pill-green" style="padding:3px 9px">Paid</span>' : '<span class="pill pill-red" style="padding:3px 9px">Voided</span>'}</td>
        <td><div class="row-actions"><button class="icon-act go" title="Reprint preview" aria-label="Reprint bill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-print"></i></button><button class="icon-act thermal-act" title="Thermal print" aria-label="Thermal print bill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-receipt"></i></button><button class="icon-act rebill-act" title="Rebill / load into POS" aria-label="Rebill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-rotate"></i></button><button class="icon-act" title="Share on WhatsApp" aria-label="Share bill ${_e(b.no || b.orderId || '')}"><i class="fa-brands fa-whatsapp"></i></button><button class="icon-act danger refund-act" title="Void / refund" aria-label="Void bill ${_e(b.no || b.orderId || '')}" ${b.status === 'refunded' ? 'disabled style="opacity:.4"' : ''}><i class="fa-solid fa-ban"></i></button><button class="icon-act del-act" title="Delete bill" aria-label="Delete bill ${_e(b.no || b.orderId || '')}" style="color:#ef4444;"><i class="fa-solid fa-trash-can"></i></button></div></td>
      </tr>`
      )
      .join('');

    const visibleBills = filtered;
    if (body._rsBillActionHandler) body.removeEventListener('click', body._rsBillActionHandler, true);
    body._rsBillActionHandler = (e) => {
      const btn = e.target.closest('.icon-act');
      if (!btn || !body.contains(btn) || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const row = btn.closest('tr');
      const bill = visibleBills[[...body.children].indexOf(row)];
      if (!bill) return;
      // Prefer live RS.BILLS object when present (mutations stick)
      const live = getBills().find(
        (x) => x === bill || String(x.no || x.orderId) === String(bill.no || bill.orderId)
      );
      const target = live || bill;
      if (btn.classList.contains('go')) return showBillReceipt(target);
      if (btn.classList.contains('thermal-act')) return printBillThermal(target);
      if (btn.classList.contains('rebill-act')) return rebillToPos(target);
      if (btn.classList.contains('refund-act')) return markBillRefunded(target);
      if (btn.classList.contains('del-act')) return deleteBill(target);
      return shareBillReceipt(target);
    };
    body.addEventListener('click', body._rsBillActionHandler, true);
  }

  function renderBills() {
    const BILLS = getBills();
    const paidBills = BILLS.filter((b) => b.status === 'paid');
    const totalSales = paidBills.reduce((sum, b) => sum + (b.amount || 0), 0);
    const count = BILLS.length;
    const aov = paidBills.length > 0 ? Math.round(totalSales / paidBills.length) : 0;
    const refunds = BILLS.filter((b) => b.status === 'refunded').length;

    const salesEl = document.getElementById('bills-stat-sales');
    if (salesEl) salesEl.textContent = rs(totalSales);
    const countEl = document.getElementById('bills-stat-count');
    if (countEl) countEl.textContent = count;
    const aovEl = document.getElementById('bills-stat-aov');
    if (aovEl) aovEl.textContent = rs(aov);
    const refundsEl = document.getElementById('bills-stat-refunds');
    if (refundsEl) refundsEl.textContent = refunds;

    const q = ($('#bills-search')?.value || '').toLowerCase();
    const payFilter = $('#bills-pay-filter')?.value || 'All';
    const statusFilter = $('#bills-status-filter')?.value || 'All';

    const localFiltered = filterBills(BILLS, q, payFilter, statusFilter);
    const merged = mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
    paintBillsTable(merged);

    // Wave 7: async server search when query is long enough
    const gen = ++_searchGen;
    if (String(q || '').trim().length >= 2) {
      searchBillsServer(q, 50).then((rows) => {
        if (gen !== _searchGen) return;
        if (!rows) return;
        _serverHits = rows;
        // Merge server rows into memory cache (non-destructive for local-only fields)
        const list = getBills();
        rows.forEach((r) => {
          const key = String(r.no || r.orderId || '');
          if (!key) return;
          const idx = list.findIndex((b) => String(b.no || b.orderId) === key);
          if (idx === -1) list.push(r);
        });
        const q2 = ($('#bills-search')?.value || '').toLowerCase();
        const pf2 = $('#bills-pay-filter')?.value || 'All';
        const sf2 = $('#bills-status-filter')?.value || 'All';
        const local2 = filterBills(getBills(), q2, pf2, sf2);
        paintBillsTable(mergeBillsForDisplay(local2, rows, q2, pf2, sf2));
      });
    } else {
      _serverHits = [];
    }
  }

  function debounce(fn, wait) {
    let t;
    return function debounced() {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 60);
    };
  }

  function bindFilters() {
    renderBills();
    const search = $('#bills-search');
    if (search && !search._rsListenerBound) {
      search._rsListenerBound = true;
      search.addEventListener('input', debounce(renderBills, 180));
    }
    const payFil = $('#bills-pay-filter');
    if (payFil && !payFil._rsListenerBound) {
      payFil._rsListenerBound = true;
      payFil.addEventListener('change', renderBills);
    }
    const statusFil = $('#bills-status-filter');
    if (statusFil && !statusFil._rsListenerBound) {
      statusFil._rsListenerBound = true;
      statusFil.addEventListener('change', renderBills);
    }
  }

  const api = {
    receiptPayloadFromBill,
    showBillReceipt,
    shareBillReceipt,
    rebillToPos,
    markBillRefunded,
    deleteBill,
    renderBills,
    bindFilters,
    filterBills,
    searchBillsServer,
    normalizeServerBill,
    showRefundModal,
    showDeleteConfirm,
  };

  global.RSBillsHistory = api;

  // Attach thin helpers on RS when ready
  function attachToRS() {
    if (!global.RS) return;
    global.RS.renderBills = renderBills;
    global.RS.receiptPayloadFromBill = receiptPayloadFromBill;
  }
  if (global.RS) attachToRS();
  document.addEventListener('rs:ready', attachToRS);
})(typeof window !== 'undefined' ? window : globalThis);
