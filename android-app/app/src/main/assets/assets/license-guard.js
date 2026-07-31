/* ============================================================================
   RestroSuite — client license guard (web / PWA / Android WebView / Electron)
   ----------------------------------------------------------------------------
   The default state is LOCKED unless a valid, unexpired, correctly-signed lease
   exists. You do not need internet at lockout time — you need it to AVOID
   lockout. A device that never renews simply runs out its offline window.

   What this module does:
     • Verifies the lease signature with the embedded PUBLIC key (ECDSA P-256).
       It can check a lease but can never mint or extend one.
     • Enforces lease_expires_at (the bounded offline window).
     • Keeps a monotonic high-water mark and detects clock rollback.
     • Silently refreshes the lease whenever the app is online.
     • Kill switch: any server "expired"/"revoked" answer wipes the local lease
       and locks immediately.
     • Shows a friendly pre-expiry banner, and a blocking lock screen when due.
     • Hands the lease to the native layer (Android/Electron) when present so the
       native gate can enforce even before the WebView/renderer loads.

   The pure decision core (evaluateLicense / verifyLeaseCore) is exported for the
   Node test harness so tests exercise the exact logic that ships.
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var mod = factory(root);
  root.RSLicense = mod;
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var CFG = (root.RS_LICENSE_CONFIG) ||
    (typeof require !== 'undefined' ? safeRequireConfig() : {});

  function safeRequireConfig() {
    try { return require('./license-config.js'); } catch (e) { return {}; }
  }

  var IS_BROWSER = typeof document !== 'undefined';

  /* ------------------------------------------------------------------ *
   *  base64 / crypto helpers (WebCrypto — present in browsers & Node 18+)
   * ------------------------------------------------------------------ */
  var subtle = (root.crypto && root.crypto.subtle) ||
    (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle);

  function b64ToBytes(b64) {
    var bin = (typeof atob === 'function')
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function b64urlToBytes(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    return b64ToBytes(b64);
  }
  function bytesToText(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }
  function textToBytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }

  var _pubKeyPromise = null;
  function importPublicKey() {
    if (!_pubKeyPromise) {
      var spki = b64ToBytes(CFG.RS_LICENSE_PUBLIC_KEY_SPKI_B64 || '');
      _pubKeyPromise = subtle.importKey(
        'spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
      );
    }
    return _pubKeyPromise;
  }

  /* ------------------------------------------------------------------ *
   *  Lease verification (signature + claim parse). Pure-ish (async).
   * ------------------------------------------------------------------ */
  async function verifyLeaseCore(leaseToken) {
    if (!leaseToken || typeof leaseToken !== 'string') {
      return { ok: false, error: 'missing' };
    }
    var parts = leaseToken.split('.');
    if (parts.length !== 2) return { ok: false, error: 'malformed' };
    var payloadEncoded = parts[0], sigEncoded = parts[1];
    try {
      var key = await importPublicKey();
      var valid = await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        b64urlToBytes(sigEncoded),
        textToBytes(payloadEncoded)
      );
      if (!valid) return { ok: false, error: 'bad_signature' };
      var claims = JSON.parse(bytesToText(b64urlToBytes(payloadEncoded)));
      return { ok: true, claims: claims };
    } catch (e) {
      return { ok: false, error: 'verify_exception', detail: String(e && e.message || e) };
    }
  }

  /* ------------------------------------------------------------------ *
   *  PURE decision core — no I/O, no crypto. Fully unit-testable.
   *  Given the verified claims + persisted state + "now", decide whether
   *  to allow, warn, or lock. This is the single source of truth for the
   *  lockout policy and is shared verbatim by the Node tests.
   * ------------------------------------------------------------------ */
  function evaluateLicense(input) {
    // input: {
    //   verified: bool, claims: {lease_expires_at, tenant_id, device_id,...}|null,
    //   now: ms, hwm: ms|0, firstSeen: ms|0,
    //   cfg: { OFFLINE_WINDOW_MS, PRE_EXPIRY_WARN_MS, BOOTSTRAP_GRACE_MS, MODE },
    //   clockSkewToleranceMs?: number
    // }
    var cfg = input.cfg || {};
    var now = input.now;
    var hwm = input.hwm || 0;
    var skew = input.clockSkewToleranceMs != null
      ? input.clockSkewToleranceMs
      : (cfg.CLOCK_SKEW_TOLERANCE_MS != null ? cfg.CLOCK_SKEW_TOLERANCE_MS : (15 * 60 * 1000));
    var offlineSkew = input.clockSkewOfflineMs != null
      ? input.clockSkewOfflineMs
      : (cfg.CLOCK_SKEW_OFFLINE_GRACE_MS != null ? cfg.CLOCK_SKEW_OFFLINE_GRACE_MS : (4 * 60 * 60 * 1000));
    var monitor = cfg.MODE === 'monitor';

    // 1) Clock-rollback check. If the wall clock reads meaningfully earlier than
    //    the highest time we have ever observed, the device clock was moved
    //    back — a classic offline-cheat. Lock and force online revalidation.
    //    Mild NTP/VM glitches (within skew) are ignored. With a still-valid
    //    signed lease, allow a larger offline grace so restaurants are not
    //    locked by a bad Windows time sync during dinner service.
    if (hwm && now < hwm - skew) {
      var hwmDelta = hwm - now;
      var hasLiveLease = !!(input.verified && input.claims &&
        Number(input.claims.lease_expires_at || 0) > now);
      if (hasLiveLease && hwmDelta <= offlineSkew) {
        // Fall through — treat clock as OK for this evaluation
      } else {
        return decision(false, 'clock_rollback', { monitor: monitor, hwmDelta: hwmDelta });
      }
    }

    // 2) No verified lease.
    if (!input.verified || !input.claims) {
      // Server kill switch beats bootstrap grace: if the server explicitly
      // refused this device/tenant, never allow via the new-device grace.
      if (input.killed) return decision(false, 'killed', { monitor: monitor });
      // Bootstrap grace: a device that has never banked a valid lease (fresh
      // install offline, or an existing tenant the moment the feature ships) is
      // allowed to run for a bounded window while it tries to fetch one.
      var firstSeen = input.firstSeen || 0;
      if (!firstSeen) {
        // First ever evaluation — allow, and the caller records firstSeen=now.
        return decision(true, 'bootstrap_start', { monitor: monitor, bootstrap: true });
      }
      var graceMs = cfg.BOOTSTRAP_GRACE_MS || 0;
      if (now <= firstSeen + graceMs) {
        return decision(true, 'bootstrap_grace', {
          monitor: monitor, bootstrap: true,
          msUntilLock: (firstSeen + graceMs) - now
        });
      }
      return decision(false, input.claims ? 'invalid_lease' : 'no_lease', { monitor: monitor });
    }

    // 3) Verified lease — enforce its expiry (the bounded offline window).
    var exp = Number(input.claims.lease_expires_at || 0);
    if (!exp) return decision(false, 'lease_no_expiry', { monitor: monitor });

    if (now > exp) {
      return decision(false, 'lease_expired', { monitor: monitor, expiredForMs: now - exp });
    }

    // 4) Valid & unexpired. Warn if we're inside the pre-expiry window.
    var msUntilExpiry = exp - now;
    var warn = msUntilExpiry <= (cfg.PRE_EXPIRY_WARN_MS || 0);
    return decision(true, 'valid', {
      monitor: monitor,
      warn: warn,
      msUntilExpiry: msUntilExpiry,
      planExpiresAt: input.claims.plan_expires_at || null
    });

    function decision(allow, reason, extra) {
      extra = extra || {};
      // In monitor mode we never actually block, but we report what we WOULD do.
      var locked = !allow && !extra.monitor;
      return Object.assign({
        allow: allow || !!extra.monitor,
        wouldBlock: !allow,
        locked: locked,
        reason: reason,
        warn: !!extra.warn
      }, extra);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Persistence (browser). No-ops off-browser so the core stays pure.
   * ------------------------------------------------------------------ */
  var LS = (function () {
    try { return root.localStorage || null; } catch (e) { return null; }
  })();
  var SS = (function () {
    try { return root.sessionStorage || null; } catch (e) { return null; }
  })();
  // iPhone Safari (and some privacy modes) can throw or silently fail localStorage
  // writes. Mirror critical keys into sessionStorage so a just-logged-in tab still
  // works even when localStorage is flaky. Android WebView is fine with localStorage
  // alone — which is why the same user can work on Android and fail on iPhone.
  function isMobileSafariLike() {
    try {
      var ua = String((root.navigator && navigator.userAgent) || '');
      var iOS = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      var webkit = /WebKit/i.test(ua);
      var notCriOSOther = !/Android/i.test(ua);
      return iOS && webkit && notCriOSOther;
    } catch (e) {
      return false;
    }
  }
  function lsGet(k) {
    try {
      var v = LS ? LS.getItem(k) : null;
      if (v != null && v !== '') return v;
    } catch (e) {}
    try {
      if (SS) {
        var s = SS.getItem(k);
        if (s != null && s !== '') return s;
      }
    } catch (e2) {}
    return null;
  }
  function lsSet(k, v) {
    var ok = false;
    try { if (LS) { LS.setItem(k, v); ok = true; } } catch (e) {}
    try { if (SS) { SS.setItem(k, v); ok = true; } } catch (e2) {}
    return ok;
  }
  function lsDel(k) {
    try { if (LS) LS.removeItem(k); } catch (e) {}
    try { if (SS) SS.removeItem(k); } catch (e2) {}
  }

  function getDeviceId() {
    var k = 'rs_license_device_id_v1';
    var id = lsGet(k);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try {
        if (root.crypto && root.crypto.randomUUID) id = 'dev_' + root.crypto.randomUUID();
      } catch (e) {}
      lsSet(k, id);
    }
    return id;
  }

  function readState() {
    return {
      lease: lsGet(CFG.STORE_LEASE_KEY),
      hwm: Number(lsGet(CFG.STORE_HWM_KEY) || 0),
      firstSeen: Number(lsGet(CFG.STORE_FIRSTSEEN_KEY) || 0)
    };
  }
  function bumpHighWaterMark(candidateMs) {
    var cur = Number(lsGet(CFG.STORE_HWM_KEY) || 0);
    var next = Math.max(cur, candidateMs || 0, Date.now());
    if (next > cur) lsSet(CFG.STORE_HWM_KEY, String(next));
    return next;
  }
  function storeLease(leaseToken, serverTimeMs) {
    lsSet(CFG.STORE_LEASE_KEY, leaseToken);
    if (!lsGet(CFG.STORE_FIRSTSEEN_KEY)) lsSet(CFG.STORE_FIRSTSEEN_KEY, String(Date.now()));
    bumpHighWaterMark(serverTimeMs || Date.now());
    pushLeaseToNative(leaseToken, serverTimeMs || Date.now());
  }
  function wipeLease() {
    lsDel(CFG.STORE_LEASE_KEY);
    pushLeaseToNative('', Date.now());
  }

  /** Best-effort: rehydrate remember-me into sessionStorage (iPhone tab race). */
  function ensureSessionHydrated() {
    try {
      var api = root.RS_API;
      if (!api) return false;
      if (typeof api.session === 'function') {
        var s = api.session();
        if (s && s.token) return true;
      }
      if (typeof api.resumeRememberedSession === 'function') {
        api.resumeRememberedSession();
      }
      if (typeof api.session === 'function') {
        var s2 = api.session();
        return !!(s2 && s2.token);
      }
    } catch (e) {}
    return false;
  }

  /* ------------------------------------------------------------------ *
   *  Native cooperation (Android EncryptedSharedPreferences / Electron DPAPI)
   * ------------------------------------------------------------------ */
  function pushLeaseToNative(leaseToken, serverTimeMs) {
    try {
      if (root.AndroidLicense && typeof root.AndroidLicense.storeLease === 'function') {
        root.AndroidLicense.storeLease(leaseToken || '', String(serverTimeMs || Date.now()));
      }
    } catch (e) {}
    try {
      if (root.rsDesktop && typeof root.rsDesktop.storeLease === 'function') {
        root.rsDesktop.storeLease(leaseToken || '', serverTimeMs || Date.now());
      }
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   *  Online refresh — asks the server for a fresh lease. This is the only
   *  way the offline window resets. Runs the kill switch on expired/revoked.
   * ------------------------------------------------------------------ */
  function hasSessionToken() {
    try {
      var api = root.RS_API;
      if (api && typeof api.session === 'function') {
        var s = api.session();
        if (s && s.token) return true;
      }
    } catch (e) {}
    try {
      return !!(root.sessionStorage && root.sessionStorage.getItem('tenant_session_token'));
    } catch (e2) {
      return false;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Last refresh outcome — shown on the lock screen so iPhone users aren't stuck
  // with a generic message when the real issue is session timing / network.
  var _lastRefreshMeta = { status: '', error: '', at: 0 };

  async function refresh() {
    var deviceId = getDeviceId();
    var api = root.RS_API;
    if (!api || typeof api.lease !== 'function') {
      _lastRefreshMeta = { status: 'api_unavailable', error: '', at: Date.now() };
      return { ok: false, reason: 'api_unavailable' };
    }
    // Mobile Safari / new tabs often hydrate remember-me into sessionStorage
    // only when session() is first called — do that before lease.
    ensureSessionHydrated();
    if (!hasSessionToken()) {
      _lastRefreshMeta = { status: 'unauthenticated', error: '', at: Date.now() };
      return { ok: false, status: 'unauthenticated' };
    }
    try {
      if (typeof api.refreshConfig === 'function') api.refreshConfig();
    } catch (e2) {}
    try {
      var res = await api.lease(deviceId);
      if (res && res.status === 'active' && res.lease) {
        storeLease(res.lease, Number(res.server_time || Date.now()));
        lsDel('rs_license_killed_v1');
        _lastRefreshMeta = { status: 'active', error: '', at: Date.now() };
        return { ok: true, status: 'active' };
      }
      // Any authoritative "not active" answer is the kill switch.
      if (res && (res.status === 'expired' || res.status === 'revoked')) {
        wipeLease();
        lsSet('rs_license_killed_v1', '1');
        _lastRefreshMeta = { status: res.status, error: '', at: Date.now() };
        return { ok: false, status: res.status, kill: true };
      }
      _lastRefreshMeta = { status: (res && res.status) || 'unknown', error: '', at: Date.now() };
      return { ok: false, status: (res && res.status) || 'unknown' };
    } catch (err) {
      var s = err && err.status;
      if (s === 402 || s === 403) {
        // Server explicitly refused (expired / revoked) — kill switch.
        wipeLease();
        lsSet('rs_license_killed_v1', '1');
        _lastRefreshMeta = { status: 'expired', error: String(err && err.message || ''), at: Date.now() };
        return { ok: false, status: 'expired', kill: true };
      }
      if (s === 401) {
        // Session problem, not a licence problem — let the auth layer handle it.
        _lastRefreshMeta = { status: 'unauthenticated', error: String(err && err.message || ''), at: Date.now() };
        return { ok: false, status: 'unauthenticated' };
      }
      // Network error / offline — keep whatever lease we have.
      _lastRefreshMeta = {
        status: 'offline',
        error: String(err && err.message || err || ''),
        at: Date.now()
      };
      return { ok: false, status: 'offline', offline: true, error: String(err && err.message || err || '') };
    }
  }

  /** Several lease attempts — mobile networks / cold start often fail once. */
  async function refreshWithRetries(attempts, gapMs) {
    attempts = Math.max(1, attempts || 1);
    gapMs = gapMs == null ? 700 : gapMs;
    var last = { ok: false, status: 'unknown' };
    for (var i = 0; i < attempts; i++) {
      last = await refresh();
      if (last && last.ok) return last;
      if (last && last.kill) return last;
      if (last && last.status === 'unauthenticated' && i < attempts - 1) {
        await sleep(gapMs);
        continue;
      }
      if (last && last.offline && i < attempts - 1) {
        await sleep(gapMs);
        continue;
      }
      if (i < attempts - 1) await sleep(gapMs);
    }
    return last;
  }

  /* ------------------------------------------------------------------ *
   *  Evaluate current device state (verify + decide), with side effects
   *  limited to HWM bump + firstSeen bootstrap.
   * ------------------------------------------------------------------ */
  /**
   * Normal Safari keeps localStorage forever; Private Safari starts clean.
   * That is why the same account works in Private + Android but hard-locks in
   * normal Safari: a stale/corrupt/expired lease string (or kill flag) blocks
   * the soft path because `if (!stSoft.lease)` is false when junk is present.
   *
   * When online + signed-in, drop unusable local leases so we can mint a fresh
   * one. Real subscription denials still come back as 402/403 kill from refresh.
   */
  async function discardUnusableStoredLease() {
    var st = readState();
    if (!st.lease) return { wiped: false, reason: 'empty' };
    var verified = await verifyLeaseCore(st.lease);
    if (!verified.ok || !verified.claims) {
      wipeLease();
      return { wiped: true, reason: 'invalid' };
    }
    var exp = Number(verified.claims.lease_expires_at || 0);
    if (!exp || Date.now() > exp) {
      wipeLease();
      return { wiped: true, reason: 'expired' };
    }
    return { wiped: false, reason: 'ok', claims: verified.claims };
  }

  function isRecoverableLockReason(reason) {
    return reason === 'no_lease' ||
      reason === 'invalid_lease' ||
      reason === 'lease_expired' ||
      reason === 'lease_no_expiry' ||
      reason === 'bootstrap_start' ||
      reason === 'bootstrap_grace' ||
      // Online + signed-in: re-mint lease and re-stamp HWM from server time
      reason === 'clock_rollback';
  }

  async function evaluateNow() {
    var st = readState();
    var now = Date.now();
    bumpHighWaterMark(now); // launching the app is itself a time observation
    var st2 = readState();

    var verified = { ok: false };
    if (st.lease) verified = await verifyLeaseCore(st.lease);
    if (verified.ok && verified.claims) bumpHighWaterMark(Number(verified.claims.issued_at || 0));

    var result = evaluateLicense({
      verified: verified.ok,
      claims: verified.ok ? verified.claims : null,
      now: now,
      hwm: st2.hwm,
      firstSeen: st2.firstSeen,
      killed: lsGet('rs_license_killed_v1') === '1',
      cfg: CFG,
      clockSkewToleranceMs: CFG.CLOCK_SKEW_TOLERANCE_MS,
      clockSkewOfflineMs: CFG.CLOCK_SKEW_OFFLINE_GRACE_MS
    });

    // Record firstSeen on the very first evaluation so bootstrap grace is bounded.
    if (result.reason === 'bootstrap_start' && !st2.firstSeen) {
      lsSet(CFG.STORE_FIRSTSEEN_KEY, String(now));
    }
    return result;
  }

  /* ------------------------------------------------------------------ *
   *  UI — lock screen + pre-expiry banner (browser only, self-contained)
   * ------------------------------------------------------------------ */
  function showLockScreen(reason) {
    if (!IS_BROWSER) return;
    if (document.getElementById('rs-license-lock')) return;
    var messages = {
      clock_rollback: 'Your device clock looks incorrect (or jumped after sleep). Set the correct date/time, go online, and tap Retry.',
      lease_expired: 'Your RestroSuite licence needs to reconnect. Please go online briefly to renew.',
      no_lease: 'RestroSuite needs to verify your subscription on this device. Stay online and tap Retry — mobile browsers often need a second try after login.',
      invalid_lease: 'RestroSuite needs to verify your subscription. Please stay online and tap Retry now.',
      lease_no_expiry: 'RestroSuite needs to verify your subscription. Please connect to the internet.',
      verifying: 'Verifying your outlet licence…'
    };
    var msg = messages[reason] || messages.no_lease;
    var el = document.createElement('div');
    el.id = 'rs-license-lock';
    el.setAttribute('role', 'alertdialog');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483600',
      'background:radial-gradient(1200px 600px at 50% -10%,#1b2233,#0b0e16)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif', 'color:#fff', 'padding:24px'
    ].join(';');
    el.innerHTML =
      '<div style="max-width:420px;text-align:center;background:rgba(255,255,255,.04);' +
      'border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:34px 28px;box-shadow:0 24px 80px rgba(0,0,0,.5)">' +
      '<div style="width:64px;height:64px;border-radius:50%;margin:0 auto 18px;background:rgba(252,128,25,.15);' +
      'display:flex;align-items:center;justify-content:center;font-size:28px">🔒</div>' +
      '<div style="font-weight:800;font-size:19px;margin-bottom:10px">Reconnect to continue</div>' +
      '<div id="rs-license-lock-msg" style="font-size:14px;line-height:1.6;color:#c7cede;margin-bottom:22px">' + msg + '</div>' +
      '<button id="rs-license-retry" style="background:#FF4F00;color:#fff;border:none;border-radius:10px;' +
      'padding:12px 22px;font-weight:700;font-size:14px;cursor:pointer;min-width:140px;min-height:44px">Retry now</button>' +
      '<div style="margin-top:16px;font-size:12px;color:#8b93a7">Need help? Contact RestroSuite support.</div>' +
      '</div>';
    document.body.appendChild(el);
    var btn = document.getElementById('rs-license-retry');
    if (btn) btn.addEventListener('click', async function () {
      btn.textContent = 'Checking…'; btn.disabled = true;
      try {
        ensureSessionHydrated();
        // Clear stale kill + junk lease (Private Safari has neither — that is why
        // it works there). Server will re-kill if subscription is truly dead.
        if (hasSessionToken()) lsDel('rs_license_killed_v1');
        await discardUnusableStoredLease();
        await refreshWithRetries(6, 500);
        var ev = await evaluateNow();
        if (ev.allow && !ev.locked) {
          el.remove();
          return;
        }
        // Still locked but recoverable + online → soft-allow POS while we keep trying
        if (ev.locked && hasSessionToken() && isRecoverableLockReason(ev.reason) &&
            lsGet('rs_license_killed_v1') !== '1' && navigator.onLine !== false) {
          await discardUnusableStoredLease();
          el.remove();
          startPendingLeaseLoop();
          return;
        }
        var detail = _lastRefreshMeta && _lastRefreshMeta.status
          ? (' (last: ' + _lastRefreshMeta.status + ')')
          : '';
        var msgEl = document.getElementById('rs-license-lock-msg');
        if (msgEl && detail) {
          msgEl.textContent = (messages[ev.reason] || messages.no_lease) + detail;
        }
      } catch (e) {}
      btn.textContent = 'Retry now';
      btn.disabled = false;
    });
    // Auto-retry on mobile while lock is open (session often becomes ready after first paint).
    startLockedRetryLoop();
  }
  function hideLockScreen() {
    var el = IS_BROWSER && document.getElementById('rs-license-lock');
    if (el) el.remove();
  }

  function showExpiryBanner(msUntilExpiry) {
    if (!IS_BROWSER) return;
    if (document.getElementById('rs-license-banner')) return;
    var days = Math.max(0, Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)));
    var when = days <= 1 ? 'within a day' : ('in ' + days + ' days');
    var bar = document.createElement('div');
    bar.id = 'rs-license-banner';
    bar.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:18px', 'transform:translateX(-50%)',
      'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:12px',
      'background:#7a3d00', 'color:#fff', 'padding:11px 16px', 'border-radius:12px',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)',
      'font:600 13px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif', 'max-width:92vw'
    ].join(';');
    bar.innerHTML =
      '<span>⚠️ RestroSuite will need to reconnect ' + when + ' to stay active.</span>' +
      '<button id="rs-license-renew" style="background:#FF4F00;color:#fff;border:none;border-radius:8px;' +
      'padding:7px 12px;font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap">Renew now</button>' +
      '<button id="rs-license-dismiss" style="background:transparent;color:#ffd9b8;border:none;' +
      'font-size:16px;cursor:pointer;line-height:1">×</button>';
    document.body.appendChild(bar);
    var renew = document.getElementById('rs-license-renew');
    if (renew) renew.addEventListener('click', function () { refresh().then(function () { bar.remove(); }); });
    var dismiss = document.getElementById('rs-license-dismiss');
    if (dismiss) dismiss.addEventListener('click', function () { bar.remove(); });
  }

  /* ------------------------------------------------------------------ *
   *  Public entry point — call at app-shell bootstrap BEFORE rendering the
   *  gated UI. Returns true if the app may run, false if it was locked.
   * ------------------------------------------------------------------ */
  var _started = false;
  var _lockRetryTimer = null;
  var _lockRetryCount = 0;
  var _pendingLeaseTimer = null;
  var _pendingLeaseCount = 0;

  function stopLockedRetryLoop() {
    if (_lockRetryTimer) {
      clearInterval(_lockRetryTimer);
      _lockRetryTimer = null;
    }
    _lockRetryCount = 0;
  }

  function stopPendingLeaseLoop() {
    if (_pendingLeaseTimer) {
      clearInterval(_pendingLeaseTimer);
      _pendingLeaseTimer = null;
    }
    _pendingLeaseCount = 0;
  }

  function startPendingLeaseLoop() {
    if (!IS_BROWSER || _pendingLeaseTimer) return;
    _pendingLeaseCount = 0;
    _pendingLeaseTimer = setInterval(function () {
      var st = readState();
      if (st.lease) {
        // Only stop if the stored lease is actually valid — a stale junk lease
        // (common on normal Safari, absent in Private) must not end the loop.
        verifyLeaseCore(st.lease).then(function (v) {
          if (v && v.ok && v.claims && Number(v.claims.lease_expires_at || 0) > Date.now()) {
            stopPendingLeaseLoop();
            reassess();
          } else {
            wipeLease();
          }
        }).catch(function () { wipeLease(); });
        return;
      }
      if (++_pendingLeaseCount > 60) {
        // ~3 min of soft tries. Keep POS usable; show lock only as a nudge with Retry.
        // Do NOT hard-brick signed-in users when normal Safari has stale storage.
        if (hasSessionToken() && lsGet('rs_license_killed_v1') !== '1') {
          showLockScreen('no_lease');
          startLockedRetryLoop();
        }
        // Keep the pending timer going so a later successful refresh still unlocks.
        _pendingLeaseCount = 40;
        return;
      }
      if (navigator.onLine === false) return;
      ensureSessionHydrated();
      if (!hasSessionToken()) return;
      refreshWithRetries(2, 350).then(function (r) {
        if (r && r.ok) {
          stopPendingLeaseLoop();
          reassess();
        }
      }).catch(function () {});
    }, 3000);
  }

  function startLockedRetryLoop() {
    if (!IS_BROWSER || _lockRetryTimer) return;
    _lockRetryCount = 0;
    _lockRetryTimer = setInterval(function () {
      if (!document.getElementById('rs-license-lock')) {
        stopLockedRetryLoop();
        return;
      }
      if (++_lockRetryCount > 40) {
        // ~2 minutes of 3s ticks — stop hammering; user can still tap Retry.
        stopLockedRetryLoop();
        return;
      }
      if (navigator.onLine === false) return;
      refreshWithRetries(2, 400).then(function () { return reassess(); })
        .catch(function () { reassess(); });
    }, 3000);
  }

  async function enforce(opts) {
    opts = opts || {};
    if (!CFG || !CFG.RS_LICENSE_PUBLIC_KEY_SPKI_B64 ||
        CFG.RS_LICENSE_PUBLIC_KEY_SPKI_B64 === 'REPLACE_WITH_PUBLIC_KEY') {
      // Misconfigured build — fail OPEN rather than brick the POS, but shout.
      console.error('[RSLicense] No public key configured; licence enforcement disabled.');
      return true;
    }

    // Super-admin console is not tenant-leased.
    try {
      var s0 = root.RS_API && RS_API.session ? RS_API.session() : null;
      if (s0 && s0.role === 'superadmin') return true;
    } catch (e0) {}

    var online = !IS_BROWSER || (typeof navigator === 'undefined') || navigator.onLine !== false;
    ensureSessionHydrated();

    // Mobile / slow devices: wait for session hydrate (remember-me → sessionStorage).
    // iPhone Safari needs longer than Android WebView after login navigation.
    var waitTicks = isMobileSafariLike() ? 15 : 8;
    if (online && !hasSessionToken()) {
      for (var w = 0; w < waitTicks && !hasSessionToken(); w++) {
        await sleep(200);
        ensureSessionHydrated();
      }
    }

    // Online + signed-in: drop stale Safari localStorage junk, then mint a lease.
    // Private browsing has empty storage so it never hit this path — and worked.
    if (online && hasSessionToken()) {
      try {
        // Stale kill flag bricks normal Safari; server re-asserts on 402/403.
        lsDel('rs_license_killed_v1');
        await discardUnusableStoredLease();
        await refreshWithRetries(isMobileSafariLike() ? 7 : 5, 500);
      } catch (e2) {}
    } else if (online) {
      try {
        await refreshWithRetries(2, 500);
      } catch (e3) {}
    }

    var ev = await evaluateNow();

    // Soft path: online + logged in + recoverable. Must run even when a JUNK
    // lease string exists in localStorage (the Private-vs-normal Safari bug).
    if (ev.locked && online && hasSessionToken() && lsGet('rs_license_killed_v1') !== '1' &&
        isRecoverableLockReason(ev.reason)) {
      try { await discardUnusableStoredLease(); } catch (e4) {}
      hideLockScreen();
      if (!_started) { _started = true; startWatch(); }
      startPendingLeaseLoop();
      setTimeout(function () {
        refreshWithRetries(8, 600).then(function (r) {
          if (r && r.ok) {
            stopPendingLeaseLoop();
            reassess();
          }
        }).catch(function () {});
      }, 300);
      return true;
    }

    if (ev.locked) {
      showLockScreen(ev.reason);
      if (!_started) {
        _started = true;
        startWatch();
      }
      return false;
    }

    stopLockedRetryLoop();
    stopPendingLeaseLoop();
    hideLockScreen();
    if (ev.warn && ev.msUntilExpiry != null) showExpiryBanner(ev.msUntilExpiry);
    if (!_started) { _started = true; startWatch(); }
    return true;
  }

  function startWatch() {
    if (!IS_BROWSER) return;
    // Periodic silent refresh while online.
    setInterval(function () {
      if (navigator.onLine !== false) refreshWithRetries(2, 400).then(reassess);
    }, CFG.REFRESH_INTERVAL_MS || (6 * 60 * 60 * 1000));

    // While no valid local lease, poll often (mobile after login).
    setInterval(function () {
      if (navigator.onLine === false) return;
      var st = readState();
      if (st.lease) return;
      if (!hasSessionToken()) return;
      refreshWithRetries(2, 300).then(reassess).catch(function () {});
    }, 15 * 1000);

    // Re-check on regaining connectivity and on tab focus.
    root.addEventListener && root.addEventListener('online', function () {
      refreshWithRetries(4, 500).then(reassess);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (navigator.onLine !== false) refreshWithRetries(2, 400).then(reassess);
        else reassess();
      }
    });
    // Frequent lightweight local re-evaluation (catches lease expiring while
    // the app sits open offline, and clock tampering mid-session).
    setInterval(reassess, 5 * 60 * 1000);

    // After auth finishes loading on mobile, re-enforce once.
    document.addEventListener('rs:ready', function () {
      refreshWithRetries(4, 400).then(reassess).catch(function () { reassess(); });
    });
    document.addEventListener('rs:hydrated', function () {
      refreshWithRetries(3, 400).then(reassess).catch(function () { reassess(); });
    });

    // Live push: react INSTANTLY when the server changes this tenant's licence
    // (billing set to past_due/active, plan change, or a device revoke) — no
    // page refresh needed. Retry a few times in case the realtime client isn't
    // ready at first paint.
    subscribeRealtime();
    var rtTries = 0;
    var rtTimer = setInterval(function () {
      if (_rtChannel || ++rtTries > 60) { clearInterval(rtTimer); return; }
      subscribeRealtime();
    }, 4000);
  }

  var _rtChannel = null;
  function subscribeRealtime() {
    if (!IS_BROWSER || _rtChannel) return;
    try {
      var api = root.RS_API;
      var client = api && api.supabaseClient;
      var sess = api && api.session ? api.session() : null;
      var tid = sess && sess.tenant_id;
      if (!client || !tid || typeof client.channel !== 'function') return;
      _rtChannel = client.channel('rs-license-' + tid)
        .on('broadcast', { event: 'license-changed' }, function () {
          // The server says this tenant's licence changed. Re-fetch the lease
          // and re-evaluate right away, so lock/unlock happens live.
          refreshWithRetries(3, 400).then(reassess).catch(function () { reassess(); });
        })
        .subscribe();
    } catch (e) { /* not ready yet — the retry interval will try again */ }
  }

  async function reassess() {
    var ev = await evaluateNow();
    if (ev.locked) {
      if (navigator.onLine !== false && hasSessionToken() && lsGet('rs_license_killed_v1') !== '1' &&
          isRecoverableLockReason(ev.reason)) {
        try { await discardUnusableStoredLease(); } catch (e) {}
        // Soft: keep POS usable while pending lease loop works.
        if (!_pendingLeaseTimer) startPendingLeaseLoop();
        hideLockScreen();
        return;
      }
      showLockScreen(ev.reason);
    } else {
      stopLockedRetryLoop();
      stopPendingLeaseLoop();
      hideLockScreen();
      if (ev.warn && ev.msUntilExpiry != null) showExpiryBanner(ev.msUntilExpiry);
    }
  }

  return {
    // pure / testable core
    evaluateLicense: evaluateLicense,
    verifyLeaseCore: verifyLeaseCore,
    // runtime
    enforce: enforce,
    refresh: refresh,
    refreshWithRetries: refreshWithRetries,
    evaluateNow: evaluateNow,
    getDeviceId: getDeviceId,
    _internal: { storeLease: storeLease, wipeLease: wipeLease, readState: readState, bumpHighWaterMark: bumpHighWaterMark }
  };
});
