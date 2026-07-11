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
  assert.match(html, /v5[0-9]-20260711/);
});

test('checkout e2e spec present (wave 6)', () => {
  assert.ok(fs.existsSync(path.join(root, 'tests/e2e/checkout.spec.cjs')));
  const src = fs.readFileSync(path.join(root, 'tests/e2e/checkout.spec.cjs'), 'utf8');
  assert.match(src, /btn-checkout/);
  assert.match(src, /bills-table-body/);
});

test('inventory-ui module extracted (wave 7)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/inventory-ui.js'), 'utf8');
  assert.match(src, /RSInventoryUI/);
  assert.match(src, /renderInventory/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSInventoryUI/);
  assert.ok(!dash.includes('btn-auto-draft-pos'), 'heavy inventory UI should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /inventory-ui\.js/);
  assert.match(html, /v5[0-9]-20260711/);
});

test('bills-history has server search helpers (wave 7)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/bills-history.js'), 'utf8');
  assert.match(src, /searchBillsServer|search_bills/);
  assert.match(src, /normalizeServerBill/);
  const edge = fs.readFileSync(path.join(root, 'supabase/functions/tenant-data/index.ts'), 'utf8');
  assert.match(edge, /search_bills/);
});

test('bills-actions e2e spec present (wave 7)', () => {
  assert.ok(fs.existsSync(path.join(root, 'tests/e2e/bills-actions.spec.cjs')));
  const src = fs.readFileSync(path.join(root, 'tests/e2e/bills-actions.spec.cjs'), 'utf8');
  assert.match(src, /refund-act|rs-refund-overlay|rs-pin-overlay/);
  assert.match(src, /del-act|rs-del-overlay/);
});

test('reports-ui module extracted (wave 8)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/reports-ui.js'), 'utf8');
  assert.match(src, /RSReportsUI/);
  assert.match(src, /sales_summary/);
  assert.match(src, /GSTR/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSReportsUI/);
  assert.ok(!dash.includes('GSTR_report_'), 'GSTR export should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /reports-ui\.js/);
  assert.match(html, /v5[0-9]-20260711/);
});

test('gateway-monitor module extracted (wave 8)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/gateway-monitor.js'), 'utf8');
  assert.match(src, /RSGatewayMonitor/);
  assert.match(src, /pollSuperAdminGateway/);
  assert.match(src, /loadAppIncidents/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSGatewayMonitor/);
  assert.ok(!dash.includes('saas-notification-logs-container'), 'gateway logs UI should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /gateway-monitor\.js/);
});

test('super-admin module extracted (wave 9)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/super-admin.js'), 'utf8');
  assert.match(src, /RSSuperAdmin/);
  assert.match(src, /renderSuper|async function renderSuper/);
  assert.match(src, /openCreateTenantModal/);
  assert.match(src, /renderTenantTable/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSSuperAdmin/);
  assert.ok(!dash.includes('function openCreateTenantModal'), 'tenant create modal should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /super-admin\.js/);
  assert.match(html, /v5[0-9]-20260711/);
});

test('kds-ui module extracted (wave 9)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/kds-ui.js'), 'utf8');
  assert.match(src, /RSKdsUI/);
  assert.match(src, /renderKDS/);
  assert.match(src, /kds-grid/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSKdsUI/);
  assert.ok(!dash.includes('kds-timer'), 'KDS timer markup should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /kds-ui\.js/);
});

test('qr-orders-ui module extracted (wave 10)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/qr-orders-ui.js'), 'utf8');
  assert.match(src, /RSQrOrdersUI/);
  assert.match(src, /renderQR|function renderQR/);
  assert.match(src, /openQrOrderInPos/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSQrOrdersUI/);
  assert.ok(!dash.includes('qr-grid'), 'QR grid markup should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /qr-orders-ui\.js/);
  assert.match(html, /v5[0-9]-20260711/);
});

test('employees-ui module extracted (wave 10)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/employees-ui.js'), 'utf8');
  assert.match(src, /RSEmployeesUI/);
  assert.match(src, /renderEmployees/);
  assert.match(src, /openEditRoleModal|ROLE_DEFS|emp-card/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSEmployeesUI/);
  assert.ok(!dash.includes('emp-card'), 'employee cards should leave dashboard');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /employees-ui\.js/);
});

test('pos-ui module extracted (wave 11)', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/pos-ui.js'), 'utf8');
  assert.match(src, /RSPosUI/);
  assert.match(src, /renderPOS|const renderPOS/);
  assert.match(src, /getTotals/);
  assert.match(src, /initPOS/);
  assert.match(src, /function getCart|getCart\s*\(/);
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(dash, /RSPosUI/);
  assert.ok(!dash.includes('pos-item'), 'POS menu tiles should leave dashboard');
  assert.match(dash, /RS_resolveRate/); // tax helpers remain
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /pos-ui\.js/);
  assert.match(html, /v59-20260711/);
});

test('USB and split docs exist', () => {
  assert.ok(fs.existsSync(path.join(root, 'docs/USB_THERMAL_PRINTING.md')));
  assert.ok(fs.existsSync(path.join(root, 'docs/DASHBOARD_SPLIT_MAP.md')));
});
