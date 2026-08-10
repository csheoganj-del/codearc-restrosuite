'use strict';
/**
 * Utility / 10x go-live gates — source-level checks for owner-facing polish.
 * Complements browser e2e; fails CI if regressions reappear.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('version story: desktop appVersion + owner-facing pill language', () => {
  const dash = read('assets/dashboard.js');
  const preload = read('desktop/preload.js');
  assert.match(preload, /appVersion/);
  assert.match(dash, /App .* · /);
  assert.match(dash, /shellVer|appVersion/);
  assert.match(dash, /Features/);
});

test('display density / zoom feature is removed', () => {
  const polish = read('assets/modules/product-polish-18.js');
  const css = read('assets/modules/product-polish-18.css');
  const shell = read('assets/features-shell.js');
  assert.match(polish, /removeDensityFeatureCompletely|REMOVED/);
  assert.doesNotMatch(css, /zoom:\s*0\.9|zoom:\s*1\.12/);
  assert.doesNotMatch(shell, /device-display.*Display \(this device\)/);
  assert.doesNotMatch(polish, /injectSidebarDensityEntry/);
});

test('bills page has no developer filter tip', () => {
  const html = read('dashboard.html');
  assert.doesNotMatch(html, /Date chips control stats/);
  assert.doesNotMatch(html, /bills-filter-hint/);
  assert.doesNotMatch(html, /Ã—/);
});

test('receipt print mode settings exist (HTML + thermal text)', () => {
  const shell = read('assets/features-shell.js');
  const bridge = read('assets/print-bridge.js');
  const ops = read('assets/competitive-ops.js');
  assert.match(shell, /Receipt print mode/);
  assert.match(shell, /HTML \+ QR \(recommended\)/);
  assert.match(shell, /Thermal text \(fast\)/);
  assert.match(bridge, /set_receipt_print_mode|forceRawThermal/);
  assert.match(ops, /preferRawEscPosThermal|set_receipt_print_mode/);
});

test('silent print restores Windows default printer (file-backed)', () => {
  const main = read('desktop/main.js');
  assert.match(main, /print-default-restore\.json/);
  assert.match(main, /recoverPendingDefaultPrinter|persistPendingRestore/);
  assert.match(main, /kiosk-printing/);
  // Multiple restore attempts
  assert.match(main, /setTimeout\(\s*\(\)\s*=>\s*\{\s*restoreDefault/);
});

test('owner first-hour checklist module wired', () => {
  const html = read('dashboard.html');
  const mod = read('assets/modules/owner-first-hour.js');
  assert.match(html, /owner-first-hour\.js/);
  assert.match(mod, /Open for business|RSOwnerFirstHour/);
  assert.match(mod, /WhatsApp linked · OK|Start selling/);
  // User-visible strings only (code may mention APIs in comments/identifiers)
  assert.doesNotMatch(mod, /ECONNREFUSED|stackTrace|Bearer [A-Za-z0-9]/);
});

test('WhatsApp topbar uses plain owner language', () => {
  const shell = read('assets/features-shell.js');
  assert.match(shell, /WhatsApp linked · OK|WhatsApp working/);
  assert.match(shell, /WhatsApp not linked/);
  // Avoid dumping raw gateway JSON into titles
  assert.doesNotMatch(shell, /title = JSON\.stringify\(res/);
});

test('go-live daily checklist doc exists', () => {
  const doc = read('docs/GO_LIVE_DAILY_CHECKLIST.md');
  assert.match(doc, /Test print/);
  assert.match(doc, /WhatsApp linked/);
  assert.match(doc, /Weekly burn-in/);
});

test('no A-like mojibake close glyph in primary UI sources', () => {
  const files = [
    'dashboard.html',
    'assets/dashboard.js',
    'assets/features-shell.js',
    'assets/modules/bills-history.js',
  ];
  for (const f of files) {
    const t = read(f);
    assert.doesNotMatch(t, /Ã—/, f + ' still has broken close glyph');
    assert.doesNotMatch(t, /â‚¹/, f + ' still has broken rupee');
  }
});
