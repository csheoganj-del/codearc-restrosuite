#!/usr/bin/env node
/* ============================================================================
   RestroSuite — license guard test harness
   ----------------------------------------------------------------------------
   Signs leases exactly the way the license-lease Edge Function does (ECDSA
   P-256, WebCrypto raw/IEEE-P1363 signature) using the DEV private key, then
   runs the EXACT shipped decision logic:
     • assets/license-guard.js       (browser/PWA/Android-WebView guard)
     • desktop/license-main.js       (Electron main-process verifier)

   Run:  node scripts/generate-license-keys.js --dev   (once)
         node scripts/test-license-guard.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;

const ROOT = path.join(__dirname, '..');
const CFG = require(path.join(ROOT, 'assets', 'license-config.js'));
const GUARD = require(path.join(ROOT, 'assets', 'license-guard.js'));
const DESKTOP = require(path.join(ROOT, 'desktop', 'license-main.js'));

// Initialise the desktop verifier against the repo assets (no safeStorage).
DESKTOP.init({ userDataDir: os.tmpdir(), webRoot: ROOT, safeStorage: null });

const DAY = 24 * 60 * 60 * 1000;

/* ---------- helpers ---------- */
function b64url(bytes) {
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function loadDevKeyB64() {
  const p = path.join(__dirname, '.license-signing-key.dev.b64');
  if (!fs.existsSync(p)) {
    console.error('Missing dev key. Run: node scripts/generate-license-keys.js --dev');
    process.exit(2);
  }
  return fs.readFileSync(p, 'utf8').trim();
}
async function importPrivate(b64pkcs8) {
  return subtle.importKey('pkcs8', Buffer.from(b64pkcs8, 'base64'),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
async function signLease(claims, key) {
  const payloadEncoded = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    Buffer.from(payloadEncoded, 'utf8'));
  return payloadEncoded + '.' + b64url(new Uint8Array(sig));
}

/* ---------- tiny assert framework ---------- */
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

async function main() {
  const key = await importPrivate(loadDevKeyB64());
  const now = Date.now();
  const baseClaims = {
    v: 1, tenant_id: 't-123', device_id: 'dev-abc', plan: 'growth',
    subscription_status: 'active', plan_expires_at: now + 200 * DAY,
    issued_at: now, lease_expires_at: now + 3 * DAY, server_time: now,
  };

  const validLease = await signLease(baseClaims, key);
  const expiredLease = await signLease({ ...baseClaims, lease_expires_at: now - DAY }, key);
  const soonLease = await signLease({ ...baseClaims, lease_expires_at: now + (DAY / 2) }, key);
  // Tamper: flip a char in the payload but keep the signature.
  const tampered = (function () {
    const [p, s] = validLease.split('.');
    const buf = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      .replace('growth', 'enterp'); // change plan -> signature no longer matches
    const p2 = b64url(Buffer.from(buf, 'utf8'));
    return p2 + '.' + s;
  })();

  /* ===== 1. Signature verification (browser guard) ===== */
  console.log('\n[1] Signature verification (assets/license-guard.js)');
  check('valid lease verifies', (await GUARD.verifyLeaseCore(validLease)).ok === true);
  check('tampered lease rejected', (await GUARD.verifyLeaseCore(tampered)).ok === false);
  check('garbage token rejected', (await GUARD.verifyLeaseCore('not.a.lease')).ok === false);
  check('empty token rejected', (await GUARD.verifyLeaseCore('')).ok === false);

  /* ===== 2. Signature verification (desktop main verifier, Node crypto) ===== */
  console.log('\n[2] Signature verification (desktop/license-main.js)');
  check('valid lease verifies (desktop)', DESKTOP.verifyLease(validLease).ok === true);
  check('tampered lease rejected (desktop)', DESKTOP.verifyLease(tampered).ok === false);
  check('claims parsed (desktop)', DESKTOP.verifyLease(validLease).claims.tenant_id === 't-123');

  /* ===== 3. Decision policy (evaluateLicense) ===== */
  console.log('\n[3] Decision policy (evaluateLicense)');
  const ev = (o) => GUARD.evaluateLicense(Object.assign({ cfg: CFG }, o));

  check('valid + unexpired -> allow',
    ev({ verified: true, claims: baseClaims, now, hwm: now, firstSeen: now - DAY }).allow === true);

  check('expired lease -> locked',
    ev({ verified: true, claims: { ...baseClaims, lease_expires_at: now - DAY }, now, hwm: now, firstSeen: now - DAY }).locked === true);

  check('clock rollback -> locked',
    ev({ verified: true, claims: baseClaims, now: now - 5 * DAY, hwm: now, firstSeen: now - 10 * DAY }).reason === 'clock_rollback');

  check('no lease, first ever run -> allow (bootstrap start)',
    ev({ verified: false, claims: null, now, hwm: 0, firstSeen: 0 }).allow === true);

  check('no lease, within bootstrap grace -> allow',
    ev({ verified: false, claims: null, now, hwm: now, firstSeen: now - DAY }).allow === true);

  check('no lease, past bootstrap grace -> locked',
    ev({ verified: false, claims: null, now, hwm: now, firstSeen: now - 5 * DAY }).locked === true);

  check('pre-expiry warning flag set',
    ev({ verified: true, claims: { ...baseClaims, lease_expires_at: now + (DAY / 2) }, now, hwm: now, firstSeen: now - DAY }).warn === true);

  check('monitor mode never blocks',
    GUARD.evaluateLicense({ cfg: Object.assign({}, CFG, { MODE: 'monitor' }),
      verified: false, claims: null, now, hwm: now, firstSeen: now - 90 * DAY }).allow === true);

  /* ===== 4. End-to-end: sign -> verify -> decide ===== */
  console.log('\n[4] End-to-end (sign -> verify -> decide)');
  for (const [label, token, expectAllow] of [
    ['valid lease', validLease, true],
    ['expired lease', expiredLease, false],
    ['soon-to-expire lease (allow + warn)', soonLease, true],
  ]) {
    const v = await GUARD.verifyLeaseCore(token);
    const d = ev({ verified: v.ok, claims: v.ok ? v.claims : null, now, hwm: now, firstSeen: now - DAY });
    check(label + ' -> ' + (expectAllow ? 'allow' : 'lock'), d.allow === expectAllow);
  }

  console.log('\n============================================================');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('============================================================');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
