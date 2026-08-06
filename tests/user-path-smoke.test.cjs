'use strict';
/**
 * User-path smoke: verifies shipped packs are wired end-to-end in source.
 * Not a browser e2e — catches missing UI / API / bill field regressions.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('asset version and SW cache present', () => {
  const html = read('dashboard.html');
  const sw = read('service-worker.js');
  assert.match(html, /builtin = 'v\d+-\d{8}-/);
  assert.match(sw, /const CACHE_NAME = ['"]restrosuite-shell-v/);
});

test('POS calm mode: customer collapse, pay zone, more tools, no bare demo on html', () => {
  const html = read('dashboard.html');
  const ops = read('assets/competitive-ops.js');
  const posUi = read('assets/modules/pos-ui.js');
  const css = read('assets/dashboard.css');
  assert.match(html, /cart-cust-toggle|Add customer/);
  assert.match(html, /cart-pay-zone|cart-empty-hint/);
  assert.match(html, /pos-display-opts|pos-toolbar-secondary/);
  assert.match(ops, /ensurePosQuickTools|rs-pos-more|canShowDemoTools/);
  assert.match(ops, /Counter 1|rs_station_label_friendly/);
  assert.match(ops, /rs-shift-bar-closed|Open shift/);
  assert.match(posUi, /updatePosCartChrome|wireCartCustomerToggle/);
  assert.match(css, /pos-cart-empty|rs-pos-more-menu|cart-cust-toggle/);
});

test('super-admin early shell stamped before paint', () => {
  const html = read('dashboard.html');
  assert.match(html, /earlyRoleShell|logged_in_role/);
  assert.match(html, /rs-role-superadmin/);
  assert.match(html, /data-rs-shell/);
  assert.match(html, /tab-content:not\(#super-admin-tab\):not\(#sa-reports-tab\):not\(#sa-ads-tab\):not\(#gateway-monitor-tab\)/);
  assert.match(html, /Loading platform console/);
});

test('super-admin defines avatar colors locally (no bare avatarColors)', () => {
  const sa = read('assets/modules/super-admin.js');
  assert.match(sa, /function getAvatarColors/);
  assert.match(sa, /const avatarColors = getAvatarColors/);
  // Must not reference undeclared free variable from old dashboard closure
  assert.doesNotMatch(sa, /\$\{avatarColors\[name\.length%avatarColors\.length\]\}/);
});

test('super-admin polish: Active status, plan title case, platform summary selector', () => {
  const sa = read('assets/modules/super-admin.js');
  const html = read('dashboard.html');
  const gw = read('assets/modules/gateway-monitor.js');
  assert.match(sa, /function formatAccountStatus/);
  assert.match(sa, /approved:\s*'Active'/);
  assert.match(sa, /function formatPlanLabel/);
  assert.match(sa, /platformSummaryEl|super-admin-tab #saas-platform-summary/);
  assert.match(sa, /formatDisplayName|titleCaseWords/);
  assert.match(html, /id="manage-outlet-type"/);
  // Only one live platform summary host (no hidden growth-hub duplicate)
  const summaryIds = (html.match(/id="saas-platform-summary"/g) || []).length;
  assert.equal(summaryIds, 1);
  assert.match(gw, /humanizeGatewayEvent/);
  assert.match(gw, /friendlyErrorMessage/);
});

test('cashier path: tip promo covers notes cash drawer', () => {
  const posUi = read('assets/modules/pos-ui.js');
  const pos = read('assets/features-pos.js');
  const ops = read('assets/competitive-ops.js');
  const html = read('dashboard.html');
  const receipt = read('assets/receipt.js');

  // Tip + promo + covers on cart
  assert.match(html, /tip-input|data-tip-pct/);
  assert.match(html, /promo-input|promo-apply/);
  assert.match(html, /cart-covers/);
  assert.match(html, /cart-more-opts/);

  // Totals pipeline
  assert.match(posUi, /promoOff|activePromo|getCovers|setLineNote/);
  assert.match(pos, /promoCode|promoAmount|covers|pax|note:/);

  // Cash movements + Z
  assert.match(ops, /addCashMovement|openCashMovementModal|payInTotal|coversTotal/);
  assert.match(ops, /rs-cash-move/);

  // Receipt lines
  assert.match(receipt, /promoAmount|covers|note:/);
});

test('kitchen path: KOT notes + ESC/POS + KDS notes field', () => {
  const pos = read('assets/features-pos.js');
  const ops = read('assets/competitive-ops.js');
  const esc = read('assets/escpos-encoder.js');
  const dash = read('assets/dashboard.js');

  assert.match(pos, /notes:\s*i\.note|note:\s*i\.note/);
  assert.match(ops, /i\.note \|\| i\.notes/);
  assert.match(esc, /it\.note \|\| it\.notes/);
  assert.match(dash, /it\.notes/);
});

test('guest QR path: one-tap menu, filters, service, hub', () => {
  const order = read('order.html');
  const portal = read('qr-order.html');
  const growth = read('assets/features-growth.js');

  assert.match(order, /data-diet|editLineNote|svc-dock|lang-toggle|resetOrderKeepMenu/);
  assert.match(order, /create_notification|waiter_call/);
  assert.match(portal, /forceHub|goMenu|menuUrl/);
  assert.match(growth, /order\.html\?tenant=/);
  // No photo requirement — images optional only (allow newline before ?)
  assert.match(order, /item\.image\s*\?/);
});

test('floor + inventory packs still present', () => {
  const growth = read('assets/features-growth.js');
  const manage = read('assets/features-manage.js');
  const inv = read('assets/modules/inventory-ui.js');

  assert.match(growth, /openTableInPos|transferTable|seedDemoOnlineOrder/);
  assert.match(manage, /receivePurchaseOrder|logWasteEntry|waste_log/);
  assert.match(inv, /confirmAndDraftPos|exportLowStockCsv/);
});

test('loyalty happy hour PIN still wired', () => {
  const ops = read('assets/competitive-ops.js');
  const posUi = read('assets/modules/pos-ui.js');
  const shell = read('assets/features-shell.js');

  assert.match(ops, /RSLoyalty|RSPromo/);
  assert.match(posUi, /isHappyHourActive|effectiveMenuPrice/);
  assert.match(shell, /Happy hour|Loyalty program|POS promo codes|Pin gate cash move/);
});

test('role-first home for staff', () => {
  const dash = read('assets/dashboard.js');
  assert.match(dash, /ROLE_HOME_TAB/);
  assert.match(dash, /waiter:\s*['"]floor-tab['"]/);
  assert.match(dash, /kitchen:\s*['"]kds-tab['"]/);
});

test('cloud map packs bill ops + shift cash + offer discount without new tables', () => {
  const db = read('assets/db.js');
  assert.match(db, /taxProfile\._ops|_ops/);
  assert.match(db, /cashMovements/);
  assert.match(db, /discount_type|discount_value/);
  // waste_log is localStorage-backed (no cloud table) but still in the collection map
  assert.match(db, /waste_log:\s*\{/);
  assert.match(db, /Collections without a cloud table \(e\.g\. waste_log\)|waste_log/);
});

test('WA Ads closes completed progress before campaign bookkeeping', () => {
  const ads = read('assets/modules/sa-ads-portal.js');
  const finish = ads.indexOf('const closeDelay = failed ?');
  const history = ads.indexOf('const camp = {', finish);
  assert.ok(finish >= 0, 'missing completed-send progress close');
  assert.ok(history > finish, 'progress must close before campaign history work');
  assert.ok(ads.includes('prog.close(closeDelay)'));
  assert.ok(ads.includes('progressRoot && progressRoot.isConnected'));
});
