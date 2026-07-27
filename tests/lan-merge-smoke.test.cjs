'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadLan() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'modules', 'lan-sync.js'), 'utf8');
  const root = {
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } },
    sessionStorage: { getItem() { return null; } },
    document: { addEventListener() {}, dispatchEvent() {} },
    addEventListener() {},
    location: { origin: 'http://127.0.0.1:8001', hostname: '127.0.0.1', port: '8001' },
    fetch: async () => ({ ok: false }),
  };
  const sandbox = {
    window: root,
    globalThis: root,
    document: root.document,
    localStorage: root.localStorage,
    sessionStorage: root.sessionStorage,
    location: root.location,
    console,
    setTimeout,
    clearTimeout,
    EventSource: function () {},
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return root.RSLanSync || sandbox.RSLanSync;
}

test('merge prefers Ready over Pending (anti-chaos)', () => {
  const lan = loadLan();
  const merged = lan.mergeRows(
    [{ id: 1, orderId: 'T1', status: 'Ready', tableNumber: '5' }],
    [{ id: 1, orderId: 'T1', status: 'Pending Review', tableNumber: '5' }]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'Ready');
});

test('merge keeps preparing over older pending', () => {
  const lan = loadLan();
  const merged = lan.mergeRows(
    [{ orderId: 'A', status: 'preparing' }],
    [{ orderId: 'A', status: 'Accepted' }]
  );
  assert.equal(merged[0].status, 'preparing');
});

test('lan hub status rank on server module', () => {
  const hub = require(path.join(__dirname, '..', 'desktop', 'lan-hub.js'));
  assert.ok(hub.statusRank('Ready') > hub.statusRank('Pending Review'));
  const m = hub.mergeRow({ status: 'Ready', orderId: 'x' }, { status: 'Pending Review', orderId: 'x' });
  assert.equal(m.status, 'Ready');
});
