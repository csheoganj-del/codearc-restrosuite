/* ============================================================================
   RestroSuite — License system shared config
   ----------------------------------------------------------------------------
   Loaded on every gated surface (dashboard/POS/KDS/tokens) BEFORE
   license-guard.js. Also read by the desktop main process and mirrored (as
   constants) into the Android app.

   The PUBLIC key below is the verifying half of the lease signature. It is safe
   to ship — it can only verify leases, never mint them. Regenerate the pair
   with `node scripts/generate-license-keys.js` (it rewrites the value here and
   prints the matching private key for the Supabase secret LICENSE_SIGNING_KEY).
   ========================================================================== */
(function (root) {
  'use strict';

  var CONFIG = {
    // SPKI (DER) public key, base64. ECDSA P-256 / SHA-256.
    // Auto-filled by scripts/generate-license-keys.js.
    RS_LICENSE_PUBLIC_KEY_SPKI_B64: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtyguKkhJ+rIV9Smp65g5K7Q4mf6Ru1YMdjgG6rNN5d6Ygaz3RtgbgdMLCmeGveoQr9h1HitaSTyl63OgrZz66g==",

    // Fallback mint window only when the tenant has no paid-until date.
    // Paying outlets use the signed plan_expires_at (remaining paid days).
    OFFLINE_WINDOW_MS: 3 * 24 * 60 * 60 * 1000,

    // Extra hours after paid-until so a device that is briefly past midnight
    // can still reopen, go online, and renew.
    OFFLINE_GRACE_MS: 1 * 24 * 60 * 60 * 1000,

    // Start warning the user this long before the lease would lock the app,
    // so lockouts never feel like an ambush.
    PRE_EXPIRY_WARN_MS: 2 * 24 * 60 * 60 * 1000,

    // How often (while the app is open and online) to silently refresh the
    // lease. Any successful refresh resets the offline window.
    REFRESH_INTERVAL_MS: 6 * 60 * 60 * 1000,

    // Enforcement mode:
    //   'enforce' — lock the app when the lease is missing/expired/tampered
    //               (after the one-time bootstrap grace below).
    //   'monitor' — never block; only log what WOULD have been blocked.
    //               Use this for a quiet first rollout, then flip to 'enforce'.
    MODE: 'enforce',

    // First-run only (never had a signed lease). After the first lease, the
    // remaining paid days on that lease are the only offline allowance.
    BOOTSTRAP_GRACE_MS: 3 * 24 * 60 * 60 * 1000,

    // Clock-rollback detection: wall clock earlier than high-water mark by more
    // than this → suspect offline cheat. Was 60s (too tight for Windows NTP /
    // dual-boot / VM resume). 15 minutes covers normal glitches; larger offline
    // skew is handled separately when a verified lease is still unexpired.
    CLOCK_SKEW_TOLERANCE_MS: 15 * 60 * 1000,

    // Offline-only: if clock is behind HWM but we still hold a cryptographically
    // valid unexpired lease, allow up to this much skew before hard lock.
    CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * 60 * 60 * 1000,

    // localStorage / IndexedDB keys.
    STORE_LEASE_KEY: 'rs_license_lease_v1',
    STORE_HWM_KEY: 'rs_license_hwm_v1',       // monotonic high-water mark (ms)
    STORE_FIRSTSEEN_KEY: 'rs_license_firstseen_v1',
    STORE_EVER_LEASED_KEY: 'rs_license_ever_leased_v1',
  };

  root.RS_LICENSE_CONFIG = CONFIG;

  // CommonJS export so the desktop (Electron) main process can require() this
  // exact same file and stay in lockstep with the web guard.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  }
})(typeof window !== 'undefined' ? window : globalThis);
