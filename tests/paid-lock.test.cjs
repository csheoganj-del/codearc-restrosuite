'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('activate_plan exists on razorpay-route', () => {
  const src = read('supabase/functions/razorpay-route/index.ts');
  assert.match(src, /action === ["']activate_plan["']/);
  assert.match(src, /fetchRazorpayPayment/);
  assert.match(src, /Paid amount does not match|activatePaidPlanFromPayment/);
});

test('webhook processes payment.captured without requiring a subscription entity', () => {
  const src = read('supabase/functions/razorpay-webhook/index.ts');
  assert.match(src, /case ["']payment.captured["']/);
  assert.doesNotMatch(
    src,
    /No subscription entity in event[\s\S]{0,80}return new Response\("OK"/,
  );
  assert.match(src, /activatePaidPlanFromPayment/);
  assert.match(src, /settleBillFromPayment/);
  assert.match(src, /processed_webhook_events"\)\.delete/);
});

test('empty subscription_status is never treated as active', () => {
  const files = [
    'supabase/functions/license-lease/index.ts',
    'supabase/functions/tenant-data/index.ts',
    'supabase/functions/tenant-public/index.ts',
    'supabase/functions/tenant-users/index.ts',
    'supabase/functions/tenant-access/index.ts',
    'supabase/functions/_shared/paid-access.ts',
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(
      src,
      /status \|\| ["']active["']/,
      `${f} still defaults missing status to active`,
    );
    assert.doesNotMatch(
      src,
      /status \?\? ["']active["']/,
      `${f} still defaults missing status to active`,
    );
  }
});

test('signed paid-until date keeps the app open offline until those days end', () => {
  const guardPath = path.join(root, 'assets', 'license-guard.js');
  const src = fs.readFileSync(guardPath, 'utf8');
  const cfg = {
    MODE: 'enforce',
    BOOTSTRAP_GRACE_MS: 3 * 24 * 60 * 60 * 1000,
    PRE_EXPIRY_WARN_MS: 0,
    OFFLINE_GRACE_MS: 24 * 60 * 60 * 1000,
    CLOCK_SKEW_TOLERANCE_MS: 15 * 60 * 1000,
    CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * 60 * 60 * 1000,
  };
  const rootObj = { RS_LICENSE_CONFIG: cfg };
  const moduleObj = { exports: {} };
  const sandbox = {
    window: rootObj,
    globalThis: rootObj,
    module: moduleObj,
    exports: moduleObj.exports,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    navigator: { onLine: false },
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
      body: { appendChild() {} },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'license-guard.js' });
  const api = sandbox.module.exports;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const stillPaid = api.evaluateLicense({
    verified: true,
    claims: {
      lease_expires_at: now + (2 * DAY),
      plan_expires_at: now + (20 * DAY),
    },
    now,
    hwm: now,
    firstSeen: now - DAY,
    killed: false,
    online: false,
    hasSession: true,
    cfg,
  });
  assert.equal(stillPaid.locked, false);
  assert.equal(stillPaid.reason, 'valid');
  assert.ok(stillPaid.msUntilExpiry > 19 * DAY);

  const daysOver = api.evaluateLicense({
    verified: true,
    claims: {
      lease_expires_at: now - DAY,
      plan_expires_at: now - (2 * DAY),
    },
    now,
    hwm: now,
    firstSeen: now - (10 * DAY),
    killed: false,
    online: false,
    hasSession: true,
    cfg,
  });
  assert.equal(daysOver.locked, true);
  assert.equal(daysOver.reason, 'lease_expired');

  const afterLeaseGone = api.evaluateLicense({
    verified: false,
    claims: null,
    now,
    hwm: now,
    firstSeen: now,
    everLeased: true,
    killed: false,
    online: false,
    hasSession: true,
    cfg,
  });
  assert.equal(afterLeaseGone.locked, true);
  assert.equal(afterLeaseGone.reason, 'no_lease');

  const killed = api.evaluateLicense({
    verified: false,
    claims: null,
    now,
    hwm: 0,
    firstSeen: now,
    killed: true,
    online: false,
    hasSession: true,
    cfg,
  });
  assert.equal(killed.locked, true);
  assert.equal(killed.reason, 'killed');
});

test('plan checkout requires server activatePlan before showing live', () => {
  const src = read('assets/features-shell.js');
  assert.match(src, /RS_API\.activatePlan/);
  assert.match(src, /plan is not active yet/);
  assert.doesNotMatch(src, /Paid — activation pending/);
});

test('guest bill settle goes to tenant-public settle_bill', () => {
  const bill = read('bill.html');
  const pub = read('supabase/functions/tenant-public/index.ts');
  assert.match(bill, /action: 'settle_bill'/);
  assert.match(pub, /action === ["']settle_bill["']/);
  assert.match(pub, /settleBillFromPayment/);
});

test('captured payments ledger migration exists', () => {
  const src = read('supabase/migrations/20260919000000_paid_lock_hardening.sql');
  assert.match(src, /saas_captured_payments/);
  assert.match(src, /razorpay_payment_id/);
});
