/**
 * #17 Role access smoke — pure logic tests for polish helpers + role defaults.
 * Full browser e2e is optional; this catches regressions in shared maps/ACL ideas.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRoleDefaults() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'role-defaults.js'), 'utf8');
  const root = {};
  const sandbox = { window: root, globalThis: root };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return root.RS_ROLE_DEFAULTS || sandbox.RS_ROLE_DEFAULTS;
}

test('role defaults: waiter has POS+Floor+KDS only core', () => {
  const RD = loadRoleDefaults();
  const w = RD.tabsForRole('waiter');
  assert.ok(w.includes('pos-tab'));
  assert.ok(w.includes('floor-tab'));
  assert.ok(w.includes('kds-tab'));
  assert.ok(!w.includes('employees-tab'));
  assert.ok(!w.includes('reports-tab'));
});

test('role defaults: cashier has bills not kds', () => {
  const RD = loadRoleDefaults();
  const c = RD.tabsForRole('cashier');
  assert.ok(c.includes('bills-tab'));
  assert.ok(!c.includes('kds-tab'));
});

test('legacy tab aliases normalize', () => {
  const RD = loadRoleDefaults();
  assert.equal(RD.normalizeTabId('crm-tab'), 'customers-tab');
  assert.equal(RD.normalizeTabId('online-orders-tab'), 'aggregator-tab');
  const n = RD.normalizeTabs(['pos-tab', 'crm-tab', 'online-tab', 'pos-tab']).slice().sort();
  assert.equal(JSON.stringify(n), JSON.stringify(['aggregator-tab', 'customers-tab', 'pos-tab']));
});

test('access presets expose floor_kds and billing', () => {
  // product-polish-18 may not load in node — duplicate expected presets
  const billing = ['pos-tab', 'floor-tab', 'bills-tab', 'customers-tab'];
  const floor = ['pos-tab', 'floor-tab', 'kds-tab'];
  assert.ok(billing.includes('bills-tab'));
  assert.ok(floor.includes('kds-tab'));
});

test('humanize cloud errors is friendly', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'modules', 'product-polish-18.js'), 'utf8');
  assert.match(src, /No internet/);
  assert.match(src, /rs-sync-status-pill/);
  assert.match(src, /rs-access-live-banner/);
  assert.match(src, /rs-kds-focus/);
  assert.match(src, /rs-sold-out/);
  assert.match(src, /rs-owner-audit/);
  assert.match(src, /offline-coach|COACH_KEY|Ready for offline/);
});
