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
    document: {
      addEventListener() {},
      dispatchEvent() {},
      getElementById() { return null; },
      querySelector() { return null; },
      createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
      body: { appendChild() {} },
    },
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

test('reconcile closes stale open tickets (no re-cook)', () => {
  const lan = loadLan();
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const rec = lan.reconcileAfterReconnect(
    [{ id: 1, orderId: 'OLD1', status: 'Pending Review', tableNumber: '3', dateTime: old }],
    [],
    { staleMs: 12 * 60 * 1000, reviewMs: 5 * 60 * 1000 }
  );
  assert.equal(rec.closedStale, 1);
  assert.equal(rec.rows[0].status, 'Ready');
  assert.equal(rec.rows[0].kitchenHandled, true);
});

test('reconcile closes ticket when bill exists for table', () => {
  const lan = loadLan();
  const t = new Date().toISOString();
  const rec = lan.reconcileAfterReconnect(
    [{ id: 2, orderId: 'X', status: 'Accepted', tableNumber: 'Table 7', dateTime: t }],
    [{ no: 'B1', table: 'Table 7', dateTime: t, amount: 100 }],
    { staleMs: 60 * 60 * 1000, reviewMs: 5 * 60 * 1000 }
  );
  assert.equal(rec.closedByBill, 1);
  assert.equal(rec.rows[0].status, 'Ready');
});
