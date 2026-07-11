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
  assert.match(src, /F8/);
  assert.match(src, /Z-REPORT|zReportHtml/);
});

test('dashboard loads competitive-ops in critical path', () => {
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(html, /competitive-ops\.js|critical\.bundle\.js/);
  assert.match(html, /v5[01]-20260711-wave/);
});

test('receipt engine supports thermal preference', () => {
  const src = fs.readFileSync(path.join(root, 'assets/receipt.js'), 'utf8');
  assert.match(src, /preferThermal|thermal|compileThermalPDF/);
});

test('allocateBillNo supports channel series', () => {
  const src = fs.readFileSync(path.join(root, 'assets/dashboard.js'), 'utf8');
  assert.match(src, /chCode|RS-DI|allocateBillNo\(existingBills/);
  assert.match(src, /refundedBy|bill\.refund/);
});

test('service worker caches competitive-ops', () => {
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert.match(sw, /competitive-ops\.js/);
  assert.match(sw, /wave[34]/i);
});

test('features-shell has WhatsApp PDF mode setting', () => {
  const src = fs.readFileSync(path.join(root, 'assets/features-shell.js'), 'utf8');
  assert.match(src, /WhatsApp bill PDF|Fast thermal|Exact preview/i);
});
