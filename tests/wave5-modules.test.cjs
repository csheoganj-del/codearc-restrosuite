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
  assert.match(html, /v52-20260711-wave5/);
});

test('playwright config present', () => {
  assert.ok(fs.existsSync(path.join(root, 'playwright.config.cjs')));
  assert.ok(fs.existsSync(path.join(root, 'tests/e2e/smoke.spec.cjs')));
});
