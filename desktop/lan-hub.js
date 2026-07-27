/* ============================================================
   RestroSuite Desktop — LAN kitchen hub
   ------------------------------------------------------------
   When internet is down, devices on the same Wi‑Fi can still share
   pending KOTs / order status via this hub (the POS desktop PC).

   Protocol (no extra deps — Express only):
     GET  /api/lan/info          → { enabled, port, tenants }
     GET  /api/lan/snapshot?t=  → { orders: [...] }
     POST /api/lan/push         → { tenantId, row } upsert one order
     GET  /api/lan/stream?t=    → Server-Sent Events of upserts

   Security: same LAN only; filtered by tenantId. Not a public internet API.
   ============================================================ */
'use strict';

const os = require('os');

/** @type {Map<string, Map<string, object>>} tenantId -> orderKey -> row */
const store = new Map();
/** @type {Map<string, Set<import('http').ServerResponse>>} */
const streams = new Map();

function statusRank(s) {
  const x = String(s || '').toLowerCase();
  if (/cancel|void|rejected/.test(x)) return 90;
  if (/ready|served|complete|done|closed|settled|paid/.test(x)) return 80;
  if (/prepar/.test(x)) return 50;
  if (/accept/.test(x)) return 40;
  if (/pending|review|new/.test(x)) return 20;
  return 10;
}

function orderKey(row) {
  return String((row && (row.orderId || row.order_id || row.id)) || '');
}

function getTenantMap(tenantId) {
  const t = String(tenantId || 'local');
  if (!store.has(t)) store.set(t, new Map());
  return store.get(t);
}

function mergeRow(prev, next) {
  if (!prev) return { ...next, lanUpdatedAt: Date.now() };
  const pr = statusRank(prev.status);
  const nr = statusRank(next.status);
  if (nr > pr) return { ...prev, ...next, status: next.status, lanUpdatedAt: Date.now() };
  if (nr < pr) return { ...next, ...prev, status: prev.status, lanUpdatedAt: Date.now() };
  return { ...prev, ...next, status: prev.status, lanUpdatedAt: Date.now() };
}

function listLanIPs() {
  const out = [];
  try {
    const ifs = os.networkInterfaces();
    Object.keys(ifs || {}).forEach((name) => {
      (ifs[name] || []).forEach((a) => {
        if (a && a.family === 'IPv4' && !a.internal) out.push(a.address);
      });
    });
  } catch (_) {}
  return out;
}

function broadcast(tenantId, event, payload) {
  const set = streams.get(String(tenantId || 'local'));
  if (!set || !set.size) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch (_) {
      set.delete(res);
    }
  }
}

/**
 * Attach LAN hub routes to an Express app.
 * @param {import('express').Express} app
 * @param {{ port?: number }} [opts]
 */
function attachLanHub(app, opts) {
  const port = Number(opts && opts.port) || 8001;

  app.get('/api/lan/info', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      enabled: true,
      role: 'hub',
      port,
      lanIps: listLanIPs(),
      hint: 'On kitchen tablets open http://THIS_PC_IP:' + port + ' while Wi‑Fi is up (internet not required).',
      tenants: Array.from(store.keys()),
    });
  });

  app.get('/api/lan/snapshot', (req, res) => {
    const tenantId = String(req.query.t || req.query.tenantId || 'local');
    const map = getTenantMap(tenantId);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      tenantId,
      orders: Array.from(map.values()),
      serverTime: Date.now(),
    });
  });

  app.post('/api/lan/push', (req, res) => {
    const body = req.body || {};
    const tenantId = String(body.tenantId || body.tenant_id || 'local');
    const row = body.row || body.order || null;
    if (!row || typeof row !== 'object') {
      return res.status(400).json({ error: 'Missing order row' });
    }
    const key = orderKey(row);
    if (!key) return res.status(400).json({ error: 'Order needs orderId or id' });
    const map = getTenantMap(tenantId);
    const prev = map.get(key);
    const merged = mergeRow(prev, row);
    map.set(key, merged);
    // Cap per tenant
    if (map.size > 400) {
      const keys = Array.from(map.keys());
      keys.slice(0, map.size - 400).forEach((k) => map.delete(k));
    }
    broadcast(tenantId, 'order', { row: merged, op: 'upsert' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, key, status: merged.status });
  });

  app.get('/api/lan/stream', (req, res) => {
    const tenantId = String(req.query.t || req.query.tenantId || 'local');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
    res.write(`event: hello\ndata: ${JSON.stringify({ tenantId, t: Date.now() })}\n\n`);

    if (!streams.has(tenantId)) streams.set(tenantId, new Set());
    streams.get(tenantId).add(res);

    const keep = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch (_) {
        clearInterval(keep);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keep);
      const set = streams.get(tenantId);
      if (set) set.delete(res);
    });
  });
}

module.exports = {
  attachLanHub,
  listLanIPs,
  statusRank,
  mergeRow,
  orderKey,
};
