'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { attachLanHub, sanitizeRow } = require('../desktop/lan-hub');

function startHub(files) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const controller = attachLanHub(app, {
    stateFile: files.state,
    credentialsFile: files.credentials,
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
