'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const dgram = require('node:dgram');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const {
  DISCOVERY_REQUEST,
  attachLanHub,
  sanitizeRow,
  startLanDiscovery,
} = require('../desktop/lan-hub');

function startHub(files, options) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const controller = attachLanHub(app, {
    stateFile: files.state,
    credentialsFile: files.credentials,
    validateSession: options && options.validateSession,
  });
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        base: 'http://127.0.0.1:' + port,
        controller,
        close: () => new Promise((done) => { server.close(done); }),
      });
    });
  });
}

async function json(url, options) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) {}
  return { response, body };
}

test('LAN hub requires secure, tenant-scoped pairing and persists KOTs', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restrosuite-lan-test-'));
  const files = {
    state: path.join(tempDir, 'orders.json'),
    credentials: path.join(tempDir, 'pairing.json'),
  };
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const hub = await startHub(files);
  t.after(() => hub.close());

  const info = await json(hub.base + '/api/lan/info');
  assert.equal(info.response.status, 200);
  assert.equal(info.body.securePairing, true);
  assert.equal(info.body.port, Number(new URL(hub.base).port));
  assert.equal(Object.hasOwn(info.body, 'tenants'), false);
  assert.equal(Object.hasOwn(info.body, 'token'), false);

  const pairing = await json(hub.base + '/api/lan/pairing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: 'outlet-bbb' }),
  });
  assert.equal(pairing.response.status, 200);
  assert.match(pairing.body.token, /^[A-Za-z0-9_-]{40,}$/);

  const anonymous = await json(hub.base + '/api/lan/snapshot?t=outlet-bbb');
  assert.equal(anonymous.response.status, 401);

  const pushed = await json(hub.base + '/api/lan/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RS-LAN-Token': pairing.body.token,
    },
    body: JSON.stringify({
      tenantId: 'outlet-bbb',
      row: {
        id: 'kot-101',
        orderId: 'kot-101',
        status: 'Accepted',
        tableNumber: 'T4',
        items: [{ name: 'Paneer Tikka', qty: 2 }],
      },
    }),
  });
  assert.equal(pushed.response.status, 200);
  assert.equal(pushed.body.key, 'kot-101');

  const snapshot = await json(hub.base + '/api/lan/snapshot?t=outlet-bbb', {
    headers: { 'X-RS-LAN-Token': pairing.body.token },
  });
  assert.equal(snapshot.response.status, 200);
  assert.equal(snapshot.body.orders.length, 1);
  assert.equal(snapshot.body.orders[0].status, 'Accepted');

  const crossTenant = await json(hub.base + '/api/lan/snapshot?t=another-outlet', {
    headers: { 'X-RS-LAN-Token': pairing.body.token },
  });
  assert.equal(crossTenant.response.status, 401);

  const pairedPage = await fetch(
    hub.base + '/lan-pair?t=outlet-bbb&token=' + encodeURIComponent(pairing.body.token)
  );
  assert.equal(pairedPage.status, 200);
  assert.match(pairedPage.headers.get('content-security-policy') || '', /script-src 'nonce-/);
  assert.match(await pairedPage.text(), /rs_lan_token_v1/);

  const badPairing = await fetch(hub.base + '/lan-pair?t=outlet-bbb&token=wrong');
  assert.equal(badPairing.status, 401);

  hub.controller.flush();
  const disk = JSON.parse(fs.readFileSync(files.state, 'utf8'));
  assert.equal(disk['outlet-bbb'][0].orderId, 'kot-101');
  const secrets = JSON.parse(fs.readFileSync(files.credentials, 'utf8'));
  assert.equal(secrets['outlet-bbb'], pairing.body.token);
});

test('LAN hub rejects unsafe or unusable order payloads', () => {
  assert.equal(sanitizeRow(null), null);
  assert.equal(sanitizeRow({ status: 'Accepted' }), null);
  assert.equal(sanitizeRow({ id: 'x', huge: 'x'.repeat(70 * 1024) }), null);
  const safe = sanitizeRow({
    id: 'safe-1',
    __proto__: { polluted: true },
    customer: { name: 'A'.repeat(900) },
  });
  assert.equal(safe.id, 'safe-1');
  assert.equal(Object.hasOwn(safe, '__proto__'), false);
  assert.equal(safe.customer.name.length <= 2000, true);
});

test('LAN client never directs a tablet to localhost and gates the UI by mode', () => {
  const client = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'modules', 'lan-sync.js'),
    'utf8'
  );
  assert.match(client, /lanKitchenEnabled/);
  assert.match(client, /X-RS-LAN-Token/);
  assert.match(client, /QRCode\.toDataURL/);
  assert.match(client, /Never enter localhost on the tablet/);
  assert.match(client, /rs:settings-changed/);
  assert.doesNotMatch(client, /list\.push\('http:\/\/127\.0\.0\.1:8001'\)/);
});

test('desktop installer includes the LAN hub runtime', () => {
  const desktopPackage = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'desktop', 'package.json'),
    'utf8'
  ));
  assert.equal(desktopPackage.build.files.includes('lan-hub.js'), true);
});

test('automatic pairing validates the cloud session once and resumes offline', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restrosuite-lan-auto-test-'));
  const files = {
    state: path.join(tempDir, 'orders.json'),
    credentials: path.join(tempDir, 'pairing.json'),
  };
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  let validations = 0;
  const hub = await startHub(files, {
    validateSession: async ({ tenantId, sessionToken }) => {
      validations += 1;
      return tenantId === 'auto-outlet' && sessionToken === 'valid-cloud-session';
    },
  });
  t.after(() => hub.close());

  const first = await json(hub.base + '/api/lan/auto-pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: 'auto-outlet',
      sessionToken: 'valid-cloud-session',
    }),
  });
  assert.equal(first.response.status, 200);
  assert.match(first.body.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(first.body.resumed, false);
  assert.equal(validations, 1);

  const offlineResume = await json(hub.base + '/api/lan/auto-pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: 'auto-outlet',
      lanToken: first.body.token,
    }),
  });
  assert.equal(offlineResume.response.status, 200);
  assert.equal(offlineResume.body.token, first.body.token);
  assert.equal(offlineResume.body.resumed, true);
  assert.equal(validations, 1);

  const wrongOutlet = await json(hub.base + '/api/lan/auto-pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: 'wrong-outlet',
      sessionToken: 'valid-cloud-session',
    }),
  });
  assert.equal(wrongOutlet.response.status, 401);
});

test('desktop answers bounded zero-touch UDP discovery without exposing an outlet', async (t) => {
  const probe = dgram.createSocket('udp4');
  await new Promise((resolve) => { probe.bind(0, '127.0.0.1', resolve); });
  const discoveryPort = probe.address().port;
  await new Promise((resolve) => { probe.close(resolve); });

  const discovery = startLanDiscovery(() => 8123, discoveryPort);
  t.after(async () => { await discovery.close(); });
  assert.equal(await discovery.ready, true);

  const client = dgram.createSocket('udp4');
  t.after(() => new Promise((resolve) => {
    try { client.close(resolve); } catch (_) { resolve(); }
  }));
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LAN discovery timed out')), 1500);
    client.once('message', (message) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(message)));
    });
  });
  await new Promise((resolve) => { client.bind(0, '127.0.0.1', resolve); });
  client.send(Buffer.from(DISCOVERY_REQUEST), discoveryPort, '127.0.0.1');
  const payload = await response;
  assert.equal(payload.service, 'restrosuite-lan-v1');
  assert.equal(payload.port, 8123);
  assert.equal(payload.securePairing, true);
  assert.equal(Object.hasOwn(payload, 'tenantId'), false);
  assert.equal(Object.hasOwn(payload, 'token'), false);
});

test('Android shell provides zero-touch LAN discovery without weakening WebView HTTPS', () => {
  const root = path.join(__dirname, '..', 'android-app', 'app');
  const bridge = fs.readFileSync(
    path.join(root, 'src', 'main', 'java', 'com', 'restrosuite', 'pos', 'LanDiscoveryBridge.java'),
    'utf8'
  );
  const activity = fs.readFileSync(
    path.join(root, 'src', 'main', 'java', 'com', 'restrosuite', 'pos', 'MainActivity.java'),
    'utf8'
  );
  const manifest = fs.readFileSync(path.join(root, 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.match(bridge, /RESTROSUITE_LAN_DISCOVER_V1/);
  assert.match(bridge, /\/api\/lan\/auto-pair/);
  assert.match(bridge, /isPrivateAddress/);
  assert.match(activity, /addJavascriptInterface\(lanDiscoveryBridge, "AndroidLan"\)/);
  assert.match(activity, /NET_CAPABILITY_VALIDATED/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});
