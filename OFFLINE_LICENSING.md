# RestroSuite — Offline Licensing (signed-lease system)

This is the offline-lockout system for RestroSuite across web/PWA, Android, and
desktop. The design principle: **a device does not need internet at lockout
time — it needs internet to _avoid_ lockout.** The default state is *locked
unless a valid, unexpired, correctly-signed lease exists*. A device that never
renews simply runs out its bounded offline window and stops on its own.

## How it works

The server signs a short-lived **lease** (ECDSA P-256) whenever a tenant's
subscription is active:

```
{ tenant_id, device_id, plan, plan_expires_at, issued_at, lease_expires_at, server_time }
```

`lease_expires_at = now + 3 days` (the offline window — the plan may run to 2027,
but the lease dies in 3 days). Clients hold only the **public** key: they can
verify a lease but can never forge or extend one. Whenever a device is online it
silently renews. If the subscription has lapsed the server refuses to issue a new
lease, so every device locks within ≤ 3 days of expiry, even fully offline.

**Clock-tampering defence:** each client keeps a monotonic high-water mark (max
of last server time, last launch time, stored lease time). If the wall clock
reads earlier than that mark, rollback is detected and the app locks until it can
revalidate online.

**Kill switch:** any authoritative server answer of `expired`/`revoked` wipes the
local lease and locks immediately. A single device can be revoked via the
`saas_license_devices` registry.

## Chosen parameters

- Offline window: **3 days** (`LICENSE_OFFLINE_WINDOW_DAYS`).
- Pre-expiry warning banner: 2 days before lock.
- RLS rollout: **grace-first** — CRUD subscription enforcement already lives in
  the service-role Edge Functions (`tenant-data`, `tenant-access`), which reject
  any tenant not `active`/`trialing`. To move to strict (also stop the moment
  the paid `subscription_current_period_end` passes) use
  `saas_tenant_is_active(tenant_id, true)`.

## Files

| Area | File | Role |
|------|------|------|
| Keys | `scripts/generate-license-keys.js` | Generate the ECDSA P-256 pair; prints private key, embeds public key |
| Server | `supabase/functions/license-lease/index.ts` | Auth via session token → issue signed lease; per-device kill switch + audit |
| Server | `supabase/migrations/20260709120000_license_lease_backstop.sql` | `saas_tenant_is_active()`, `saas_license_devices`, `saas_register_lease()` |
| Client | `assets/license-config.js` | Public key + tunables (shared by web + desktop) |
| Client | `assets/license-guard.js` | Verify + decide + refresh + lock UI. Pure core is unit-tested |
| Client | `assets/doppio-api.js` → `RS_API.lease()` | Calls the lease endpoint with the session token |
| Web | `dashboard.html`, `tokens.html`, `kds.html` | Load the guard and call `RSLicense.enforce()` at bootstrap |
| Web | `service-worker.js` | Caches the guard so enforcement survives offline |
| Desktop | `desktop/license-main.js`, `main.js`, `preload.js`, `lock.html` | Main-process gate; lease persisted DPAPI-encrypted; native lock page |
| Android | `LicenseManager.java`, `LicenseBridge.java`, `MainActivity.java` | Native offline gate; lease in EncryptedSharedPreferences; native lock screen |
| Test | `scripts/test-license-guard.js` | Signs leases and exercises the shipped guard + desktop verifier |

Note: **`order.html` / `qr-order.html` are customer-facing and are deliberately
NOT gated** — customers scanning a table QR have no session and must never see a
lock screen. Lapsed tenants are already blocked there server-side by
`tenant-public`.

## Deploy (one-time key setup)

1. Generate the production key pair (rewrites the public key in
   `assets/license-config.js`, prints the private key):
   ```
   node scripts/generate-license-keys.js
   ```
2. Set the private key + window as Supabase secrets:
   ```
   supabase secrets set LICENSE_SIGNING_KEY="<base64 pkcs8 from step 1>"
   supabase secrets set LICENSE_OFFLINE_WINDOW_DAYS=3
   ```
   (The function also needs the existing `SUPERADMIN_SESSION_SECRET`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.)
3. Apply the migration and deploy the function:
   ```
   supabase db push
   supabase functions deploy license-lease
   ```
4. Web/PWA: deploy the repo (Vercel). The bumped service-worker cache
   (`...-license-guard`) forces clients to pick up the guard.
5. Desktop: run the desktop asset sync, then rebuild the Electron app so
   `desktop/app/assets/` contains the new guard + config.
6. Android: run `sync-assets.ps1` (copies the whole `assets/` dir), bump
   `versionCode`, rebuild. Requires `androidx.security:security-crypto` (added).

## Verify

```
node scripts/generate-license-keys.js --dev   # once, writes a dev private key
node scripts/test-license-guard.js            # 18 checks: sig, tamper, expiry, rollback, bootstrap
```

## Operate

- **Quiet rollout:** set `MODE: 'monitor'` in `assets/license-config.js` to log
  what *would* lock without blocking anyone; flip to `'enforce'` when confident.
- **Revoke one device:** `UPDATE saas_license_devices SET revoked = true,
  revoked_at = now(), revoked_reason = '...' WHERE tenant_id = '...' AND
  device_id = '...';` The device locks within one offline window.
- **See devices:** `SELECT * FROM saas_license_device_overview WHERE tenant_slug = '...';`

## Safety notes

- The guard, desktop gate, and Android gate all **fail OPEN** on internal errors
  (missing public key, gate exceptions) so a bug can never brick a paying outlet.
- The one-time **bootstrap grace** (3 days) means existing tenants and fresh
  installs are never hard-locked the instant this ships — they run while trying
  to bank their first lease. Once a device has one valid lease, normal
  enforcement applies.
- **Never commit** `LICENSE_SIGNING_KEY` or `scripts/.license-signing-key.dev.b64`
  (both gitignored). Only the public key ships to clients.
