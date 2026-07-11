'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

test('escpos encoder module exists', () => {
  const src = fs.readFileSync(path.join(root, 'assets/escpos-encoder.js'), 'utf8');
  assert.match(src, /RSEscPos/);
  assert.match(src, /receiptFromBill/);
  assert.match(src, /kotFromItems/);
});

test('bill-identity module exists', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/bill-identity.js'), 'utf8');
  assert.match(src, /RSBillIdentity/);
  assert.match(src, /allocateBillNo/);
});

test('dashboard delegates to RSBillIdentity', () => {
  const src = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(src, /RSBillIdentity/);
});

test('desktop raw Windows print path', () => {
  const src = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  assert.match(src, /rawPrintWindows|copy.*\/b|copy-raw/);
});

test('dashboard loads wave5 modules', () => {
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /escpos-encoder\.js/);
  assert.match(html, /bill-identity\.js/);
  assert.match(html, /v5[0-9]-20260711/);
  assert.match(html, /bills-history\.js|inventory-ledger\.js/);
});

test('playwright config present', () => {
  assert.ok(fs.existsSync(path.join(root, 'playwright.config.cjs')));
  assert.ok(fs.existsSync(path.join(root, 'tests/e2e/smoke.spec.cjs')));
  assert.ok(fs.existsSync(path.join(root, 'tests/e2e/auth.spec.cjs')));
});

test('inventory-ledger module extracted', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/inventory-ledger.js'), 'utf8');
  assert.match(src, /RSInventoryLedger/);
  assert.match(src, /deductInventoryForBill/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSInventoryLedger/);
  assert.ok(!dash.includes('operation: \'deduct_inventory\''), 'heavy deduct body should leave dashboard');
});

test('bills-history module extracted (wave 6)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/bills-history.js'), 'utf8');
  assert.match(src, /RSBillsHistory/);
  assert.match(src, /renderBills/);
  assert.match(src, /markBillRefunded/);
  assert.match(src, /filterBills/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSBillsHistory/);
  assert.ok(!dash.includes('rs-refund-overlay'), 'refund modal should leave dashboard');
  assert.ok(!dash.includes('payPill'), 'payPill map should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /bills-history\.js/);
  assert.match(html, /v54-20260711/);
});

test('checkout e2e spec present (wave 6)', () => {
  assert.ok(fs.existsSync(path.join(root, 'tests/e2e/checkout.spec.cjs')));
  const src = fs.readFileSync(path.join(root, 'tests/e2e/checkout.spec.cjs'), 'utf8');
  assert.match(src, /btn-checkout/);
  assert.match(src, /bills-table-body/);
});

test('USB and split docs exist', () => {
  assert.ok(fs.existsSync(path.join(root, 'docs/USB_THERMAL_PRINTING.md')));
  assert.ok(fs.existsSync(path.join(root, 'docs/DASHBOARD_SPLIT_MAP.md')));
});
