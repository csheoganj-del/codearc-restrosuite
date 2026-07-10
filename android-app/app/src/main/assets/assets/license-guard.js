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
    var skew = input.clockSkewToleranceMs != null ? input.clockSkewToleranceMs : (60 * 1000);
    var monitor = cfg.MODE === 'monitor';

    // 1) Clock-rollback check. If the wall clock reads meaningfully earlier than
    //    the highest time we have ever observed, the device clock was moved
    //    back — a classic offline-cheat. Lock and force online revalidation.
    if (hwm && now < hwm - skew) {
      return decision(false, 'clock_rollback', { monitor: monitor, hwmDelta: hwm - now });
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
  function lsGet(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (LS) LS.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { if (LS) LS.removeItem(k); } catch (e) {} }

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
  async function refresh() {
    var deviceId = getDeviceId();
    var api = root.RS_API;
    if (!api || typeof api.lease !== 'function') {
      return { ok: false, reason: 'api_unavailable' };
    }
    try {
      var res = await api.lease(deviceId);
      if (res && res.status === 'active' && res.lease) {
        storeLease(res.lease, Number(res.server_time || Date.now()));
        lsDel('rs_license_killed_v1');
        return { ok: true, status: 'active' };
      }
      // Any authoritative "not active" answer is the kill switch.
      if (res && (res.status === 'expired' || res.status === 'revoked')) {
        wipeLease();
        lsSet('rs_license_killed_v1', '1');
        return { ok: false, status: res.status, kill: true };
      }
      return { ok: false, status: (res && res.status) || 'unknown' };
    } catch (err) {
      var s = err && err.status;
      if (s === 402 || s === 403) {
        // Server explicitly refused (expired / revoked) — kill switch.
        wipeLease();
        lsSet('rs_license_killed_v1', '1');
        return { ok: false, status: 'expired', kill: true };
      }
      if (s === 401) {
        // Session problem, not a licence problem — let the auth layer handle it.
        return { ok: false, status: 'unauthenticated' };
      }
      // Network error / offline — keep whatever lease we have.
      return { ok: false, status: 'offline', offline: true };
    }
  }

  /* ------------------------------------------------------------------ *
   *  Evaluate current device state (verify + decide), with side effects
   *  limited to HWM bump + firstSeen bootstrap.
   * ------------------------------------------------------------------ */
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
      cfg: CFG
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
      clock_rollback: 'Your device clock looks incorrect. Connect to the internet once to re-verify your subscription.',
      lease_expired: 'Your RestroSuite licence needs to reconnect. Please go online briefly to renew.',
      no_lease: 'RestroSuite needs to verify your subscription. Please connect to the internet.',
      invalid_lease: 'RestroSuite needs to verify your subscription. Please connect to the internet.',
      lease_no_expiry: 'RestroSuite needs to verify your subscription. Please connect to the internet.'
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
      '<div style="font-size:14px;line-height:1.6;color:#c7cede;margin-bottom:22px">' + msg + '</div>' +
      '<button id="rs-license-retry" style="background:#FC8019;color:#fff;border:none;border-radius:10px;' +
      'padding:12px 22px;font-weight:700;font-size:14px;cursor:pointer">Retry now</button>' +
      '<div style="margin-top:16px;font-size:12px;color:#8b93a7">Need help? Contact RestroSuite support.</div>' +
      '</div>';
    document.body.appendChild(el);
    var btn = document.getElementById('rs-license-retry');
    if (btn) btn.addEventListener('click', async function () {
      btn.textContent = 'Checking…'; btn.disabled = true;
      var r = await refresh();
      var ev = await evaluateNow();
      if (ev.allow && !ev.locked) { el.remove(); }
      else { btn.textContent = 'Retry now'; btn.disabled = false; }
    });
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
      '<button id="rs-license-renew" style="background:#FC8019;color:#fff;border:none;border-radius:8px;' +
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
  async function enforce(opts) {
    opts = opts || {};
    if (!CFG || !CFG.RS_LICENSE_PUBLIC_KEY_SPKI_B64 ||
        CFG.RS_LICENSE_PUBLIC_KEY_SPKI_B64 === 'REPLACE_WITH_PUBLIC_KEY') {
      // Misconfigured build — fail OPEN rather than brick the POS, but shout.
      console.error('[RSLicense] No public key configured; licence enforcement disabled.');
      return true;
    }

    // Kick a refresh in the background if we appear to be online.
    var online = !IS_BROWSER || (typeof navigator === 'undefined') || navigator.onLine !== false;
    if (online) { try { await refresh(); } catch (e) {} }

    var ev = await evaluateNow();

    if (ev.locked) {
      showLockScreen(ev.reason);
      // Keep trying in the background; unlock automatically once it clears.
      if (!_started) {
        _started = true;
        startWatch();
      }
      return false;
    }

    hideLockScreen();
    if (ev.warn && ev.msUntilExpiry != null) showExpiryBanner(ev.msUntilExpiry);
    if (!_started) { _started = true; startWatch(); }
    return true;
  }

  function startWatch() {
    if (!IS_BROWSER) return;
    // Periodic silent refresh while online.
    setInterval(function () {
      if (navigator.onLine !== false) refresh().then(reassess);
    }, CFG.REFRESH_INTERVAL_MS || (6 * 60 * 60 * 1000));

    // Re-check on regaining connectivity and on tab focus.
    root.addEventListener && root.addEventListener('online', function () { refresh().then(reassess); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') reassess();
    });
    // Frequent lightweight local re-evaluation (catches lease expiring while
    // the app sits open offline, and clock tampering mid-session).
    setInterval(reassess, 5 * 60 * 1000);

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
          refresh().then(reassess).catch(function () { reassess(); });
        })
        .subscribe();
    } catch (e) { /* not ready yet — the retry interval will try again */ }
  }

  async function reassess() {
    var ev = await evaluateNow();
    if (ev.locked) showLockScreen(ev.reason);
    else {
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
    evaluateNow: evaluateNow,
    getDeviceId: getDeviceId,
    _internal: { storeLease: storeLease, wipeLease: wipeLease, readState: readState, bumpHighWaterMark: bumpHighWaterMark }
  };
});
