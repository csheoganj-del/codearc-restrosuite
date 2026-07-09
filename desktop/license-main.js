/* ============================================================================
   RestroSuite Desktop — main-process license gate
   ----------------------------------------------------------------------------
   The renderer runs the same license-guard.js as the web app, but a renderer
   check alone is inspectable/bypassable. This module re-verifies the lease in
   the Electron MAIN process (Node, outside the page) BEFORE the app window is
   allowed to load the dashboard, and persists the lease encrypted at rest with
   Windows DPAPI (via Electron safeStorage). If the lease is missing, expired,
   tampered, or the clock was rolled back, main loads a native lock page instead
   of the app.

   Signature: ECDSA P-256 / SHA-256. Deno signs in IEEE-P1363 (raw r||s); Node
   verifies with dsaEncoding:'ieee-p1363'. The DECISION policy is the exact pure
   function shipped in assets/license-guard.js (required below), so desktop and
   web can never drift.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let _cfg = null;
let _evaluate = null;
let _statePath = null;
let _safeStorage = null;

function loadConfigAndPolicy(webRoot) {
  // The web assets are copied into the desktop app root; require the exact same
  // config + policy the renderer uses.
  const cfgPath = path.join(webRoot, 'assets', 'license-config.js');
  const guardPath = path.join(webRoot, 'assets', 'license-guard.js');
  _cfg = require(cfgPath);
  try {
    const guard = require(guardPath);
    _evaluate = guard.evaluateLicense;
  } catch (e) {
    // Fallback: minimal inline mirror of the decision so a packaging quirk in
    // the guard require never bricks startup. Kept intentionally tiny.
    _evaluate = inlineEvaluate;
    console.warn('[license-main] using inline policy fallback:', e.message);
  }
}

function inlineEvaluate(input) {
  const cfg = input.cfg || {};
  const now = input.now, hwm = input.hwm || 0, skew = 60 * 1000;
  if (hwm && now < hwm - skew) return { allow: false, locked: true, reason: 'clock_rollback' };
  if (!input.verified || !input.claims) {
    const fs2 = input.firstSeen || 0;
    if (!fs2) return { allow: true, locked: false, reason: 'bootstrap_start' };
    if (now <= fs2 + (cfg.BOOTSTRAP_GRACE_MS || 0)) return { allow: true, locked: false, reason: 'bootstrap_grace' };
    return { allow: false, locked: true, reason: 'no_lease' };
  }
  const exp = Number(input.claims.lease_expires_at || 0);
  if (!exp) return { allow: false, locked: true, reason: 'lease_no_expiry' };
  if (now > exp) return { allow: false, locked: true, reason: 'lease_expired' };
  return { allow: true, locked: false, reason: 'valid', msUntilExpiry: exp - now };
}

/* ---------- encrypted state at rest (DPAPI via safeStorage) ---------- */
function encrypt(plain) {
  try {
    if (_safeStorage && _safeStorage.isEncryptionAvailable()) {
      return 'v1:' + _safeStorage.encryptString(plain).toString('base64');
    }
  } catch (e) {}
  // Fallback (no OS keychain): still not plaintext-obvious, but note it.
  return 'p0:' + Buffer.from(plain, 'utf8').toString('base64');
}
function decrypt(stored) {
  if (!stored) return null;
  try {
    if (stored.startsWith('v1:')) {
      return _safeStorage.decryptString(Buffer.from(stored.slice(3), 'base64'));
    }
    if (stored.startsWith('p0:')) {
      return Buffer.from(stored.slice(3), 'base64').toString('utf8');
    }
  } catch (e) {}
  return null;
}
function readState() {
  try {
    const raw = fs.readFileSync(_statePath, 'utf8');
    const dec = decrypt(raw);
    const st = dec ? JSON.parse(dec) : {};
    return { lease: st.lease || '', hwm: Number(st.hwm || 0), firstSeen: Number(st.firstSeen || 0) };
  } catch (e) {
    return { lease: '', hwm: 0, firstSeen: 0 };
  }
}
function writeState(st) {
  try {
    fs.mkdirSync(path.dirname(_statePath), { recursive: true });
    fs.writeFileSync(_statePath, encrypt(JSON.stringify(st)), { mode: 0o600 });
  } catch (e) {
    console.warn('[license-main] could not persist license state:', e.message);
  }
}

/* ---------- ECDSA P-256 verify (Node) ---------- */
let _pubKey = null;
function publicKey() {
  if (!_pubKey) {
    const der = Buffer.from(_cfg.RS_LICENSE_PUBLIC_KEY_SPKI_B64, 'base64');
    _pubKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  }
  return _pubKey;
}
function b64urlToBuf(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s, 'base64');
}
function verifyLease(token) {
  if (!token || typeof token !== 'string') return { ok: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false };
  try {
    const ok = crypto.verify(
      'sha256',
      Buffer.from(parts[0], 'utf8'),
      { key: publicKey(), dsaEncoding: 'ieee-p1363' },
      b64urlToBuf(parts[1])
    );
    if (!ok) return { ok: false };
    const claims = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
    return { ok: true, claims };
  } catch (e) {
    return { ok: false };
  }
}

/* ---------- public API ---------- */
function init({ userDataDir, webRoot, safeStorage }) {
  _statePath = path.join(userDataDir, 'license-state.enc');
  _safeStorage = safeStorage || null;
  loadConfigAndPolicy(webRoot);
}

// Persist a lease handed up from the renderer's guard (via IPC).
function persistLease(leaseToken, serverTimeMs) {
  const st = readState();
  const now = Date.now();
  const next = {
    lease: leaseToken || '',
    hwm: Math.max(st.hwm || 0, Number(serverTimeMs || 0), now),
    firstSeen: st.firstSeen || now
  };
  writeState(next);
  return next;
}

// Decide whether the app window may load the dashboard. Also bumps the HWM by
// "now" (launching is a time observation) and records firstSeen on first run.
function gate() {
  const st = readState();
  const now = Date.now();
  const hwm = Math.max(st.hwm || 0, now);
  const verified = verifyLease(st.lease);
  const decision = _evaluate({
    verified: verified.ok,
    claims: verified.ok ? verified.claims : null,
    now,
    hwm,
    firstSeen: st.firstSeen,
    cfg: _cfg
  });
  // Persist bumped hwm + firstSeen (bounds bootstrap grace on a fresh device).
  writeState({ lease: st.lease, hwm, firstSeen: st.firstSeen || now });
  return decision;
}

module.exports = { init, gate, persistLease, verifyLease, _readState: readState };
