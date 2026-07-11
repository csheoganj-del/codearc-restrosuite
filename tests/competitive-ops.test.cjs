'use strict';
/**
 * Smoke checks for Wave 3 competitive-ops surface area.
 * Run: node --test tests/competitive-ops.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('competitive-ops.js exists and exposes core APIs', () => {
  const src = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  assert.match(src, /RSOps/);
  assert.match(src, /openShift/);
  assert.match(src, /closeShift/);
  assert.match(src, /getStationLabel/);
  assert.match(src, /printKotThermal/);
  assert.match(src, /printBillThermal/);
  assert.match(src, /checkNewPendingOrders|installFloorOrderAlerts/);
  assert.match(src, /F8/);
  assert.match(src, /Z-REPORT|zReportHtml/);
});

test('dashboard loads competitive-ops in critical path', () => {
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /competitive-ops\.js|critical\.bundle\.js/);
  assert.match(html, /v[5-7][0-9]-20260711/);
});

test('bill settled modal has thermal print action', () => {
  const src = fs.readFileSync(path.join(root, 'assets/features-pos.js'), 'utf8');
  assert.match(src, /rc-thermal/);
  assert.match(src, /printBillThermal|printBillEscPos/);
});

test('QR orders UI prioritizes pending attention', () => {
  const src = fs.readFileSync(path.join(root, 'assets/modules/qr-orders-ui.js'), 'utf8');
  assert.match(src, /needs-attention/);
  assert.match(src, /data-pos/);
});

test('waiter floor opens table into POS and can transfer', () => {
  const src = fs.readFileSync(path.join(root, 'assets/features-growth.js'), 'utf8');
  assert.match(src, /openTableInPos/);
  assert.match(src, /transferTable/);
  assert.match(src, /Checkout|loadOrder/);
});

test('auto-print receipt wires bill-paid to thermal', () => {
  const ops = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  const pos = fs.readFileSync(path.join(root, 'assets/features-pos.js'), 'utf8');
  const bills = fs.readFileSync(path.join(root, 'assets/modules/bills-history.js'), 'utf8');
  assert.match(ops, /set_auto_print_receipt/);
  assert.match(ops, /printBillThermal/);
  assert.match(pos, /detail:\s*\{[\s\S]*bill/);
  assert.match(bills, /thermal-act/);
});

test('online aggregator: demo seed, POS open, accept KOT', () => {
  const src = fs.readFileSync(path.join(root, 'assets/features-growth.js'), 'utf8');
  assert.match(src, /seedDemoOnlineOrder/);
  assert.match(src, /openOnlineOrderInPos/);
  assert.match(src, /Accept \+ KOT|printKot/);
  assert.match(src, /__rsOnlineNewCount/);
});

test('split pay has fill-remaining chips', () => {
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const pos = fs.readFileSync(path.join(root, 'assets/features-pos.js'), 'utf8');
  assert.match(html, /split-quick-fill|data-split-fill/);
  assert.match(pos, /fillSplitRemaining/);
});

test('tip, service charge pct, and cash drawer APIs', () => {
  const posUi = fs.readFileSync(path.join(root, 'assets/modules/pos-ui.js'), 'utf8');
  const esc = fs.readFileSync(path.join(root, 'assets/escpos-encoder.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'assets/print-bridge.js'), 'utf8');
  const ops = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const receipt = fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8');
  assert.match(posUi, /tipAmount|tip\b/);
  assert.match(posUi, /set_service_charge_pct/);
  assert.match(html, /tip-input|data-tip-pct/);
  assert.match(esc, /cashDrawer|openDrawerBase64/);
  assert.match(bridge, /openCashDrawer/);
  assert.match(ops, /openCashDrawer|billHasCashTender/);
  assert.match(receipt, /tipAmount/);
});

test('delivery in totals, Z tips, rebill void polish', () => {
  const posUi = fs.readFileSync(path.join(root, 'assets/modules/pos-ui.js'), 'utf8');
  const ops = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  const bills = fs.readFileSync(path.join(root, 'assets/modules/bills-history.js'), 'utf8');
  const receipt = fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8');
  assert.match(posUi, /deliveryCharge/);
  assert.match(ops, /tipsTotal|serviceChargeTotal|deliveryTotal/);
  assert.match(bills, /rebillToPos|rebill-act/);
  assert.match(bills, /Void \/ Refund|voided/);
  assert.match(receipt, /deliveryCharge/);
});

test('loyalty earn redeem APIs', () => {
  const ops = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  const posUi = fs.readFileSync(path.join(root, 'assets/modules/pos-ui.js'), 'utf8');
  const pos = fs.readFileSync(path.join(root, 'assets/features-pos.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'assets/features-shell.js'), 'utf8');
  assert.match(ops, /RSLoyalty|applyLoyaltyEarnToCustomer|paintBanner/);
  assert.match(posUi, /loyaltyRedeem|setLoyaltyRedeem/);
  assert.match(pos, /loyaltyRedeemAmount|loyaltyPointsUsed/);
  assert.match(shell, /Loyalty program|Loyalty earn rate/);
});

test('happy hour and manager PIN require()', () => {
  const posUi = fs.readFileSync(path.join(root, 'assets/modules/pos-ui.js'), 'utf8');
  const saas = fs.readFileSync(path.join(root, 'assets/saas-core.js'), 'utf8');
  const pos = fs.readFileSync(path.join(root, 'assets/features-pos.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'assets/features-shell.js'), 'utf8');
  assert.match(posUi, /isHappyHourActive|effectiveMenuPrice|set_happy_hour/);
  assert.match(saas, /requirePin|require:\s*requirePin/);
  assert.match(pos, /set_pin_gate_due|set_pin_gate_clear_cart/);
  assert.match(shell, /Happy hour|Pin gate due|Optional manager gates/);
});

test('low-stock auto PO and CSV export', () => {
  const inv = fs.readFileSync(path.join(root, 'assets/modules/inventory-ui.js'), 'utf8');
  const ops = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(inv, /confirmAndDraftPos|exportLowStockCsv|buildPoRowsFromLow/);
  assert.match(inv, /printPurchaseOrder|auto_reorder/);
  assert.match(ops, /Low stock|__rsLowStockCount/);
  assert.match(html, /btn-export-low-stock|btn-auto-draft-pos/);
});

test('receive stock against purchase order', () => {
  const manage = fs.readFileSync(path.join(root, 'assets/features-manage.js'), 'utf8');
  assert.match(manage, /receivePurchaseOrder/);
  assert.match(manage, /data-po-recv|Receive stock/);
  assert.match(manage, /parsePoLines/);
  assert.match(manage, /status:\s*'received'|receivedAt/);
});

test('partial receive and cancel purchase order', () => {
  const manage = fs.readFileSync(path.join(root, 'assets/features-manage.js'), 'utf8');
  assert.match(manage, /openReceiveModal|linesToReceive|remainingPoLines/);
  assert.match(manage, /cancelPurchaseOrder|partial/);
  assert.match(manage, /receivedLines|data-po-cancel|poListFilter/);
});

test('waste log deducts inventory stock', () => {
  const manage = fs.readFileSync(path.join(root, 'assets/features-manage.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(manage, /logWasteEntry|waste_log/);
  assert.match(manage, /exportWasteCsv|item\.stock/);
  assert.match(html, /data-inv-tab="waste"|Waste log/);
});

test('POS promo codes: totals, apply, receipt, settings', () => {
  const ops = fs.readFileSync(path.join(root, 'assets/competitive-ops.js'), 'utf8');
  const posUi = fs.readFileSync(path.join(root, 'assets/modules/pos-ui.js'), 'utf8');
  const pos = fs.readFileSync(path.join(root, 'assets/features-pos.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'assets/features-shell.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const receipt = fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8');
  assert.match(ops, /RSPromo|applyPromoCode|findOfferByCode|wirePromoUi/);
  assert.match(ops, /WELCOME10|set_demo_promo_code|set_pos_promo_codes/);
  assert.match(posUi, /activePromo|setPromo|clearPromo|promoOff/);
  assert.match(pos, /promoCode|promoAmount|promoOfferId/);
  assert.match(shell, /POS promo codes|Demo promo code|Demo promo pct/);
  assert.match(html, /promo-input|promo-apply|promo-clear|promo-applied-badge/);
  assert.match(receipt, /promoAmount|promoCode/);
});

test('receipt engine supports thermal preference', () => {
  const src = fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8');
  assert.match(src, /preferThermal|thermal|compileThermalPDF/);
});

test('allocateBillNo supports channel series', () => {
  const dash = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  const identity = fs.readFileSync(path.join(root, 'assets/modules/bill-identity.js'), 'utf8');
  const billsUi = fs.readFileSync(path.join(root, 'assets/modules/bills-history.js'), 'utf8');
  assert.match(dash + identity, /chCode|RS-DI|allocateBillNo\(existingBills/);
  // Wave 6: refund audit metadata lives in bills-history module
  assert.match(billsUi, /refundedBy|bill\.refund|bill\.refunded/);
});

test('service worker caches competitive-ops', () => {
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(sw, /competitive-ops\.js/);
  assert.match(sw, /bills-history\.js/);
  assert.match(sw, /restrosuite-shell-v\d{8}/i);
});

test('features-shell has WhatsApp PDF mode setting', () => {
  const src = fs.readFileSync(path.join(root, 'assets/features-shell.js'), 'utf8');
  assert.match(src, /WhatsApp bill PDF|Fast thermal|Exact preview/i);
});
