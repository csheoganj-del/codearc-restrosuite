/* ============================================================
   RestroSuite — Shared table order amend (guest QR + waiter)
   Prep locks · notify other party · covers
   ============================================================ */
(function (global) {
  'use strict';

  const RSAmend = (global.RSAmend = global.RSAmend || {});

  function toast(msg, icon) {
    if (global.RS && typeof RS.toast === 'function') {RS.toast(msg, icon);}
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function rs(n) {
    if (global.RS && typeof RS.rs === 'function') {return RS.rs(n);}
    return '₹' + (Number(n) || 0).toLocaleString('en-IN');
  }

  function isAmendableStatus(status) {
    const st = String(status || '').trim().toLowerCase();
    return (
      st === 'pending review' ||
      st === 'pending' ||
      st === 'new' ||
      st === 'hold' ||
      st === 'draft' ||
      st === ''
    );
  }

  function lockReason(status) {
    const st = String(status || '').toLowerCase();
    if (/ready|served|completed|paid|settled/.test(st)) {
      return 'Order already prepared / completed — cannot delete';
    }
    if (/prepar|accepted|cook|kitchen|in.?prep/.test(st)) {
      return 'In kitchen preparation — ask staff to void; cannot delete from QR';
    }
    if (/cancel|reject/.test(st)) {return 'Order was cancelled';}
    if (/picked|deliver/.test(st)) {return 'Order already out for delivery';}
    return 'This order can no longer be changed';
  }

  RSAmend.isAmendableStatus = isAmendableStatus;
  RSAmend.lockReason = lockReason;
  RSAmend.canAmendOrderLine = function (order, line) {
    if (global.RS10 && typeof RS10.canAmendOrderLine === 'function') {
      return RS10.canAmendOrderLine(order, line);
    }
    if (!isAmendableStatus(order && order.status)) {
      return { ok: false, reason: lockReason(order && order.status) };
    }
    if (line && line.fired && /prepar|ready/.test(String(line.status || '').toLowerCase())) {
      return { ok: false, reason: 'This item is already in prep' };
    }
    return { ok: true };
  };

  /**
   * Public guest/waiter amend via tenant-public edge function.
   */
  async function amendViaPublicApi(opts) {
    const o = opts || {};
    if (global.__configReady) {
      try {
        await global.__configReady;
      } catch (_) {}
    }
    const su = global.__SUPABASE_URL__;
    const sk = global.__SUPABASE_ANON_KEY__;
    const fn =
      (global.CONFIG && global.CONFIG.functions && global.CONFIG.functions.tenantPublic) ||
      (su ? su + '/functions/v1/tenant-public' : '');
    if (!fn) {throw new Error('Config missing');}
    const res = await fetch(fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: sk || '',
        Authorization: 'Bearer ' + (sk || ''),
      },
      body: JSON.stringify({
        action: 'amend_order',
        tenant_slug: o.tenantSlug || o.slug,
        session_token: o.sessionToken || o.token,
        table: o.table,
        order_id: o.orderId,
        items: o.items,
        covers: o.covers,
        by: o.by || 'guest',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const err = new Error(data.error || 'Amend failed');
      err.code = data.reason || res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }
  RSAmend.amendViaPublicApi = amendViaPublicApi;

  /**
   * Staff amend of pending_orders via RS_DB (dashboard).
   */
  async function amendViaStaffDb(orderRow, nextItems, meta) {
    const m = meta || {};
    if (!orderRow || !orderRow.id) {throw new Error('No order');}
    const check = RSAmend.canAmendOrderLine(orderRow);
    if (!check.ok) {throw new Error(check.reason);}
    const items = (nextItems || []).map((it) => ({
      id: it.id,
      name: it.name,
      qty: Math.max(1, Number(it.qty) || 1),
      price: Number(it.price) || 0,
      note: it.note || it.notes || '',
    }));
    if (!items.length) {throw new Error('Add at least one item');}
    const total = items.reduce((a, i) => a + i.price * i.qty, 0);
    const next = Object.assign({}, orderRow, {
      items,
      total,
      subtotal: total,
      covers: m.covers != null ? m.covers : orderRow.covers,
      pax: m.covers != null ? m.covers : orderRow.pax,
      amendedAt: new Date().toISOString(),
      amendedBy: m.by || 'staff',
    });
    if (global.RS_DB && RS_DB.put) {
      await RS_DB.put('pending_orders', next.id, next);
      if (global.RS_SYNC && RS_SYNC.syncPendingOrders) {
        try {
          await RS_SYNC.syncPendingOrders({ forceCloud: true });
        } catch (_) {}
      }
    }
    // Local notification for other devices
    try {
      if (global.RS_DB && RS_DB.put) {
        const nid = 'amd_' + Date.now();
        await RS_DB.put('notifications', nid, {
          id: nid,
          title: 'Order amended · ' + (next.tableNumber || next.table || ''),
          message:
            (m.by || 'Staff') +
            ' updated order · ' +
            items.length +
            ' lines · ' +
            rs(total),
          type: 'order_amended',
          isRead: false,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (_) {}
    try {
      document.dispatchEvent(
        new CustomEvent('rs:order-amended', {
          detail: {
            order: next,
            by: m.by || 'staff',
            table: next.tableNumber || next.table,
          },
        })
      );
    } catch (_) {}
    if (global.RS10 && typeof RS10.notifyOrderAmendment === 'function') {
      RS10.notifyOrderAmendment({
        by: m.by || 'staff',
        table: next.tableNumber || next.table,
      });
    } else {
      toast('Order updated · kitchen notified', 'fa-bell');
    }
    try {
      if (global.AndroidInterface && typeof AndroidInterface.playSound === 'function') {
        AndroidInterface.playSound('alert');
      }
    } catch (_) {}
    return next;
  }
  RSAmend.amendViaStaffDb = amendViaStaffDb;

  /** Listen for amendments and chime + toast on dashboard */
  function installDashboardListener() {
    if (document.documentElement.dataset.rsAmendDash === '1') {return;}
    document.documentElement.dataset.rsAmendDash = '1';
    document.addEventListener('rs:order-amended', (ev) => {
      const d = (ev && ev.detail) || {};
      toast(
        'Order changed' + (d.table ? ' · ' + d.table : '') + (d.by ? ' · by ' + d.by : ''),
        'fa-bell'
      );
      try {
        if (global.RSOps && typeof RSOps.playFloorChime === 'function') {RSOps.playFloorChime();}
      } catch (_) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installDashboardListener);
  } else {
    installDashboardListener();
  }

  global.RSAmend = RSAmend;
})(typeof window !== 'undefined' ? window : globalThis);
