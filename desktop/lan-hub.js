/* ============================================================
   RestroSuite Desktop — authenticated LAN kitchen hub
   ============================================================ */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_ORDERS_PER_TENANT = 400;
const MAX_STREAMS_PER_TENANT = 20;
const MAX_STREAMS_TOTAL = 60;
const MAX_ROW_BYTES = 64 * 1024;
const startedAt = Date.now();

/** @type {Map<string, Map<string, object>>} */
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
  return String((row && (row.orderId || row.order_id || row.id)) || '').slice(0, 180);
}

function normalizeTenantId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 180 || !/^[a-zA-Z0-9._:@-]+$/.test(id)) return '';
  return id;
}

function getTenantMap(tenantId) {
  const t = normalizeTenantId(tenantId);
  if (!t) return null;
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

function isPrivateIPv4(address) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(address || ''));
}

function listLanIPs() {
  const candidates = [];
  try {
    const ifs = os.networkInterfaces();
    Object.keys(ifs || {}).forEach((name) => {
      (ifs[name] || []).forEach((a) => {
        const family = a && String(a.family);
        if (!a || (family !== 'IPv4' && family !== '4') || a.internal) return;
        const address = String(a.address || '');
        if (!address || /^169\.254\./.test(address)) return;
        const adapter = String(name || '').toLowerCase();
        let score = isPrivateIPv4(address) ? 100 : 20;
        if (/wi-?fi|wireless|wlan|ethernet|local area/.test(adapter)) score += 40;
        if (/vpn|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback/.test(adapter)) score -= 80;
        candidates.push({ address, score });
      });
    });
  } catch (_) {}
  candidates.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
  return Array.from(new Set(candidates.map((item) => item.address)));
}

function isLoopbackRequest(req) {
  const ip = String(
    (req && req.socket && req.socket.remoteAddress) ||
    (req && req.connection && req.connection.remoteAddress) ||
    ''
  ).toLowerCase();
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function safeJsonValue(value, depth) {
  if (depth > 6) return null;
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => safeJsonValue(v, depth + 1));
  if (typeof value !== 'object') return null;
  const out = {};
  Object.keys(value).slice(0, 120).forEach((key) => {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
    out[key.slice(0, 120)] = safeJsonValue(value[key], depth + 1);
  });
  return out;
}

function sanitizeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
  } catch (_) {
    return null;
  }
  if (!bytes || bytes > MAX_ROW_BYTES) return null;
  const clean = safeJsonValue(row, 0);
  return clean && orderKey(clean) ? clean : null;
}

function totalStreams() {
  let total = 0;
  streams.forEach((set) => { total += set.size; });
  return total;
}

function broadcast(tenantId, event, payload) {
  const set = streams.get(tenantId);
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

function createRateLimiter() {
  const buckets = new Map();
  return function allow(req, name, max, windowMs) {
    const ip = String((req.socket && req.socket.remoteAddress) || 'unknown');
    const key = name + ':' + ip;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0 };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (buckets.size > 500) {
      for (const [k, v] of buckets) {
        if (now - v.startedAt > windowMs * 2) buckets.delete(k);
      }
    }
    return entry.count <= max;
  };
}

function timingSafeTokenEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function atomicWriteJson(filePath, value) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch (_) {}
}

function createCredentialStore(filePath) {
  const credentials = readJson(filePath, {});
  function tokenFor(tenantId, rotate) {
    if (rotate || !credentials[tenantId]) {
      credentials[tenantId] = crypto.randomBytes(32).toString('base64url');
      atomicWriteJson(filePath, credentials);
    }
    return credentials[tenantId];
  }
  return {
    tokenFor,
    valid(tenantId, token) {
      return !!credentials[tenantId] && timingSafeTokenEqual(token, credentials[tenantId]);
    },
  };
}

function loadState(filePath) {
  const data = readJson(filePath, {});
  Object.keys(data || {}).forEach((tenantId) => {
    const id = normalizeTenantId(tenantId);
    if (!id || !Array.isArray(data[tenantId])) return;
    const map = getTenantMap(id);
    data[tenantId].slice(-MAX_ORDERS_PER_TENANT).forEach((row) => {
      const clean = sanitizeRow(row);
      const key = orderKey(clean);
      if (clean && key) map.set(key, clean);
    });
  });
}

function stateSnapshot() {
  const out = {};
  store.forEach((map, tenantId) => {
    out[tenantId] = Array.from(map.values()).slice(-MAX_ORDERS_PER_TENANT);
  });
  return out;
}

/**
 * Attach LAN hub routes.
 * @param {import('express').Express} app
 * @param {{
 *   port?: number,
 *   getPort?: () => number,
 *   stateFile?: string,
 *   credentialsFile?: string
 * }} [opts]
 */
function attachLanHub(app, opts) {
  opts = opts || {};
  const stateFile = opts.stateFile || '';
  const credentials = createCredentialStore(opts.credentialsFile || '');
  const allowRate = createRateLimiter();
  let persistTimer = null;

  if (stateFile) loadState(stateFile);

  function schedulePersist() {
    if (!stateFile || persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try { atomicWriteJson(stateFile, stateSnapshot()); } catch (e) {
        console.warn('[lan-hub] state persist failed', e && e.message);
      }
    }, 80);
    if (persistTimer.unref) persistTimer.unref();
  }

  function requestPort(req) {
    const socketPort = Number(req && req.socket && req.socket.localPort);
    if (socketPort > 0) return socketPort;
    const dynamic = Number(typeof opts.getPort === 'function' && opts.getPort());
    return dynamic > 0 ? dynamic : (Number(opts.port) || 8001);
  }

  function tenantFrom(req) {
    return normalizeTenantId(
      (req.query && (req.query.t || req.query.tenantId)) ||
      (req.body && (req.body.tenantId || req.body.tenant_id))
    );
  }

  function tokenFrom(req) {
    const auth = String(req.headers.authorization || '');
    if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    return String(
      req.headers['x-rs-lan-token'] ||
      (req.query && (req.query.token || req.query.lanToken)) ||
      ''
    );
  }

  function requireTenantAuth(req, res) {
    const tenantId = tenantFrom(req);
    if (!tenantId) {
      res.status(400).json({ error: 'A valid tenant ID is required' });
      return '';
    }
    if (!credentials.valid(tenantId, tokenFrom(req))) {
      res.status(401).json({ error: 'LAN pairing required', code: 'lan_pairing_required' });
      return '';
    }
    return tenantId;
  }

  app.get('/api/lan/info', (req, res) => {
    if (!allowRate(req, 'info', 120, 60000)) {
      return res.status(429).json({ error: 'Too many LAN discovery requests' });
    }
    const port = requestPort(req);
    const lanIps = listLanIPs();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      enabled: true,
      role: 'hub',
      securePairing: true,
      port,
      lanIps,
      preferredUrl: lanIps.length ? 'http://' + lanIps[0] + ':' + port : null,
      connectedClients: totalStreams(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.post('/api/lan/pairing', (req, res) => {
    if (!isLoopbackRequest(req)) {
      return res.status(403).json({ error: 'Pairing links can only be created on the POS computer' });
    }
    if (!allowRate(req, 'pairing', 30, 60000)) {
      return res.status(429).json({ error: 'Too many pairing requests' });
    }
    const tenantId = tenantFrom(req);
    if (!tenantId) return res.status(400).json({ error: 'A valid tenant ID is required' });
    const token = credentials.tokenFor(tenantId, false);
    const port = requestPort(req);
    const lanIps = listLanIPs();
    const pairingUrls = lanIps.map((ip) =>
      'http://' + ip + ':' + port + '/lan-pair?t=' +
      encodeURIComponent(tenantId) + '&token=' + encodeURIComponent(token)
    );
    const map = getTenantMap(tenantId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      tenantId,
      token,
      port,
      lanIps,
      pairingUrls,
      connectedClients: (streams.get(tenantId) || new Set()).size,
      queuedOrders: map ? map.size : 0,
    });
  });

  app.post('/api/lan/pairing/rotate', (req, res) => {
    if (!isLoopbackRequest(req)) {
      return res.status(403).json({ error: 'Pairing can only be reset on the POS computer' });
    }
    const tenantId = tenantFrom(req);
    if (!tenantId) return res.status(400).json({ error: 'A valid tenant ID is required' });
    credentials.tokenFor(tenantId, true);
    const set = streams.get(tenantId);
    if (set) {
      for (const stream of set) {
        try { stream.end(); } catch (_) {}
      }
      set.clear();
    }
    return res.json({ ok: true, rotated: true });
  });

  app.get('/lan-pair', (req, res) => {
    const tenantId = tenantFrom(req);
    const token = tokenFrom(req);
    if (!tenantId || !credentials.valid(tenantId, token)) {
      return res.status(401).type('html').send(
        '<!doctype html><meta charset="utf-8"><title>Pairing failed</title>' +
        '<h1>Pairing link expired</h1><p>Create a new QR code on the POS computer.</p>'
      );
    }
    const nonce = crypto.randomBytes(16).toString('base64');
    const tenantJson = JSON.stringify(tenantId).replace(/</g, '\\u003c');
    const tokenJson = JSON.stringify(token).replace(/</g, '\\u003c');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
      '<title>Kitchen paired</title><style>body{font-family:system-ui;margin:0;display:grid;place-items:center;' +
      'min-height:100vh;background:#fff7ed;color:#292524}.c{max-width:420px;padding:30px;text-align:center}' +
      '.ok{font-size:48px;color:#059669}p{line-height:1.5}</style></head><body><main class="c">' +
      '<div class="ok">✓</div><h1>Kitchen tablet paired</h1><p>Opening RestroSuite securely…</p></main>' +
      `<script nonce="${nonce}">` +
      `(function(){var t=${tenantJson},k=${tokenJson};` +
      `localStorage.setItem('rs_lan_hub_url_v1',location.origin);` +
      `localStorage.setItem('rs_lan_token_v1:'+t,k);` +
      `localStorage.setItem('rs_lan_tenant_hint_v1',t);` +
      `location.replace('/login?lan=1');}());</script></body></html>`
    );
  });

  app.get('/api/lan/health', (req, res) => {
    const tenantId = requireTenantAuth(req, res);
    if (!tenantId) return;
    const map = getTenantMap(tenantId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      tenantId,
      queuedOrders: map ? map.size : 0,
      connectedClients: (streams.get(tenantId) || new Set()).size,
      serverTime: Date.now(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.get('/api/lan/snapshot', (req, res) => {
    if (!allowRate(req, 'snapshot', 90, 60000)) {
      return res.status(429).json({ error: 'Too many snapshot requests' });
    }
    const tenantId = requireTenantAuth(req, res);
    if (!tenantId) return;
    const map = getTenantMap(tenantId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      tenantId,
      orders: Array.from(map.values()),
      serverTime: Date.now(),
    });
  });

  app.post('/api/lan/push', (req, res) => {
    if (!allowRate(req, 'push', 240, 60000)) {
      return res.status(429).json({ error: 'Too many order updates' });
    }
    const tenantId = requireTenantAuth(req, res);
    if (!tenantId) return;
    const row = sanitizeRow(req.body && (req.body.row || req.body.order));
    if (!row) {
      return res.status(400).json({ error: 'A valid order row under 64 KB is required' });
    }
    const key = orderKey(row);
    const map = getTenantMap(tenantId);
    const merged = mergeRow(map.get(key), row);
    map.set(key, merged);
    if (map.size > MAX_ORDERS_PER_TENANT) {
      const keys = Array.from(map.keys());
      keys.slice(0, map.size - MAX_ORDERS_PER_TENANT).forEach((k) => map.delete(k));
    }
    schedulePersist();
    broadcast(tenantId, 'order', { row: merged, op: 'upsert' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, key, status: merged.status });
  });

  app.get('/api/lan/stream', (req, res) => {
    const tenantId = requireTenantAuth(req, res);
    if (!tenantId) return;
    const tenantStreams = streams.get(tenantId) || new Set();
    if (tenantStreams.size >= MAX_STREAMS_PER_TENANT || totalStreams() >= MAX_STREAMS_TOTAL) {
      return res.status(429).json({ error: 'Too many connected kitchen screens' });
    }
    streams.set(tenantId, tenantStreams);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    res.write(`event: hello\ndata: ${JSON.stringify({ tenantId, t: Date.now() })}\n\n`);
    tenantStreams.add(res);

    const keep = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) { clearInterval(keep); }
    }, 20000);
    if (keep.unref) keep.unref();

    req.on('close', () => {
      clearInterval(keep);
      tenantStreams.delete(res);
    });
  });

  return {
    flush() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (stateFile) atomicWriteJson(stateFile, stateSnapshot());
    },
  };
}

module.exports = {
  attachLanHub,
  isLoopbackRequest,
  listLanIPs,
  mergeRow,
  normalizeTenantId,
  orderKey,
  sanitizeRow,
  statusRank,
  timingSafeTokenEqual,
};
