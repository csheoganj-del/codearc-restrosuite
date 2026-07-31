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
  const TOKEN_PREFIX = 'rs_lan_token_v1:';
  let es = null;
  let lastHub = null;
  let bootRun = 0;
  let nativeDiscoveryAt = 0;
  let reconnectTimer = null;
  let reconnectDelay = 1500;
  const seenKeys = {};

  function toast(msg, icon) {
    try {
      if (global.RS && RS.toast) { RS.toast(msg, icon); }
    } catch (_) {}
  }

  function tenantId() {
    try {
      const s = global.RS_API && RS_API.session && RS_API.session();
      return String(
        (s && (s.tenant_id || s.tenant_slug)) ||
        sessionStorage.getItem('tenant_id') ||
        localStorage.getItem('rs_lan_tenant_hint_v1') ||
        'local'
      );
    } catch (_) {
      return 'local';
    }
  }

  function lanKitchenEnabled() {
    try {
      if (global.RSOpsMode && typeof RSOpsMode.usesKds === 'function') {
        return !!RSOpsMode.usesKds();
      }
      const mode = String(
        (global.RS_SETTINGS && RS_SETTINGS.set_operating_mode) || ''
      ).toLowerCase();
      return mode.indexOf('full') >= 0 || mode.indexOf('kds') >= 0;
    } catch (_) {
      return false;
    }
  }

  function isLoopbackHost(hostname) {
    return /^(localhost|127(?:\.\d+){3}|::1)$/i.test(String(hostname || ''));
  }

  function tokenKey(id) {
    return TOKEN_PREFIX + String(id || tenantId());
  }

  function savedToken(id) {
    try { return localStorage.getItem(tokenKey(id)) || ''; } catch (_) { return ''; }
  }

  function saveHubCredentials(base, id, token) {
    try {
      if (base) { localStorage.setItem(HUB_KEY, String(base).replace(/\/$/, '')); }
      if (id && token) { localStorage.setItem(tokenKey(id), token); }
    } catch (_) {}
  }

  function scheduleReconnect() {
    if (reconnectTimer || !lanKitchenEnabled()) { return; }
    const wait = reconnectDelay;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      boot();
    }, wait);
    // Node-based smoke harnesses expose unref(); browsers return a numeric ID.
    // Do not let a dormant recovery timer hold an Electron/test process open.
    if (reconnectTimer && typeof reconnectTimer.unref === 'function') {
      reconnectTimer.unref();
    }
    reconnectDelay = Math.min(Math.round(reconnectDelay * 1.7), 30000);
  }

  function markConnected() {
    reconnectDelay = 1500;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function requestNativeDiscovery() {
    try {
      if (!global.AndroidLan || typeof global.AndroidLan.discover !== 'function') { return false; }
      const now = Date.now();
      if (now - nativeDiscoveryAt < 3000) { return true; }
      const session = global.RS_API && RS_API.session && RS_API.session();
      const id = tenantId();
      if (!session || !id || id === 'local') { return false; }
      nativeDiscoveryAt = now;
      global.AndroidLan.discover(
        id,
        String(session.token || session.session_token || ''),
        savedToken(id)
      );
      return true;
    } catch (_) {
      return false;
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
    // A tablet's 127.0.0.1 is the tablet, never the restaurant POS.
    try {
      if (isLoopbackHost(location.hostname)) {
        list.push(location.origin || 'http://127.0.0.1:8001');
      }
    } catch (_) {}
    return list.filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  }

  async function probeHub(base) {
    try {
      const r = await fetch(base + '/api/lan/info', { cache: 'no-store' });
      if (!r.ok) { return null; }
      const j = await r.json();
      if (j && j.enabled && j.securePairing) { return { base: base, info: j }; }
    } catch (_) {}
    return null;
  }

  async function createLocalPairing(hit) {
    try {
      if (!hit || !isLoopbackHost(location.hostname)) { return null; }
      const id = tenantId();
      const r = await fetch(hit.base + '/api/lan/pairing', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: id }),
      });
      if (!r.ok) { return null; }
      const pairing = await r.json();
      if (!pairing || !pairing.token) { return null; }
      saveHubCredentials(hit.base, id, pairing.token);
      return pairing;
    } catch (_) {
      return null;
    }
  }

  async function authorizedHealth(hit, token) {
    try {
      if (!hit || !token) { return null; }
      const r = await fetch(
        hit.base + '/api/lan/health?t=' + encodeURIComponent(tenantId()),
        {
          cache: 'no-store',
          headers: { 'X-RS-LAN-Token': token },
        }
      );
      if (!r.ok) { return null; }
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  async function findHub() {
    if (!lanKitchenEnabled()) { return null; }
    const cands = defaultHubCandidates();
    for (let i = 0; i < cands.length; i++) {
      const hit = await probeHub(cands[i]);
      if (hit) {
        const id = tenantId();
        let token = savedToken(id);
        let pairing = null;
        if (!token) {
          pairing = await createLocalPairing(hit);
          token = (pairing && pairing.token) || '';
        }
        const health = await authorizedHealth(hit, token);
        if (!health) { continue; }
        saveHubCredentials(hit.base, id, token);
        return Object.assign(hit, {
          token: token,
          pairing: pairing,
          health: health,
        });
      }
    }
    requestNativeDiscovery();
    return null;
  }

  function acceptNativeHub(payload) {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (!data || !data.base || !data.token) { return false; }
      const id = tenantId();
      if (String(data.tenantId || '') !== id) { return false; }
      saveHubCredentials(data.base, id, data.token);
      nativeDiscoveryAt = 0;
      setTimeout(boot, 0);
      return true;
    } catch (_) {
      return false;
    }
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
    if (!row || !lanKitchenEnabled()) { return; }
    const hub = await findHub();
    if (!hub) { return; }
    try {
      await fetch(hub.base + '/api/lan/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RS-LAN-Token': hub.token,
        },
        body: JSON.stringify({ tenantId: tenantId(), row: row }),
      });
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
    if (!lanKitchenEnabled()) {
      chip.style.display = 'none';
      return;
    }
    if (!ok || !hub) {
      // Still show if we're on desktop localhost so staff can copy IP
      try {
        if (isLoopbackHost(location.hostname)) {
          chip.style.display = 'inline-flex';
          chip.style.background = '#fff7ed';
          chip.style.color = '#9a3412';
          chip.style.borderColor = '#fdba74';
          chip.querySelector('.t').textContent = 'LAN setup';
          chip.title = 'Set up a secure kitchen tablet connection';
          chip.onclick = function () { showLanHelp(null); };
        } else {
          chip.style.display = 'none';
        }
      } catch (_) {}
      return;
    }
    lastHub = hub;
    chip.style.display = 'inline-flex';
    chip.style.background = '#ecfdf5';
    chip.style.color = '#065f46';
    chip.style.borderColor = '#6ee7b7';
    const clients = Number(hub.health && hub.health.connectedClients) || 0;
    chip.querySelector('.t').textContent = clients ? ('LAN kitchen · ' + clients) : 'LAN kitchen';
    chip.title = clients
      ? clients + ' kitchen tablet' + (clients === 1 ? '' : 's') + ' connected'
      : 'LAN kitchen is ready. Tap to pair a tablet.';
    chip.onclick = function () { showLanHelp(hub); };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function pairingForHub(hub) {
    if (hub && hub.pairing && hub.pairing.token) { return hub.pairing; }
    if (hub && isLoopbackHost(location.hostname)) {
      const pairing = await createLocalPairing(hub);
      if (pairing) {
        hub.pairing = pairing;
        hub.token = pairing.token;
        hub.health = await authorizedHealth(hub, hub.token);
      }
      return pairing;
    }
    return null;
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } finally { area.remove(); }
    return Promise.resolve();
  }

  async function showLanHelp(hub) {
    if (!lanKitchenEnabled()) {
      toast('LAN kitchen is available in Full operations mode.', 'fa-circle-info');
      return;
    }
    hub = hub || lastHub || await findHub();
    if (!hub) {
      toast('LAN kitchen is not ready. Restart RestroSuite Desktop and check Windows Firewall.', 'fa-triangle-exclamation');
      return;
    }
    const pairing = await pairingForHub(hub);
    const urls = (pairing && pairing.pairingUrls) || [];
    const pairUrl = urls[0] || '';
    const displayUrl = pairUrl ? pairUrl.split('/lan-pair')[0] : '';
    const clients = Number((hub.health && hub.health.connectedClients) || (pairing && pairing.connectedClients)) || 0;
    const queued = Number((hub.health && hub.health.queuedOrders) || (pairing && pairing.queuedOrders)) || 0;
    let qr = '';
    if (pairUrl && global.QRCode && typeof global.QRCode.toDataURL === 'function') {
      try {
        qr = await global.QRCode.toDataURL(pairUrl, {
          width: 220,
          margin: 1,
          color: { dark: '#111827', light: '#ffffff' },
        });
      } catch (_) {}
    }
    const addressBlock = pairUrl
      ? '<div style="font-size:12px;color:var(--text-soft);margin-bottom:4px">Kitchen tablet address</div>' +
        '<div style="font:700 14px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all">' + esc(displayUrl) + '</div>'
      : '<div style="padding:12px;border-radius:10px;background:#fff7ed;color:#9a3412">' +
        '<b>No usable Wi-Fi address detected.</b><br>Connect this POS to the restaurant Wi-Fi and allow RestroSuite through Windows Firewall. Never enter localhost on the tablet.' +
        '</div>';
    const body =
      '<div style="display:grid;grid-template-columns:' + (qr ? '220px minmax(240px,1fr)' : '1fr') + ';gap:20px;align-items:start">' +
        (qr ? '<img src="' + esc(qr) + '" alt="Secure LAN pairing QR code" style="width:220px;height:220px;border:1px solid var(--stroke-2);border-radius:12px">' : '') +
        '<div>' +
          '<div style="font-weight:800;font-size:16px;margin-bottom:8px">Kitchen screens connect automatically</div>' +
          addressBlock +
          '<ol style="padding-left:20px;line-height:1.55;margin:14px 0">' +
            '<li>Connect the kitchen tablet to the same Wi-Fi.</li>' +
            '<li><b>RestroSuite Android:</b> open the app; it discovers and connects by itself.</li>' +
            '<li><b>Phone, tablet or TV browser:</b> open this link once and bookmark it.</li>' +
            '<li>After the first sign-in it remembers the secure LAN and reconnects automatically.</li>' +
          '</ol>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<span data-lan-status style="padding:6px 9px;border-radius:999px;background:#ecfdf5;color:#065f46;font-size:12px;font-weight:700">' +
              clients + ' tablet' + (clients === 1 ? '' : 's') + ' connected</span>' +
            '<span style="padding:6px 9px;border-radius:999px;background:var(--glass);font-size:12px;font-weight:700">' +
              queued + ' KOT' + (queued === 1 ? '' : 's') + ' cached</span>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-soft);margin-top:12px">Windows networking was configured automatically during RestroSuite installation. The copied link contains a private pairing key; share it only with kitchen devices.</div>' +
        '</div>' +
      '</div>';
    if (global.RSModal) {
      global.RSModal.open({
        title: 'LAN kitchen link',
        icon: 'fa-network-wired',
        size: 'md',
        body: body,
        foot:
          '<button type="button" class="btn btn-secondary" data-lan-test>Test connection</button>' +
          (pairUrl ? '<button type="button" class="btn btn-secondary" data-lan-copy>Copy secure link</button>' : '') +
          '<button type="button" class="btn btn-primary" data-x>Done</button>',
        onMount: function (m, close) {
          m.querySelector('[data-x]').onclick = close;
          const copy = m.querySelector('[data-lan-copy]');
          if (copy) {
            copy.onclick = function () {
              copyText(pairUrl).then(function () {
                copy.textContent = 'Copied';
                toast('Secure kitchen link copied.', 'fa-copy');
              });
            };
          }
          const test = m.querySelector('[data-lan-test]');
          test.onclick = async function () {
            test.disabled = true;
            test.textContent = 'Testing...';
            const health = await authorizedHealth(hub, hub.token);
            test.disabled = false;
            if (health) {
              hub.health = health;
              const count = Number(health.connectedClients) || 0;
              const status = m.querySelector('[data-lan-status]');
              if (status) { status.textContent = count + ' tablet' + (count === 1 ? '' : 's') + ' connected'; }
              test.textContent = 'Connection healthy';
              paintLanChip(true, hub);
            } else {
              test.textContent = 'Could not connect';
            }
          };
        },
      });
    } else {
      alert(pairUrl
        ? 'Open this secure link on the kitchen tablet:\n\n' + pairUrl
        : 'No usable Wi-Fi address detected. Connect this POS to Wi-Fi and allow RestroSuite through Windows Firewall.');
    }
  }

  function startStream(hub) {
    if (es) {
      try { es.close(); } catch (_) {}
      es = null;
    }
    if (!hub || typeof EventSource === 'undefined') { return; }
    const url = hub.base + '/api/lan/stream?t=' + encodeURIComponent(tenantId()) +
      '&token=' + encodeURIComponent(hub.token);
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
        // EventSource retries by itself. Also run the bounded recovery loop so
        // IP/port changes and a restarted POS are recovered without staff action.
        scheduleReconnect();
      };
    } catch (_) {}
  }

  async function pullSnapshot(hub) {
    if (!hub) { return; }
    try {
      const r = await fetch(hub.base + '/api/lan/snapshot?t=' + encodeURIComponent(tenantId()), {
        cache: 'no-store',
        headers: { 'X-RS-LAN-Token': hub.token },
      });
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
    const run = ++bootRun;
    if (!lanKitchenEnabled()) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (es) {
        try { es.close(); } catch (_) {}
        es = null;
      }
      paintLanChip(false, null);
      return;
    }
    hookDbPuts();
    const hub = await findHub();
    if (run !== bootRun) { return; }
    if (hub) {
      markConnected();
      paintLanChip(true, hub);
      await pullSnapshot(hub);
      startStream(hub);
    } else {
      paintLanChip(false, null);
      scheduleReconnect();
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
    showLanHelp: showLanHelp,
    lanKitchenEnabled: lanKitchenEnabled,
    acceptNativeHub: acceptNativeHub,
    requestNativeDiscovery: requestNativeDiscovery,
    boot: boot,
  };

  document.addEventListener('rs:ready', function () { setTimeout(boot, 400); });
  document.addEventListener('rs:hydrated', function () { setTimeout(boot, 200); });
  document.addEventListener('rs:settings-changed', function () { setTimeout(boot, 100); });
  window.addEventListener('online', function () {
    // Cloud will drain; re-attach LAN if still useful
    setTimeout(boot, 800);
  });
  window.addEventListener('offline', function () {
    // Start local recovery immediately. Saved hubs reconnect without staff action;
    // the Android bridge also starts zero-touch Wi-Fi discovery when needed.
    reconnectDelay = 500;
    setTimeout(boot, 0);
  });
  if (document.readyState !== 'loading') { setTimeout(boot, 600); }
  else { document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 600); }); }
})(typeof window !== 'undefined' ? window : globalThis);
