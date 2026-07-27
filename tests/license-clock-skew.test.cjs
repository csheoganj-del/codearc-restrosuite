/**
 * Pure license decision tests — clock skew polish.
 * Loads license-guard evaluateLicense via vm (no DOM).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEvaluateLicense() {
  const guardPath = path.join(__dirname, '..', 'assets', 'license-guard.js');
  const src = fs.readFileSync(guardPath, 'utf8');
  // Extract evaluateLicense by running a minimal sandbox that only defines the pure function
  // The IIFE assigns to root.RSLicenseGuard — we stub root.
  const root = { RS_LICENSE_CONFIG: {
    MODE: 'enforce',
    BOOTSTRAP_GRACE_MS: 0,
    PRE_EXPIRY_WARN_MS: 0,
    CLOCK_SKEW_TOLERANCE_MS: 15 * 60 * 1000,
    CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * 60 * 60 * 1000,
  } };
  const moduleObj = { exports: {} };
  const sandbox = {
    window: root,
    globalThis: root,
    module: moduleObj,
    exports: moduleObj.exports,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { onLine: true },
    document: { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {} } },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'license-guard.js' });
  // CJS path: module.exports; browser path: root.RSLicense
  const api = sandbox.module && sandbox.module.exports
    ? sandbox.module.exports
    : (root.RSLicense || root.RSLicenseGuard);
  assert.ok(api && typeof api.evaluateLicense === 'function', 'evaluateLicense export missing');
  return api.evaluateLicense;
}

const evaluateLicense = loadEvaluateLicense();
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

test('small clock glitch under 15m does not lock', () => {
  const now = Date.UTC(2026, 6, 27, 12, 0, 0);
  const hwm = now + 10 * MIN; // clock 10 min behind HWM
  const r = evaluateLicense({
    verified: true,
    claims: { lease_expires_at: now + 24 * HOUR },
    now,
    hwm,
    firstSeen: now - HOUR,
    killed: false,
    cfg: { MODE: 'enforce', CLOCK_SKEW_TOLERANCE_MS: 15 * MIN, CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * HOUR },
  });
  assert.equal(r.locked, false);
  assert.equal(r.reason, 'valid');
});

test('large clock rollback without live lease locks', () => {
  const now = Date.UTC(2026, 6, 27, 12, 0, 0);
  const hwm = now + 2 * HOUR;
  const r = evaluateLicense({
    verified: false,
    claims: null,
    now,
    hwm,
    firstSeen: now - 10 * HOUR,
    killed: false,
    cfg: {
      MODE: 'enforce',
      BOOTSTRAP_GRACE_MS: 0,
      CLOCK_SKEW_TOLERANCE_MS: 15 * MIN,
      CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * HOUR,
    },
  });
  assert.equal(r.locked, true);
  assert.equal(r.reason, 'clock_rollback');
});

test('offline grace: valid lease survives multi-hour NTP glitch under 4h', () => {
  const now = Date.UTC(2026, 6, 27, 12, 0, 0);
  const hwm = now + 2 * HOUR; // 2h behind — above 15m, under 4h offline grace
  const r = evaluateLicense({
    verified: true,
    claims: { lease_expires_at: now + 48 * HOUR },
    now,
    hwm,
    firstSeen: now - HOUR,
    killed: false,
    cfg: {
      MODE: 'enforce',
      CLOCK_SKEW_TOLERANCE_MS: 15 * MIN,
      CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * HOUR,
    },
  });
  assert.equal(r.locked, false);
  assert.equal(r.reason, 'valid');
});

test('extreme clock rollback even with lease locks when beyond offline grace', () => {
  const now = Date.UTC(2026, 6, 27, 12, 0, 0);
  const hwm = now + 12 * HOUR;
  const r = evaluateLicense({
    verified: true,
    claims: { lease_expires_at: now + 48 * HOUR },
    now,
    hwm,
    firstSeen: now - HOUR,
    killed: false,
    cfg: {
      MODE: 'enforce',
      CLOCK_SKEW_TOLERANCE_MS: 15 * MIN,
      CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * HOUR,
    },
  });
  assert.equal(r.locked, true);
  assert.equal(r.reason, 'clock_rollback');
});
