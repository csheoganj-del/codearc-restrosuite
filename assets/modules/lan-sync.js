/**
 * RestroSuite LAN kitchen sync client
 * -----------------------------------
 * When internet is down but devices share Wi‑Fi with the Desktop POS hub:
 *  - POS pushes pending_orders to /api/lan/push
 *  - KDS tablets subscribe to /api/lan/stream and merge into local RS_DB
 *
 * Does NOT replace cloud sync. Cloud still wins multi-site / after internet returns.
 * Status merge prefers Ready over Pending so reconnect does not re-open finished KOTs.
 */
(function (global) {
  'use strict';

  const HUB_KEY = 'rs_lan_hub_url_v1';
  let es = null;
  let lastPushAt = 0;
  const seenKeys = {};

  function toast(msg, icon) {
    try {
      if (global.RS && RS.toast) { RS.toast(msg, icon); }
    } catch (_) {}
  }

  function tenantId() {
    try {
      const s = global.RS_API && RS_API.session && RS_API.session();
      return String((s && (s.tenant_id || s.tenant_slug)) || sessionStorage.getItem('tenant_id') || 'local');
    } catch (_) {
      return 'local';
    }
  }

  function statusRank(s) {
    const x = String(s || '').toLowerCase();
    if (/cancel|void|rejected/.test(x)) { return 90; }
    if (/ready|served|complete|done|closed|settled|paid/.test(x)) { return 80; }
    if (/prepar/.test(x)) { return 50; }
    if (/accept/.test(x)) { return 40; }
    if (/pending|review|new/.test(x)) { return 20; }
    return 10;
  }

  function orderKey(row) {
    return String((row && (row.orderId || row.order_id || row.id)) || '');
  }

  function defaultHubCandidates() {
    const list = [];
    try {
      const origin = location.origin || '';
      if (/^https?:\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(origin)) {
        list.push(origin.replace(/\/$/, ''));
      }
    } catch (_) {}
    try {
      const saved = localStorage.getItem(HUB_KEY);
      if (saved) { list.unshift(String(saved).replace(/\/$/, '')); }
    } catch (_) {}
    // Common desktop default
    list.push('http://127.0.0.1:8001');
    return list.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  }

  async function probeHub(base) {
    try {
      const r = await fetch(base + '/api/lan/info', { cache: 'no-store' });
      if (!r.ok) { return null; }
      const j = await r.json();
      if (j && j.enabled) { return { base: base, info: j }; }
    } catch (_) {}
    return null;
  }

  async function findHub() {
    const cands = defaultHubCandidates();
    for (let i = 0; i < cands.length; i++) {
      const hit = await probeHub(cands[i]);
      if (hit) {
        try { localStorage.setItem(HUB_KEY, hit.base); } catch (_) {}
        return hit;
      }
    }
    return null;
  }

  function mergeIntoLocal(row) {
    if (!row || !global.RS_DB) { return Promise.resolve(); }
    const key = orderKey(row);
    if (!key) { return Promise.resolve(); }
    return RS_DB.listLocal
      ? RS_DB.listLocal('pending_orders').then(function (rows) {
          rows = rows || [];
          const idx = rows.findIndex(function (r) { return orderKey(r) === key || String(r.id) === String(row.id); });
          const prev = idx >= 0 ? rows[idx] : null;
          let merged;
          if (!prev) {
            merged = Object.assign({}, row, { id: row.id != null ? row.id : key });
            rows.push(merged);
          } else {
            const pr = statusRank(prev.status);
            const nr = statusRank(row.status);
            if (nr > pr) { merged = Object.assign({}, prev, row, { status: row.status }); }
            else if (nr < pr) { merged = Object.assign({}, row, prev, { status: prev.status }); }
            else { merged = Object.assign({}, prev, row, { status: prev.status }); }
            rows[idx] = merged;
          }
          if (typeof RS_DB.writeLocal === 'function') { return RS_DB.writeLocal('pending_orders', rows); }
          return null;
        }).then(function () {
          try {
            if (global.RS_SYNC && RS_SYNC.syncPendingOrders) { RS_SYNC.syncPendingOrders({ forceCloud: false }); }
          } catch (_) {}
        })
      : Promise.resolve();
  }

  async function pushRow(row) {
    if (!row) { return; }
    const hub = await findHub();
    if (!hub) { return; }
    try {
      await fetch(hub.base + '/api/lan/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenantId(), row: row }),
      });
      lastPushAt = Date.now();
      paintLanChip(true, hub);
    } catch (_) {
      paintLanChip(false, null);
    }
  }

  function paintLanChip(ok, hub) {
    let chip = document.getElementById('rs-lan-hub-chip');
    if (!chip) {
      const right = document.getElementById('tb-right');
      if (!right) { return; }
      chip = document.createElement('button');
      chip.type = 'button';
      chip.id = 'rs-lan-hub-chip';
      chip.style.cssText =
        'display:none;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid var(--stroke-2);background:var(--glass);cursor:pointer;color:var(--text-soft)';
      chip.innerHTML = '<i class="fa-solid fa-network-wired"></i><span class="t">LAN</span>';
      const ver = document.getElementById('app-version-pill');
      if (ver && ver.parentNode) { ver.parentNode.insertBefore(chip, ver); }
      else { right.appendChild(chip); }
      chip.onclick = function () {
        showLanHelp(hub);
      };
    }
    if (!ok || !hub) {
      // Still show if we're on desktop localhost so staff can copy IP
      try {
        if (/localhost|127\.0\.0\.1/.test(location.hostname || '')) {
          chip.style.display = 'inline-flex';
          chip.querySelector('.t').textContent = 'LAN hub';
          chip.title = 'Kitchen tablets: open this PC’s Wi‑Fi address (see /api/lan/info)';
          chip.onclick = function () { showLanHelp(null); };
        }
      } catch (_) {}
      return;
    }
    chip.style.display = 'inline-flex';
    chip.style.background = '#ecfdf5';
    chip.style.color = '#065f46';
    chip.style.borderColor = '#6ee7b7';
    chip.querySelector('.t').textContent = 'LAN kitchen';
    chip.title = 'Connected to kitchen hub ' + hub.base;
    chip.onclick = function () { showLanHelp(hub); };
  }

  async function showLanHelp(hub) {
    let info = hub && hub.info;
    if (!info) {
      try {
        const r = await fetch('/api/lan/info', { cache: 'no-store' });
        if (r.ok) { info = await r.json(); }
      } catch (_) {}
    }
    const ips = (info && info.lanIps) || [];
    const port = (info && info.port) || location.port || 8001;
    const lines = ips.length
      ? ips.map(function (ip) { return 'http://' + ip + ':' + port; }).join('\n')
      : (location.origin || '');
    const msg =
      'Same Wi‑Fi kitchen (no internet needed)\n\n' +
      '1) Run RestroSuite Desktop on the POS PC\n' +
      '2) On kitchen tablet browser open:\n' +
      lines +
      '\n3) Sign in once (when internet available), Keep me signed in\n' +
      '4) KOTs from POS appear on KDS over LAN\n\n' +
      'When internet returns: cloud sync runs. Finished (Ready) tickets will NOT re-open as new.';
    if (global.RSModal) {
      global.RSModal.open({
        title: 'LAN kitchen link',
        icon: 'fa-network-wired',
        size: 'sm',
        body: '<pre style="white-space:pre-wrap;font-size:12.5px;line-height:1.45;margin:0">' + msg.replace(/</g, '&lt;') + '</pre>',
        foot: '<button type="button" class="btn btn-primary" data-x>OK</button>',
        onMount: function (m, close) {
          m.querySelector('[data-x]').onclick = close;
        },
      });
    } else {
      alert(msg);
    }
  }

  function startStream(hub) {
    if (es) {
      try { es.close(); } catch (_) {}
      es = null;
    }
    if (!hub || typeof EventSource === 'undefined') { return; }
    const url = hub.base + '/api/lan/stream?t=' + encodeURIComponent(tenantId());
    try {
      es = new EventSource(url);
      es.addEventListener('order', function (ev) {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (data && data.row) {
            const k = orderKey(data.row);
            const isNew = k && !seenKeys[k];
            seenKeys[k] = 1;
            mergeIntoLocal(data.row).then(function () {
              // Only chime for fresh young tickets (anti-chaos)
              const age = Date.now() - (Date.parse(data.row.dateTime || data.row.date_time || 0) || Date.now());
              const st = String(data.row.status || '');
              const active = /pending|accept|prepar/i.test(st) && !/ready|served|cancel/i.test(st);
              if (isNew && active && age < 8 * 60 * 1000) {
                try {
                  if (global.RSServiceAlerts && RSServiceAlerts.playChime) { RSServiceAlerts.playChime(false); }
                  else if (global.playChime) { playChime(false); }
                } catch (_) {}
                toast('LAN KOT: ' + (data.row.tableNumber || data.row.orderId || 'order'), 'fa-fire-burner');
              }
            });
          }
        } catch (_) {}
      });
      es.onerror = function () {
        /* auto-reconnect by browser; chip stays */
      };
    } catch (_) {}
  }

  async function pullSnapshot(hub) {
    if (!hub) { return; }
    try {
      const r = await fetch(hub.base + '/api/lan/snapshot?t=' + encodeURIComponent(tenantId()), { cache: 'no-store' });
      if (!r.ok) { return; }
      const j = await r.json();
      const orders = (j && j.orders) || [];
      for (let i = 0; i < orders.length; i++) {
        seenKeys[orderKey(orders[i])] = 1;
        await mergeIntoLocal(orders[i]);
      }
    } catch (_) {}
  }

  function hookDbPuts() {
    if (!global.RS_DB || RS_DB._lanHooked) { return; }
    const origPut = RS_DB.put && RS_DB.put.bind(RS_DB);
    if (!origPut) { return; }
    RS_DB.put = function (c, id, obj) {
      const p = origPut(c, id, obj);
      if (c === 'pending_orders' && obj) {
        Promise.resolve(p)
          .then(function (row) {
            pushRow(row || obj);
          })
          .catch(function () {});
      }
      return p;
    };
    RS_DB._lanHooked = true;
  }

  async function boot() {
    hookDbPuts();
    const hub = await findHub();
    if (hub) {
      paintLanChip(true, hub);
      await pullSnapshot(hub);
      startStream(hub);
    } else {
      paintLanChip(false, null);
    }
  }

  function isOpenKitchenStatus(st) {
    return /^(Accepted|preparing|Pending Review|DineIn Active)$/i.test(String(st || ''));
  }

  function normTable(t) {
    return String(t || '')
      .toLowerCase()
      .replace(/^table\s+/i, '')
      .replace(/\s+/g, '')
      .trim();
  }

  function billMatchesOrder(bill, order) {
    if (!bill || !order) { return false; }
    const oid = String(order.orderId || order.order_id || '');
    const bid = String(bill.no || bill.orderId || bill.order_id || '');
    if (oid && bid && (oid === bid || oid.indexOf(bid) !== -1 || bid.indexOf(oid) !== -1)) { return true; }
    const ot = normTable(order.tableNumber || order.table);
    const bt = normTable(bill.table || bill.tableNumber);
    if (!ot || !bt || ot !== bt) { return false; }
    if (ot === 'walk-in/takeaway' || ot === 'takeaway' || ot === 'walk-in') { return false; }
    const tO = Date.parse(order.dateTime || order.date_time || 0) || 0;
    const tB = Date.parse(bill.dateTime || bill.time || bill.created_at || 0) || 0;
    if (!tO || !tB) { return false; }
    // Same table bill within 3 hours of the KOT → treat as already served/billed
    return Math.abs(tB - tO) < 3 * 60 * 60 * 1000;
  }

  /**
   * After internet returns: close tickets that kitchen already finished offline
   * (matched bill, or stale open tickets). Prevents re-cook / revenue waste.
   * @returns {{ rows: object[], closedByBill: number, closedStale: number, review: number }}
   */
  function reconcileAfterReconnect(rows, bills, opts) {
    opts = opts || {};
    const now = Date.now();
    // Open tickets older than this are auto-closed (already cooked verbally offline)
    const STALE_MS = opts.staleMs != null ? opts.staleMs : 12 * 60 * 1000;
    // Soft: 5–12 min → still on board but labeled "confirm if done"
    const REVIEW_MS = opts.reviewMs != null ? opts.reviewMs : 5 * 60 * 1000;
    const billList = bills || [];
    let closedByBill = 0;
    let closedStale = 0;
    let review = 0;
    const out = (rows || []).map(function (r) {
      if (!r || !isOpenKitchenStatus(r.status)) { return r; }
      if (r.kitchenHandled || r.manualFulfilled || r.skipKdsAlarm && r.reconcileReason === 'stale_offline') {
        return r;
      }
      const matched = billList.some(function (b) { return billMatchesOrder(b, r); });
      if (matched) {
        closedByBill++;
        return Object.assign({}, r, {
          status: 'Ready',
          kitchenHandled: true,
          manualFulfilled: true,
          skipKdsAlarm: true,
          reconcileReason: 'bill_exists',
          reconcileNote: 'Closed on reconnect — bill already exists (served offline)',
          kitchenHandledAt: new Date().toISOString(),
        });
      }
      const age = now - (Date.parse(r.dateTime || r.date_time || 0) || now);
      if (age >= STALE_MS) {
        closedStale++;
        return Object.assign({}, r, {
          status: 'Ready',
          kitchenHandled: true,
          manualFulfilled: true,
          skipKdsAlarm: true,
          reconcileReason: 'stale_offline',
          reconcileNote: 'Auto-closed on reconnect — old offline ticket (do not re-cook)',
          kitchenHandledAt: new Date().toISOString(),
        });
      }
      if (age >= REVIEW_MS) {
        review++;
        return Object.assign({}, r, {
          skipKdsAlarm: true,
          recoveredOffline: true,
          reconcileReason: 'review',
          reconcileNote: 'Recovered after offline — confirm if kitchen already cooked this',
        });
      }
      return r;
    });
    return { rows: out, closedByBill: closedByBill, closedStale: closedStale, review: review };
  }

  // Expose merge helper for cloud reconnect anti-chaos
  global.RSLanSync = {
    statusRank: statusRank,
    orderKey: orderKey,
    isOpenKitchenStatus: isOpenKitchenStatus,
    billMatchesOrder: billMatchesOrder,
    reconcileAfterReconnect: reconcileAfterReconnect,
    mergeRows: function (localRows, cloudRows) {
      const map = {};
      function consider(r) {
        if (!r) { return; }
        let k = orderKey(r);
        if (!k) { k = String(r.id || ''); }
        if (!k) { return; }
        const prev = map[k];
        if (!prev) {
          map[k] = Object.assign({}, r);
          return;
        }
        const pr = statusRank(prev.status);
        const nr = statusRank(r.status);
        // Always keep kitchenHandled / skipKdsAlarm flags
        const handled = !!(prev.kitchenHandled || r.kitchenHandled || prev.manualFulfilled || r.manualFulfilled);
        const skip = !!(prev.skipKdsAlarm || r.skipKdsAlarm);
        if (nr > pr) {
          map[k] = Object.assign({}, prev, r, {
            status: r.status,
            kitchenHandled: handled || r.kitchenHandled,
            manualFulfilled: !!(prev.manualFulfilled || r.manualFulfilled),
            skipKdsAlarm: skip || r.skipKdsAlarm,
          });
        } else if (nr < pr) {
          map[k] = Object.assign({}, r, prev, {
            status: prev.status,
            kitchenHandled: handled || prev.kitchenHandled,
            manualFulfilled: !!(prev.manualFulfilled || r.manualFulfilled),
            skipKdsAlarm: skip || prev.skipKdsAlarm,
          });
        } else {
          map[k] = Object.assign({}, prev, r, {
            status: prev.status,
            kitchenHandled: handled,
            skipKdsAlarm: skip,
          });
        }
      }
      (cloudRows || []).forEach(consider);
      (localRows || []).forEach(consider); // local wins ties / higher status
      return Object.keys(map).map(function (k) { return map[k]; });
    },
    pushRow: pushRow,
    findHub: findHub,
    boot: boot,
  };

  document.addEventListener('rs:ready', function () { setTimeout(boot, 400); });
  document.addEventListener('rs:hydrated', function () { setTimeout(boot, 200); });
  window.addEventListener('online', function () {
    // Cloud will drain; re-attach LAN if still useful
    setTimeout(boot, 800);
  });
  if (document.readyState !== 'loading') { setTimeout(boot, 600); }
  else { document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 600); }); }
})(typeof window !== 'undefined' ? window : globalThis);
