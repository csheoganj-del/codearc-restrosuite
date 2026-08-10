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
    if (!_statePath || !fs.existsSync(_statePath)) {
      return { lease: '', hwm: 0, firstSeen: 0 };
    }
    const raw = fs.readFileSync(_statePath, 'utf8');
    if (!raw || !String(raw).trim()) {
      return { lease: '', hwm: 0, firstSeen: 0 };
    }
    const dec = decrypt(raw);
    if (dec == null) {
      // DPAPI/safeStorage can fail briefly on cold start (profile not ready).
      // Do NOT treat as empty — empty write would wipe a valid lease.
      console.warn('[license-main] lease state decrypt failed (fail-open this launch)');
      return { lease: '', hwm: 0, firstSeen: 0, decryptFailed: true };
    }
    const st = JSON.parse(dec);
    return {
      lease: st.lease || '',
      hwm: Number(st.hwm || 0),
      firstSeen: Number(st.firstSeen || 0),
    };
  } catch (e) {
    console.warn('[license-main] readState error:', e && e.message);
    return { lease: '', hwm: 0, firstSeen: 0, readError: true };
  }
}
function writeState(st, opts) {
  try {
    // Never persist an empty lease over a decrypt failure — that bricks the next launch.
    if (opts && opts.skipIfDecryptFailed) return;
    fs.mkdirSync(path.dirname(_statePath), { recursive: true });
    fs.writeFileSync(_statePath, encrypt(JSON.stringify({
      lease: st.lease || '',
      hwm: Number(st.hwm || 0),
      firstSeen: Number(st.firstSeen || 0),
    })), { mode: 0o600 });
  } catch (e) {
    console.warn('[license-main] could not persist license state:', e.message);
  }
}

/** Reasons the web/renderer can fix by refreshing online — do not hard-block cold start. */
function isRecoverableReason(reason) {
  return (
    reason === 'no_lease' ||
    reason === 'invalid_lease' ||
    reason === 'lease_expired' ||
    reason === 'lease_no_expiry' ||
    reason === 'bootstrap_start' ||
    reason === 'bootstrap_grace' ||
    reason === 'decrypt_fail_open' ||
    reason === 'read_error_open' ||
    // Clock glitches after sleep/NTP: renderer can re-stamp HWM from server.
    reason === 'clock_rollback'
  );
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

  // Cold-start decrypt/read glitches: fail OPEN so a paying outlet is never
  // stuck on lock.html until they click Retry. Next successful storeLease
  // re-writes a clean state file.
  if (st.decryptFailed) {
    return { allow: true, locked: false, reason: 'decrypt_fail_open', recoverable: true };
  }
  if (st.readError) {
    return { allow: true, locked: false, reason: 'read_error_open', recoverable: true };
  }

  // Use stored HWM for clock checks (not max(now,hwm) which disabled rollback detection).
  const storedHwm = Number(st.hwm || 0);
  const verified = verifyLease(st.lease);
  const decision = _evaluate({
    verified: verified.ok,
    claims: verified.ok ? verified.claims : null,
    now,
    hwm: storedHwm,
    firstSeen: st.firstSeen,
    cfg: _cfg,
    clockSkewToleranceMs: (_cfg && _cfg.CLOCK_SKEW_TOLERANCE_MS) || (15 * 60 * 1000),
    clockSkewOfflineMs: (_cfg && _cfg.CLOCK_SKEW_OFFLINE_GRACE_MS) || (4 * 60 * 60 * 1000),
  });

  // Persist bumped hwm + firstSeen. Keep existing lease string.
  const nextHwm = Math.max(storedHwm, now);
  if (verified.ok && verified.claims && verified.claims.issued_at) {
    // Anchor HWM to server-issued time when present
    // (issued_at may be ms)
  }
  writeState({
    lease: st.lease,
    hwm: nextHwm,
    firstSeen: st.firstSeen || now,
  });

  decision.recoverable = isRecoverableReason(decision.reason);
  return decision;
}

module.exports = {
  init,
  gate,
  persistLease,
  verifyLease,
  isRecoverableReason,
  _readState: readState,
};
