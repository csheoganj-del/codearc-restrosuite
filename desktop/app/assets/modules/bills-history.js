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
            note: i.note || i.notes || '',
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
      covers: Math.max(0, Number(b.covers != null ? b.covers : b.pax) || 0),
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
      loyaltyRedeemAmount: Number(b.loyaltyRedeemAmount || 0),
      promoCode: b.promoCode || '',
      promoAmount: Number(b.promoAmount || 0),
      promoTitle: b.promoTitle || '',
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
            note: i.note || i.notes || '',
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
  let billsDateRange = 'today';
  let billsCustomFrom = '';
  let billsCustomTo = '';
  try {
    const saved = localStorage.getItem('rs_bills_date_range');
    if (saved && /^(today|yesterday|7d|all|custom)$/.test(saved)) billsDateRange = saved;
    billsCustomFrom = localStorage.getItem('rs_bills_date_from') || '';
    billsCustomTo = localStorage.getItem('rs_bills_date_to') || '';
  } catch (_) {}

  function startOfLocalDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /** Parse bill timestamp from ISO or common POS display strings. */
  function parseBillDate(b) {
    const raw = b && (b.dateTime || b.time || b.created_at || b.createdAt || '');
    if (!raw) return null;
    let d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
    const s = String(raw).trim();
    // "13 Jul, 11:18 am" / "13 Jul 2026, 11:18 am"
    const m = s.match(
      /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s*(\d{4})?(?:,?\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i
    );
    if (m) {
      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const mon = months[String(m[2]).toLowerCase().slice(0, 3)];
      if (mon != null) {
        const year = m[3] ? Number(m[3]) : new Date().getFullYear();
        let hour = m[4] != null ? Number(m[4]) : 12;
        const min = m[5] != null ? Number(m[5]) : 0;
        const ap = (m[6] || '').toLowerCase();
        if (ap === 'pm' && hour < 12) hour += 12;
        if (ap === 'am' && hour === 12) hour = 0;
        d = new Date(year, mon, Number(m[1]), hour, min, 0, 0);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  function billInDateRange(b) {
    const range = billsDateRange || 'today';
    if (range === 'all') return true;
    const d = parseBillDate(b);
    if (!d) {
      // Unparseable timestamps only show in All (avoids polluting Today stats)
      return false;
    }
    const t = d.getTime();
    const today0 = startOfLocalDay(new Date()).getTime();
    const dayMs = 86400000;
    if (range === 'today') return t >= today0 && t < today0 + dayMs;
    if (range === 'yesterday') return t >= today0 - dayMs && t < today0;
    if (range === '7d') return t >= today0 - 6 * dayMs && t < today0 + dayMs;
    if (range === 'custom') {
      let from = -Infinity;
      let to = Infinity;
      if (billsCustomFrom) {
        const f = new Date(billsCustomFrom + 'T00:00:00');
        if (!Number.isNaN(f.getTime())) from = startOfLocalDay(f).getTime();
      }
      if (billsCustomTo) {
        const e = new Date(billsCustomTo + 'T00:00:00');
        if (!Number.isNaN(e.getTime())) to = startOfLocalDay(e).getTime() + dayMs;
      }
      return t >= from && t < to;
    }
    return true;
  }

  function dateRangeLabels() {
    switch (billsDateRange) {
      case 'yesterday':
        return { sales: "Yesterday's sales", count: 'Bills yesterday', refunds: 'Refunds yesterday' };
      case '7d':
        return { sales: '7-day sales', count: 'Bills (7 days)', refunds: 'Refunds (7 days)' };
      case 'all':
        return { sales: 'All-time sales', count: 'All bills', refunds: 'All refunds' };
      case 'custom':
        return { sales: 'Sales in range', count: 'Bills in range', refunds: 'Refunds in range' };
      default:
        return { sales: "Today's sales", count: "Today's bills", refunds: 'Refunds today' };
    }
  }

  function filterBills(bills, q, payFilter, statusFilter) {
    const needle = String(q || '').toLowerCase().trim();
    let filtered = (bills || []).filter(billInDateRange);
    if (needle) {
      filtered = filtered.filter((b) => {
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

  function getFilteredBills() {
    const q = ($('#bills-search') && $('#bills-search').value) || '';
    const payFilter = ($('#bills-pay-filter') && $('#bills-pay-filter').value) || 'All';
    const statusFilter = ($('#bills-status-filter') && $('#bills-status-filter').value) || 'All';
    const localFiltered = filterBills(getBills(), q, payFilter, statusFilter);
    return mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
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

  /** Human + Excel-friendly bill timestamp */
  function formatBillTime(b) {
    const raw = b && (b.dateTime || b.time || b.created_at || '');
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      try {
        const loc =
          typeof global.RS_getOutletLocale === 'function' ? RS_getOutletLocale() : 'en-IN';
        const tz =
          typeof global.RS_getOutletTimezone === 'function' ? RS_getOutletTimezone() : 'Asia/Kolkata';
        return d.toLocaleString(loc, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz,
        });
      } catch (_) {
        return d.toLocaleString();
      }
    }
    // Already formatted (e.g. "11 Jul, 3:30 pm")
    return String(raw);
  }

  function formatBillTimeIsoExcel(b) {
    const raw = b && (b.dateTime || b.time || b.created_at || '');
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    const pad = (n) => String(n).padStart(2, '0');
    // Local wall time yyyy-mm-dd HH:mm:ss — Excel-friendly
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      ' ' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }

  function lineItemsSummary(b) {
    const items = Array.isArray(b._items) ? b._items : [];
    if (items.length) {
      return items
        .map((i) => {
          const q = Number(i.qty) || 1;
          const name = String(i.name || 'Item').replace(/[;\n\r]+/g, ' ');
          return q + 'x ' + name;
        })
        .join('; ');
    }
    if (b.items != null && b.items !== '') return String(b.items);
    return '';
  }

  function csvEscape(value) {
    const s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function collectExportList() {
    const q = ($('#bills-search') && $('#bills-search').value) || '';
    const payFilter = ($('#bills-pay-filter') && $('#bills-pay-filter').value) || 'All';
    const statusFilter = ($('#bills-status-filter') && $('#bills-status-filter').value) || 'All';
    const all = getBills();
    const localFiltered = filterBills(all, q, payFilter, statusFilter);
    return mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
  }

  function exportRangeLabel() {
    switch (billsDateRange) {
      case 'yesterday':
        return 'Yesterday';
      case '7d':
        return '7-days';
      case 'all':
        return 'All';
      case 'custom': {
        const a = billsCustomFrom || 'start';
        const b = billsCustomTo || 'end';
        return a + '_to_' + b;
      }
      default:
        return 'Today';
    }
  }

  function exportOutletSlug() {
    const settings = global.RS_SETTINGS || {};
    const sess = global.RS_API && RS_API.session ? RS_API.session() : null;
    let name =
      settings.set_restaurant_name ||
      settings.set_outlet_name ||
      (sess && (sess.tenant_name || sess.business_name)) ||
      'RestroSuite';
    return (
      String(name)
        .replace(/[^\w\-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'RestroSuite'
    );
  }

  function exportStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function numOrBlank(v) {
    if (v == null || v === '') return '';
    const n = Number(v);
    return Number.isFinite(n) ? n : '';
  }

  function paymentBreakdown(list) {
    const map = {};
    (list || []).forEach((b) => {
      if (String(b.status || '').toLowerCase() === 'refunded') return;
      if (Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach((t) => {
          const method = t.method || b.pay || 'Cash';
          map[method] = (map[method] || 0) + (Number(t.amount) || 0);
        });
      } else {
        const method = b.pay || b.paymentMethod || 'Cash';
        map[method] = (map[method] || 0) + (Number(b.amount) || Number(b.total) || 0);
      }
    });
    return map;
  }

  /**
   * Real Excel .xlsx — Summary + Bills + Line items sheets.
   * Respects date range, search, payment, and status filters.
   */
  function exportBillsXlsx() {
    const list = collectExportList();
    if (!list.length) {
      toast('No bills to export for this range', 'fa-circle-exclamation');
      return false;
    }
    if (!global.RSXlsxLite || typeof RSXlsxLite.buildXlsx !== 'function') {
      toast('Excel engine missing — exporting CSV instead', 'fa-circle-exclamation');
      return exportBillsCsv();
    }

    const settings = global.RS_SETTINGS || {};
    const taxLabel = settings.set_tax_label || 'GST';
    const rangeLabel = exportRangeLabel();
    const outlet = exportOutletSlug();
    const paid = list.filter((b) => String(b.status || '').toLowerCase() === 'paid');
    const refunded = list.filter((b) => String(b.status || '').toLowerCase() === 'refunded');
    const sales = paid.reduce((s, b) => s + (Number(b.amount) || Number(b.total) || 0), 0);
    const aov = paid.length ? Math.round(sales / paid.length) : 0;
    const gstTotal = paid.reduce((s, b) => s + (Number(b.gst) || 0), 0);
    const payMap = paymentBreakdown(list);
    const now = new Date();

    const summaryRows = [
      ['RestroSuite Bill Export'],
      ['Outlet', outlet.replace(/-/g, ' ')],
      ['Range', rangeLabel.replace(/_/g, ' ')],
      ['Exported at', now.toLocaleString('en-IN')],
      [],
      ['Metric', 'Value'],
      ['Bills in export', list.length],
      ['Paid bills', paid.length],
      ['Refunded bills', refunded.length],
      ['Sales (paid)', sales],
      ['Avg order value', aov],
      [taxLabel + ' (from bills)', gstTotal],
      [],
      ['Payment breakdown', 'Amount'],
    ];
    Object.keys(payMap)
      .sort()
      .forEach((k) => summaryRows.push([k, payMap[k]]));
    if (!Object.keys(payMap).length) summaryRows.push(['—', 0]);
    summaryRows.push([]);
    summaryRows.push(['Notes']);
    summaryRows.push(['Stats match the active Bills date range and filters.']);
    summaryRows.push(['Open the Bills sheet for one row per bill; Line items for pivots.']);

    const billHeaders = [
      'Bill No',
      'Date',
      'Date Display',
      'Table',
      'Customer',
      'Phone',
      'Item Count',
      'Line Items',
      'Subtotal',
      taxLabel,
      'Discount',
      'Total',
      'Payment',
      'Tenders',
      'Status',
      'Channel',
      'Station',
      'Shift',
      'Cashier',
      'Order Type',
    ];
    const billRows = [billHeaders];
    list.forEach((b) => {
      const tenders = Array.isArray(b.tenders)
        ? b.tenders.map((t) => (t.method || '') + ':' + (Number(t.amount) || 0)).join(' | ')
        : '';
      const itemCount =
        Array.isArray(b._items) && b._items.length
          ? b._items.reduce((acc, i) => acc + (Number(i.qty) || 1), 0)
          : numOrBlank(b.items);
      billRows.push([
        b.no || b.orderId || b.id || '',
        formatBillTimeIsoExcel(b),
        formatBillTime(b),
        b.table || '',
        b.customerName || b.customer || '',
        b.customerPhone || '',
        itemCount,
        lineItemsSummary(b),
        numOrBlank(b.subtotal),
        numOrBlank(b.gst),
        numOrBlank(b.discount != null ? b.discount : b.disc),
        numOrBlank(b.amount != null ? b.amount : b.total),
        b.pay || b.paymentMethod || '',
        tenders,
        b.status || '',
        b.channel || b.channelCode || '',
        b.stationLabel || b.stationId || '',
        b.shiftId || '',
        b.cashier || '',
        b.orderType || '',
      ]);
    });

    const lineHeaders = [
      'Bill No',
      'Date',
      'Table',
      'Customer',
      'Payment',
      'Status',
      'Item',
      'Qty',
      'Unit Price',
      'Line Total',
      'Note',
    ];
    const lineRows = [lineHeaders];
    list.forEach((b) => {
      const billNo = b.no || b.orderId || b.id || '';
      const date = formatBillTimeIsoExcel(b);
      const table = b.table || '';
      const cust = b.customerName || b.customer || '';
      const pay = b.pay || b.paymentMethod || '';
      const status = b.status || '';
      const items = Array.isArray(b._items) ? b._items : [];
      if (items.length) {
        items.forEach((it) => {
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          lineRows.push([
            billNo,
            date,
            table,
            cust,
            pay,
            status,
            it.name || 'Item',
            qty,
            price,
            Math.round(qty * price * 100) / 100,
            it.note || it.notes || '',
          ]);
        });
      } else {
        lineRows.push([
          billNo,
          date,
          table,
          cust,
          pay,
          status,
          lineItemsSummary(b) || 'Bill total',
          1,
          numOrBlank(b.amount != null ? b.amount : b.total) || 0,
          numOrBlank(b.amount != null ? b.amount : b.total) || 0,
          '',
        ]);
      }
    });

    try {
      const bytes = RSXlsxLite.buildXlsx([
        { name: 'Summary', cols: [28, 22], rows: summaryRows },
        {
          name: 'Bills',
          cols: [16, 18, 18, 14, 16, 14, 10, 28, 10, 10, 10, 10, 10, 16, 10, 10, 12, 12, 12, 12],
          rows: billRows,
        },
        {
          name: 'Line items',
          cols: [16, 18, 14, 16, 10, 10, 24, 8, 10, 10, 16],
          rows: lineRows,
        },
      ]);
      const fname = outlet + '-Bills-' + rangeLabel + '-' + exportStamp() + '.xlsx';
      RSXlsxLite.downloadXlsx(bytes, fname);
      toast(
        'Exported ' + list.length + ' bills · ' + rangeLabel.replace(/_/g, ' ') + ' · Excel',
        'fa-file-excel'
      );
      return true;
    } catch (e) {
      console.warn('[BillsHistory] xlsx export failed', e);
      toast('Excel export failed — try CSV', 'fa-circle-exclamation');
      return false;
    }
  }

  /**
   * Export bills as Excel-friendly CSV (UTF-8 BOM).
   * Respects current search / payment / status / date filters.
   */
  function exportBillsCsv() {
    const prog =
      global.RSProgress &&
      RSProgress.open({
        title: 'Exporting bills…',
        sub: 'Building CSV for the selected range',
        total: 0,
        unit: 'bills',
      });
    try {
      if (prog) prog.setIndeterminate('Preparing rows…');
      const result = _exportBillsCsvInner(prog);
      if (prog) prog.close();
      return result;
    } catch (e) {
      if (prog) prog.close();
      throw e;
    }
  }
  function _exportBillsCsvInner(prog) {
    const list = collectExportList();
    if (!list.length) {
      toast('No bills to export for this range', 'fa-circle-exclamation');
      return false;
    }
    if (prog) prog.update({ total: list.length, done: 0, unit: 'bills', label: 'Writing rows…' });

    const settings = global.RS_SETTINGS || {};
    const taxLabel = settings.set_tax_label || 'GST';
    const headers = [
      'Bill No',
      'Date (Excel)',
      'Date (Display)',
      'Table',
      'Item Count',
      'Line Items',
      'Customer',
      'Phone',
      'Subtotal',
      taxLabel,
      'Discount',
      'Total',
      'Payment',
      'Tenders',
      'Status',
      'Channel',
      'Station',
      'Shift',
      'Cashier',
      'Order Type',
    ];

    const rows = list.map((b, idx) => {
      const tenders = Array.isArray(b.tenders)
        ? b.tenders.map((t) => (t.method || '') + ':' + (Number(t.amount) || 0)).join('|')
        : '';
      const itemCount =
        Array.isArray(b._items) && b._items.length
          ? b._items.reduce((acc, i) => acc + (Number(i.qty) || 1), 0)
          : b.items != null
            ? b.items
            : '';
      if (prog && (idx % 25 === 0 || idx === list.length - 1)) prog.update({ done: idx + 1 });
      return [
        b.no || b.orderId || b.id || '',
        formatBillTimeIsoExcel(b),
        formatBillTime(b),
        b.table || '',
        itemCount,
        lineItemsSummary(b),
        b.customerName || b.customer || '',
        b.customerPhone || '',
        b.subtotal != null ? b.subtotal : '',
        b.gst != null ? b.gst : '',
        b.discount != null ? b.discount : b.disc != null ? b.disc : '',
        b.amount != null ? b.amount : b.total != null ? b.total : '',
        b.pay || b.paymentMethod || '',
        tenders,
        b.status || '',
        b.channel || b.channelCode || '',
        b.stationLabel || b.stationId || '',
        b.shiftId || '',
        b.cashier || '',
        b.orderType || '',
      ]
        .map(csvEscape)
        .join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const fname = exportOutletSlug() + '-Bills-' + exportRangeLabel() + '-' + exportStamp() + '.csv';

    try {
      if (global.RS && typeof RS.downloadFile === 'function') {
        RS.downloadFile(csv, 'text/csv;charset=utf-8;', fname);
      } else {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      toast('Exported ' + list.length + ' bills · CSV', 'fa-file-csv');
      return true;
    } catch (e) {
      console.warn('[BillsHistory] export failed', e);
      toast('Export failed — try again', 'fa-circle-exclamation');
      return false;
    }
  }

  function wireExportButton() {
    const btn = document.getElementById('btn-export-bills');
    if (btn && btn.dataset.rsExportBound !== '1') {
      btn.dataset.rsExportBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        exportBillsXlsx();
      });
    }
    const csvBtn = document.getElementById('btn-export-bills-csv');
    if (csvBtn && csvBtn.dataset.rsExportBound !== '1') {
      csvBtn.dataset.rsExportBound = '1';
      csvBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        exportBillsCsv();
      });
    }
  }

  function rangeDisplayLabel() {
    switch (billsDateRange) {
      case 'yesterday':
        return 'Yesterday';
      case '7d':
        return 'Last 7 days';
      case 'all':
        return 'All history';
      case 'custom': {
        const a = billsCustomFrom || '…';
        const b = billsCustomTo || '…';
        return a + ' → ' + b;
      }
      default:
        return 'Today';
    }
  }

  function reportTitleForRange() {
    switch (billsDateRange) {
      case 'yesterday':
        return 'YESTERDAY SALES SUMMARY';
      case '7d':
        return '7-DAY SALES SUMMARY';
      case 'all':
        return 'FULL HISTORY SALES SUMMARY';
      case 'custom':
        return 'CUSTOM RANGE SALES SUMMARY';
      default:
        return 'DAILY SALES SUMMARY';
    }
  }

  function formatShortDate(d) {
    if (!d || Number.isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (_) {
      return d.toLocaleDateString();
    }
  }

  function periodFromBills(list) {
    let min = null;
    let max = null;
    (list || []).forEach((b) => {
      const d = parseBillDate(b);
      if (!d) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
    if (min && max) {
      const a = formatShortDate(min);
      const b = formatShortDate(max);
      return a === b ? a : a + ' – ' + b;
    }
    return rangeDisplayLabel();
  }

  function money(n) {
    return rs(Number(n) || 0);
  }

  /**
   * 10/10 printable / PDF sales report for the active Bills range + filters.
   * A4 layout with clean margins (no thermal-on-A4 empty page look).
   */
  function printSalesReport() {
    const list = collectExportList();
    if (!list.length) {
      toast('No bills in this range to report', 'fa-circle-exclamation');
      return false;
    }

    const settings = global.RS_SETTINGS || {};
    const sess = global.RS_API && RS_API.session ? RS_API.session() : null;
    let outletName =
      settings.set_restaurant_name ||
      settings.set_outlet_name ||
      (sess && (sess.tenant_name || sess.business_name)) ||
      'RestroSuite Outlet';
    if (!outletName || /outlet name/i.test(outletName)) outletName = 'RestroSuite Outlet';

    const taxLabel = settings.set_tax_label || 'GST';
    const taxPct =
      settings.set_tax_rate != null && settings.set_tax_rate !== ''
        ? Number(settings.set_tax_rate)
        : settings.set_gst_rate != null
          ? Number(settings.set_gst_rate)
          : null;

    const paidBills = list.filter((b) => String(b.status || 'paid').toLowerCase() === 'paid');
    const refundBills = list.filter((b) => {
      const st = String(b.status || '').toLowerCase();
      return st === 'refunded' || st === 'voided' || st === 'void';
    });
    const totalRevenue = paidBills.reduce(
      (sum, b) => sum + (Number(b.amount) || Number(b.total) || 0),
      0
    );
    const refundTotal = refundBills.reduce(
      (sum, b) => sum + (Number(b.amount) || Number(b.total) || 0),
      0
    );
    const totalOrders = paidBills.length;
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const gstFromBills = paidBills.reduce((sum, b) => sum + (Number(b.gst) || 0), 0);
    const divisor = taxPct && taxPct > 0 ? 1 + taxPct / 100 : 1.05;
    const gstCollected =
      gstFromBills > 0
        ? Math.round(gstFromBills * 100) / 100
        : Math.round((totalRevenue - totalRevenue / divisor) * 100) / 100;
    const netTaxableSales = Math.round((totalRevenue - gstCollected) * 100) / 100;
    const taxPctLabel =
      taxPct != null && Number.isFinite(taxPct) ? String(taxPct) + '%' : gstFromBills > 0 ? 'as billed' : 'est. 5%';

    const paymentMethods = {};
    paidBills.forEach((b) => {
      if (b.tenders && Array.isArray(b.tenders) && b.tenders.length) {
        b.tenders.forEach((t) => {
          const method = t.method || 'Cash';
          paymentMethods[method] = (paymentMethods[method] || 0) + Number(t.amount || 0);
        });
      } else {
        const method = b.pay || b.paymentMethod || 'Cash';
        paymentMethods[method] =
          (paymentMethods[method] || 0) + (Number(b.amount) || Number(b.total) || 0);
      }
    });

    const payRows = Object.keys(paymentMethods)
      .sort()
      .map(
        (method) =>
          `<tr><td>${_e(method)}</td><td class="num">${_e(money(paymentMethods[method]))}</td></tr>`
      )
      .join('');

    // Compact bill list (latest first-ish — keep list order)
    const billListRows = list
      .slice(0, 25)
      .map((b) => {
        const st = String(b.status || 'paid');
        return `<tr>
          <td>${_e(b.no || b.orderId || b.id || '—')}</td>
          <td>${_e(formatBillTime(b) || '—')}</td>
          <td>${_e(b.pay || b.paymentMethod || '—')}</td>
          <td class="num">${_e(money(b.amount != null ? b.amount : b.total))}</td>
          <td>${_e(st)}</td>
        </tr>`;
      })
      .join('');
    const moreNote =
      list.length > 25
        ? `<p class="note">Showing 25 of ${list.length} bills. Use Export Excel for the full list.</p>`
        : '';

    const now = new Date();
    const printedAt = now.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const period = periodFromBills(list);
    const rangeLabel = rangeDisplayLabel();
    const title = reportTitleForRange();
    const docTitle = 'Sales Report · ' + rangeLabel + ' · ' + outletName;

    const staff =
      (sess && (sess.display_name || sess.username || sess.email)) ||
      sessionStorage.getItem('logged_in_user') ||
      'Staff';

    const html = `
<div class="rs-sales-report">
  <header class="sr-head">
    <div class="sr-brand">
      <div class="sr-outlet">${_e(outletName)}</div>
      <div class="sr-title">${_e(title)}</div>
    </div>
    <div class="sr-meta">
      <div><span>Period</span><strong>${_e(period)}</strong></div>
      <div><span>Filter</span><strong>${_e(rangeLabel)}</strong></div>
      <div><span>Printed</span><strong>${_e(printedAt)}</strong></div>
      <div><span>By</span><strong>${_e(String(staff))}</strong></div>
    </div>
  </header>

  <section class="sr-kpis">
    <div class="kpi"><div class="k-l">Paid bills</div><div class="k-v">${totalOrders}</div></div>
    <div class="kpi"><div class="k-l">Gross sales</div><div class="k-v">${_e(money(totalRevenue))}</div></div>
    <div class="kpi"><div class="k-l">Avg order</div><div class="k-v">${_e(money(aov))}</div></div>
    <div class="kpi"><div class="k-l">Refunds</div><div class="k-v">${refundBills.length} · ${_e(money(refundTotal))}</div></div>
  </section>

  <div class="sr-grid">
    <section class="sr-card">
      <h3>Payment breakdown</h3>
      <table class="sr-table">
        <thead><tr><th>Method</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${payRows || '<tr><td colspan="2">No paid tenders</td></tr>'}
        </tbody>
        <tfoot><tr><td>Total paid</td><td class="num">${_e(money(totalRevenue))}</td></tr></tfoot>
      </table>
    </section>
    <section class="sr-card">
      <h3>Tax &amp; totals</h3>
      <table class="sr-table">
        <tbody>
          <tr><td>Net taxable sales</td><td class="num">${_e(money(netTaxableSales))}</td></tr>
          <tr><td>${_e(taxLabel)} (${_e(taxPctLabel)})</td><td class="num">${_e(money(gstCollected))}</td></tr>
          <tr><td>Refunds / voids</td><td class="num">${_e(money(refundTotal))}</td></tr>
          <tr class="em"><td>Gross revenue (paid)</td><td class="num">${_e(money(totalRevenue))}</td></tr>
          <tr><td>Net after refunds</td><td class="num">${_e(money(totalRevenue - refundTotal))}</td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <section class="sr-card">
    <h3>Bills in this report (${list.length})</h3>
    <table class="sr-table sr-bills">
      <thead>
        <tr>
          <th>Bill No.</th>
          <th>Time</th>
          <th>Pay</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${billListRows}</tbody>
    </table>
    ${moreNote}
  </section>

  <footer class="sr-foot">
    <div>RestroSuite · Sales report · ${_e(rangeLabel)}</div>
    <div>*** End of report ***</div>
  </footer>
</div>`;

    const style = `
      @page { size: A4; margin: 14mm 12mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0;
        color: #111;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        font-size: 12px;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .rs-sales-report { max-width: 720px; margin: 0 auto; }
      .sr-head {
        display: flex; justify-content: space-between; gap: 16px;
        border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 14px;
      }
      .sr-outlet { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
      .sr-title { font-size: 11px; font-weight: 700; color: #555; margin-top: 4px; letter-spacing: 0.06em; }
      .sr-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; font-size: 11px; min-width: 220px; }
      .sr-meta span { display: block; color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
      .sr-meta strong { font-weight: 700; }
      .sr-kpis {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;
      }
      .kpi {
        border: 1px solid #ddd; border-radius: 8px; padding: 10px 10px 8px;
        background: #fafafa;
      }
      .k-l { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
      .k-v { font-size: 15px; font-weight: 800; margin-top: 4px; }
      .sr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
      .sr-card {
        border: 1px solid #e5e5e5; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px;
      }
      .sr-card h3 {
        margin: 0 0 8px; font-size: 12px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.05em; color: #333;
      }
      .sr-table { width: 100%; border-collapse: collapse; }
      .sr-table th, .sr-table td {
        text-align: left; padding: 5px 4px; border-bottom: 1px solid #eee; font-size: 11.5px;
      }
      .sr-table th { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
      .sr-table .num, .sr-table td.num, .sr-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .sr-table tfoot td { font-weight: 800; border-top: 1px solid #ccc; border-bottom: 0; }
      .sr-table tr.em td { font-weight: 800; font-size: 13px; border-top: 1px dashed #bbb; }
      .sr-bills td { font-size: 11px; }
      .note { margin: 8px 0 0; font-size: 10.5px; color: #777; }
      .sr-foot {
        margin-top: 16px; padding-top: 10px; border-top: 1px dashed #bbb;
        display: flex; justify-content: space-between; font-size: 10px; color: #777;
      }
      @media print {
        body { padding: 0; }
        .sr-card, .kpi { break-inside: avoid; }
      }
      @media screen {
        body { padding: 18px; background: #f3f3f3; }
        .rs-sales-report {
          background: #fff; padding: 22px 24px; border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,.08);
        }
      }
      @media (max-width: 640px) {
        .sr-kpis, .sr-grid, .sr-head { grid-template-columns: 1fr 1fr; display: grid; }
        .sr-head { display: block; }
        .sr-meta { margin-top: 10px; }
      }
    `;

    const fullHtml =
      '<!doctype html><html><head><meta charset="utf-8"><title>' +
      _e(docTitle) +
      '</title><style>' +
      style +
      '</style></head><body>' +
      html +
      '</body></html>';

    try {
      // Prefer iframe with our A4 styles (RSPrint forces thermal width)
      const f = document.createElement('iframe');
      f.setAttribute('title', docTitle);
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      const w = f.contentWindow;
      const d = w.document;
      d.open();
      d.write(fullHtml);
      d.close();
      const trigger = () => {
        try {
          w.focus();
          w.print();
        } catch (e) {
          console.warn('[BillsHistory] print failed', e);
        }
        setTimeout(() => {
          try {
            f.remove();
          } catch (_) {}
        }, 1500);
      };
      // Wait for layout
      setTimeout(trigger, 250);
      toast('Opening sales report · ' + rangeLabel, 'fa-print');
      return true;
    } catch (e) {
      console.warn('[BillsHistory] printSalesReport failed', e);
      toast('Could not open print report', 'fa-circle-exclamation');
      return false;
    }
  }

  function wirePrintReportButton() {
    const btn = document.getElementById('btn-print-day-report');
    if (!btn || btn.dataset.rsPrintBound === '1') return;
    btn.dataset.rsPrintBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      printSalesReport();
    });
  }

  /** Filter button focuses the inline Payment / Status selects (no dead control). */
  function wireFilterButton() {
    const btn = document.getElementById('btn-bills-filter');
    if (!btn || btn.dataset.rsFilterBound === '1') return;
    btn.dataset.rsFilterBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pay = document.getElementById('bills-pay-filter');
      const status = document.getElementById('bills-status-filter');
      const bar = document.getElementById('bills-filter-hint');
      if (bar) {
        bar.hidden = false;
        bar.setAttribute('aria-hidden', 'false');
      }
      [pay, status].forEach((el) => {
        if (!el) return;
        el.classList.add('bills-filter-flash');
        setTimeout(() => el.classList.remove('bills-filter-flash'), 1600);
      });
      if (pay) {
        try {
          pay.focus();
        } catch (_) {}
      }
      toast('Use date chips + Payment / Status filters', 'fa-filter');
    });
  }

  function statusPillHtml(b) {
    const st = String((b && b.status) || '').toLowerCase();
    if (st === 'paid') return '<span class="pill pill-green" style="padding:3px 9px">Paid</span>';
    if (st === 'refunded' || st === 'voided' || st === 'void')
      return '<span class="pill pill-red" style="padding:3px 9px">Refunded</span>';
    return `<span class="pill" style="padding:3px 9px">${_e(b.status || '—')}</span>`;
  }

  function closeAllBillMoreMenus(except) {
    document.querySelectorAll('.bills-more-menu').forEach((menu) => {
      if (except && menu === except) return;
      menu.hidden = true;
    });
    document.querySelectorAll('.bills-more.is-open').forEach((wrap) => {
      if (except && wrap.contains(except)) return;
      wrap.classList.remove('is-open');
    });
  }

  function paintBillsTable(filtered) {
    const body = $('#bills-table-body');
    if (!body) return;

    if (!filtered.length) {
      const q = ($('#bills-search') && $('#bills-search').value) || '';
      const hasFilter =
        q.trim() ||
        (($('#bills-pay-filter') && $('#bills-pay-filter').value) || 'All') !== 'All' ||
        (($('#bills-status-filter') && $('#bills-status-filter').value) || 'All') !== 'All' ||
        (billsDateRange && billsDateRange !== 'all');
      const emptyTitle =
        hasFilter
          ? 'No bills match your filters'
          : billsDateRange === 'today'
            ? 'No bills yet today'
            : 'No bills in this range';
      const emptyHint = hasFilter
        ? 'Try another date chip, clear search, or set Payment / Status to All.'
        : 'Completed sales from POS appear here for reprint, export, and reports.';
      body.innerHTML = `<tr class="bills-empty-row"><td colspan="9" style="padding:0;border:none">
        <div class="sr-empty" style="padding:40px 20px">
          <i class="fa-solid fa-file-invoice-dollar" style="font-size:24px;opacity:.4;display:block;margin-bottom:8px"></i>
          <div style="font-weight:700;color:var(--text);margin-bottom:4px">${emptyTitle}</div>
          <div style="color:var(--text-soft);font-size:13px;max-width:380px;margin:0 auto">${emptyHint}</div>
        </div>
      </td></tr>`;
      return;
    }

    body.innerHTML = filtered
      .map((b) => {
        const cust = b.customerName || b.customer || '';
        const phone = b.customerPhone || '';
        const custHtml = cust
          ? `<div class="bc-name">${_e(cust)}</div>${phone ? `<div class="bc-phone">${_e(phone)}</div>` : ''}`
          : phone
            ? `<div class="bc-phone">${_e(phone)}</div>`
            : `<span class="bc-empty">—</span>`;
        const refunded = String(b.status || '').toLowerCase() === 'refunded';
        return `
      <tr data-bill-no="${_e(b.no || b.orderId || b.id || '')}">
        <td><b>${_e(b.no || b.orderId || b.id || '-')}</b></td>
        <td class="td-time" title="${_e(formatBillTimeIsoExcel(b) || '')}">${_e(formatBillTime(b) || '-')}</td>
        <td>${_e(b.table || '-')}</td>
        <td class="td-cust">${custHtml}</td>
        <td>${_e(b.items)}</td>
        <td><span class="pill ${payPill[b.pay] || ''}" style="padding:3px 9px">${_e(b.pay || '—')}</span></td>
        <td class="td-strong">${rs(b.amount)}</td>
        <td>${statusPillHtml(b)}</td>
        <td>
          <div class="row-actions bills-row-actions">
            <button type="button" class="icon-act go" title="Reprint preview" aria-label="Reprint bill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-print"></i></button>
            <button type="button" class="icon-act thermal-act" title="Thermal print" aria-label="Thermal print bill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-receipt"></i></button>
            <button type="button" class="icon-act rebill-act" title="Rebill / load into POS" aria-label="Rebill ${_e(b.no || b.orderId || '')}"><i class="fa-solid fa-rotate"></i></button>
            <button type="button" class="icon-act wa-act" title="Share on WhatsApp" aria-label="Share bill ${_e(b.no || b.orderId || '')}"><i class="fa-brands fa-whatsapp"></i></button>
            <div class="bills-more">
              <button type="button" class="icon-act more-act" title="More actions" aria-label="More actions" aria-haspopup="true" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button>
              <div class="bills-more-menu" hidden role="menu">
                <button type="button" class="bills-more-item refund-act" role="menuitem" ${refunded ? 'disabled' : ''}><i class="fa-solid fa-ban"></i> Void / refund</button>
                <button type="button" class="bills-more-item del-act danger" role="menuitem"><i class="fa-solid fa-trash-can"></i> Delete bill</button>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
      })
      .join('');

    const visibleBills = filtered;
    if (body._rsBillActionHandler) body.removeEventListener('click', body._rsBillActionHandler, true);
    body._rsBillActionHandler = (e) => {
      const moreBtn = e.target.closest('.more-act');
      if (moreBtn && body.contains(moreBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const wrap = moreBtn.closest('.bills-more');
        const menu = wrap && wrap.querySelector('.bills-more-menu');
        if (!menu) return;
        const open = menu.hidden;
        closeAllBillMoreMenus();
        if (open) {
          menu.hidden = false;
          wrap.classList.add('is-open');
          moreBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const menuItem = e.target.closest('.bills-more-item');
      const btn = menuItem || e.target.closest('.icon-act');
      if (!btn || !body.contains(btn) || btn.disabled) return;
      if (btn.classList.contains('more-act')) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const row = btn.closest('tr');
      const bill = visibleBills[[...body.querySelectorAll('tr')].indexOf(row)];
      if (!bill) return;
      const live = getBills().find(
        (x) => x === bill || String(x.no || x.orderId) === String(bill.no || bill.orderId)
      );
      const target = live || bill;
      closeAllBillMoreMenus();
      if (btn.classList.contains('go')) return showBillReceipt(target);
      if (btn.classList.contains('thermal-act')) return printBillThermal(target);
      if (btn.classList.contains('rebill-act')) return rebillToPos(target);
      if (btn.classList.contains('refund-act')) return markBillRefunded(target);
      if (btn.classList.contains('del-act')) return deleteBill(target);
      if (btn.classList.contains('wa-act')) return shareBillReceipt(target);
      return shareBillReceipt(target);
    };
    body.addEventListener('click', body._rsBillActionHandler, true);

    if (!document._rsBillsMoreDocBound) {
      document._rsBillsMoreDocBound = true;
      document.addEventListener('click', (ev) => {
        if (!ev.target.closest('.bills-more')) closeAllBillMoreMenus();
      });
    }
  }

  function renderBills() {
    const BILLS = getBills();
    // Stats always match the active date range (before search/pay/status filters)
    const ranged = BILLS.filter(billInDateRange);
    const paidBills = ranged.filter((b) => String(b.status || '').toLowerCase() === 'paid');
    const totalSales = paidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const countInRange = ranged.length;
    const aov = paidBills.length > 0 ? Math.round(totalSales / paidBills.length) : 0;
    const refunds = ranged.filter((b) => String(b.status || '').toLowerCase() === 'refunded').length;
    const labels = dateRangeLabels();

    const salesEl = document.getElementById('bills-stat-sales');
    if (salesEl) salesEl.textContent = rs(totalSales);
    const countEl = document.getElementById('bills-stat-count');
    if (countEl) countEl.textContent = countInRange;
    const aovEl = document.getElementById('bills-stat-aov');
    if (aovEl) aovEl.textContent = rs(aov);
    const refundsEl = document.getElementById('bills-stat-refunds');
    if (refundsEl) refundsEl.textContent = refunds;
    const salesLbl = document.getElementById('bills-stat-sales-label');
    if (salesLbl) salesLbl.textContent = labels.sales;
    const countLbl = document.getElementById('bills-stat-count-label');
    if (countLbl) countLbl.textContent = labels.count;
    const refundsLbl = document.getElementById('bills-stat-refunds-label');
    if (refundsLbl) refundsLbl.textContent = labels.refunds;

    syncDateChipsUi();

    const q = ($('#bills-search')?.value || '').toLowerCase();
    const payFilter = $('#bills-pay-filter')?.value || 'All';
    const statusFilter = $('#bills-status-filter')?.value || 'All';

    const localFiltered = filterBills(BILLS, q, payFilter, statusFilter);
    const merged = mergeBillsForDisplay(localFiltered, _serverHits, q, payFilter, statusFilter);
    paintBillsTable(merged);

    const meta = document.getElementById('bills-result-meta');
    if (meta) {
      const n = merged.length;
      const extraFilter =
        (q && q.trim()) || payFilter !== 'All' || statusFilter !== 'All';
      meta.textContent = extraFilter
        ? `${n} of ${countInRange}`
        : n
          ? `${n} bill${n === 1 ? '' : 's'}`
          : '';
      meta.hidden = !n && !extraFilter;
    }

    const gen = ++_searchGen;
    if (String(q || '').trim().length >= 2) {
      searchBillsServer(q, 50).then((rows) => {
        if (gen !== _searchGen) return;
        if (!rows) return;
        _serverHits = rows;
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

  function syncDateChipsUi() {
    const chips = document.getElementById('bills-date-chips');
    if (chips) {
      chips.querySelectorAll('[data-range]').forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-range') === billsDateRange);
      });
    }
    const custom = document.getElementById('bills-custom-range');
    if (custom) custom.hidden = billsDateRange !== 'custom';
    const from = document.getElementById('bills-date-from');
    const to = document.getElementById('bills-date-to');
    if (from && billsCustomFrom) from.value = billsCustomFrom;
    if (to && billsCustomTo) to.value = billsCustomTo;
  }

  function wireDateChips() {
    const chips = document.getElementById('bills-date-chips');
    if (chips && !chips.dataset.rsBound) {
      chips.dataset.rsBound = '1';
      chips.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-range]');
        if (!btn || !chips.contains(btn)) return;
        billsDateRange = btn.getAttribute('data-range') || 'today';
        try {
          localStorage.setItem('rs_bills_date_range', billsDateRange);
        } catch (_) {}
        if (billsDateRange === 'custom') {
          syncDateChipsUi();
          const from = document.getElementById('bills-date-from');
          if (from) {
            try {
              from.focus();
            } catch (_) {}
          }
          return;
        }
        renderBills();
      });
    }
    const apply = document.getElementById('bills-date-apply');
    if (apply && !apply.dataset.rsBound) {
      apply.dataset.rsBound = '1';
      apply.addEventListener('click', () => {
        const from = document.getElementById('bills-date-from');
        const to = document.getElementById('bills-date-to');
        billsCustomFrom = (from && from.value) || '';
        billsCustomTo = (to && to.value) || '';
        billsDateRange = 'custom';
        try {
          localStorage.setItem('rs_bills_date_range', 'custom');
          localStorage.setItem('rs_bills_date_from', billsCustomFrom);
          localStorage.setItem('rs_bills_date_to', billsCustomTo);
        } catch (_) {}
        if (!billsCustomFrom && !billsCustomTo) {
          toast('Pick a from and/or to date', 'fa-calendar');
          return;
        }
        renderBills();
      });
    }
  }

  function wireFilterHint() {
    const bar = document.getElementById('bills-filter-hint');
    const dismiss = document.getElementById('bills-hint-dismiss');
    let dismissed = false;
    try {
      dismissed = localStorage.getItem('rs_bills_hint_dismissed') === '1';
    } catch (_) {}
    if (bar && !dismissed) {
      bar.hidden = false;
      bar.setAttribute('aria-hidden', 'false');
    }
    if (dismiss && !dismiss.dataset.rsBound) {
      dismiss.dataset.rsBound = '1';
      dismiss.addEventListener('click', () => {
        if (bar) {
          bar.hidden = true;
          bar.setAttribute('aria-hidden', 'true');
        }
        try {
          localStorage.setItem('rs_bills_hint_dismissed', '1');
        } catch (_) {}
      });
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
    wireDateChips();
    wireFilterHint();
    renderBills();
    wireExportButton();
    wirePrintReportButton();
    wireFilterButton();
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
    getFilteredBills,
    billInDateRange,
    parseBillDate,
    searchBillsServer,
    normalizeServerBill,
    showRefundModal,
    showDeleteConfirm,
    exportBillsCsv,
    exportBillsXlsx,
    printSalesReport,
    formatBillTime,
    wireExportButton,
    wirePrintReportButton,
    wireFilterButton,
    getDateRange: () => billsDateRange,
    rangeDisplayLabel,
  };

  global.RSBillsHistory = api;

  // Attach thin helpers on RS when ready
  function attachToRS() {
    if (!global.RS) return;
    global.RS.renderBills = renderBills;
    global.RS.receiptPayloadFromBill = receiptPayloadFromBill;
    global.RS.exportBillsCsv = exportBillsCsv;
    global.RS.exportBillsXlsx = exportBillsXlsx;
    global.RS.printSalesReport = printSalesReport;
  }
  if (global.RS) attachToRS();
  document.addEventListener('rs:ready', attachToRS);
  // Late-bind export if bills tab mounts after ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        wireExportButton();
        wireFilterButton();
      } catch (_) {}
    });
  } else {
    try {
      wireExportButton();
      wireFilterButton();
    } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
