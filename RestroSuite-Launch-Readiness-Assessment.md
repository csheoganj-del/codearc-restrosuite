# RestroSuite — Comprehensive Launch Readiness Assessment

**Date:** 9 July 2026
**Scope:** Web App (PWA), Desktop (Electron/EXE), Android App — UI/UX/CX, functionality, security, roles, database, all platforms

---

## Overall Verdict

**⚠️ CONDITIONAL — code is production-quality, but 3 deployment gates and 4 data-layer defects must be resolved before real staff or customers use this.**

The core POS, billing, KDS, QR ordering, settings, auth, security, and dashboard are fully implemented — no stubs or placeholder UI found in any interactive element. However, the gap between the audit reports and the actual production database state creates real broken features, and the Android app has a version freeze that prevents updates from reaching Play Store users.

---

## Platform-by-Platform Summary

### Web App (Vercel + Supabase)
**Status: ✅ Code ready, ⚠️ deployment pending**

| Area | Finding |
|---|---|
| Landing page (`index.html`) | Fully implemented. SEO, OG tags, JSON-LD, accessibility skip-nav, mobile hamburger, testimonials carousel, interactive demo, pricing — all wired. |
| Login / Register (`login.html`) | Multi-step registration, WhatsApp OTP, offline resume, recovery modal — all real implementations. Rate limiting confirmed (429 tested live). |
| Dashboard (`dashboard.html`) | 19 tabs audited. Zero stubs found. Every sidebar link, tab, and button has a real handler. |
| POS | Cart, hold/recall, split payment, KOT, cash drawer, table seating selector, order types — all fully implemented. Hold/recall mislabeling bug was confirmed fixed. |
| Billing & Receipts | GST/VAT/Composition tax, multi-tender, PDF thermal receipt, WhatsApp send, QR code on receipt, refund flow — all real. Country-aware (India + Ireland VAT rates). |
| KDS (`kds.html`) | Real-time order queue with prep timers. |
| QR Ordering (`qr-order.html`) | Customer-facing page implemented. Table session trigger bug fixed in migration `20260707120000`. |
| Floor & Tables | Seating layout, QR sessions (open/pause/close/regenerate), live table state from DB — all implemented. |
| Reports / Analytics | Revenue, category breakdown, payment method splits, daily close — implemented. Category mismatch bug (items showing as "Uncategorized") was fixed. |
| Tax & GST | GSTR-1/GSTR-3B worksheets, ROS VAT3/RTD for Ireland, CSV/PDF export, date-effective tax slab editor — all real. |
| Growth Hub | Cards route to real module screens (confirmed fixed, no dead-end placeholders). |
| Online Orders | Backed by real `doppio_pending_orders` data. |
| Employees / Logins | `safe is not defined` crash fixed (`const safe = esc` confirmed at module level in `features-manage.js`). |
| Settings | All 9 panes implemented. Role lockout (non-admin gets "restricted" screen) confirmed in code. Danger Zone and Plan & Billing filtered out for non-owner roles. |
| SuperAdmin | Platform stats, tenant listing, impersonation, gateway monitor — all implemented. |

### PWA
**Status: ✅ Shell works offline, ⚠️ data layer offline is limited**

- Service worker correctly uses `skipWaiting()` + `clients.claim()` + `CACHE_NAME` version bump
- `pwa.js` now shows an "update available" banner and auto-reloads — the "stuck on old version" gap is fixed
- App shell (95 files) is precached and survives offline
- **Known limitation:** `/api/config` is intentionally not intercepted by the SW. Without a cached config, a completely fresh offline install cannot bootstrap. Returning users (who have a cached config in localStorage) are unaffected
- True offline data write + sync-on-reconnect (IndexedDB queue) is not implemented — the service worker uses network-first for all data operations. Documented as P2 work in the issue audit

### Desktop (Electron EXE)
**Status: ✅ Ready**

- `main.js`: single-instance lock, Origin header rewrite for Supabase CORS, splash screen, offline-lease gate (fail-open on errors so a bug never bricks an outlet)
- `server.js`: mirrors all Vercel rewrites and `/api/config` exactly — desktop offline works with credentials in `config.json`
- `license-main.js`: ECDSA lease gate with `safeStorage` for encrypted credential storage
- Build targets: NSIS installer + portable EXE, both configured correctly in `package.json`
- `sync-app.mjs`: copies web assets into the Electron bundle before build
- **One gap:** `desktop/config.json` must be populated with real `supabaseUrl` + `supabaseAnonKey` before distributing. If shipped blank, the desktop app shows "Supabase credentials missing" on startup

### Android App
**Status: ⚠️ Functional but has a critical update distribution defect**

- `MainActivity.java`: WebView with hardware acceleration, DOM storage, HTTPS mixed-content enforcement, network monitoring, JS bridge (`AndroidInterface`, `AndroidLicense`), print manager, offline lease gate, cache-busted `loadUrl` on cold start
- `LicenseManager.java` + `LicenseBridge.java`: EncryptedSharedPreferences for lease storage — correctly implemented
- `WebAppInterface.java`: print bridge to Android PrintManager — implemented
- `build.gradle`: `minSdk 24`, `targetSdk 34`, release signing config present

**Critical: `versionCode 1`, `versionName "1.0.0"` — frozen since launch.**
This is called out explicitly in the build.gradle comments. The Play Store never gets a signal that a new version exists, so no user ever receives an OTA update through the Play Store. Every new release must be manually re-installed. This must be incremented before the next Android release.

**Package ID is still `com.doppiocafe.pos`** — visible in Play Store listing. The issue audit flags this as a separate decision: renaming requires a new Play Store listing (all existing installs are abandoned). Recommend leaving the package ID and only fixing the visible branding (splash emoji still references the old "Doppio Café" identity in `home.html`).

---

## Security Audit

| Control | Status |
|---|---|
| Runtime config via `/api/config` (no hardcoded keys in source) | ✅ Verified |
| CORS exact-match allowlist on all Edge Functions | ✅ Verified |
| Row-Level Security on all `doppio_*` tables | ✅ Verified — `FORCE ROW LEVEL SECURITY` with deny-all anon policies |
| XSS prevention — `esc()` used on all innerHTML interpolation | ✅ Verified |
| PIN reset — server-side hash, no client-side reset code | ✅ Verified |
| SuperAdmin sessions — signed, expiring HMAC token | ✅ Verified |
| Role enforcement — both sidebar (cosmetic) AND `activateTab()` route-level (enforced) | ✅ Verified |
| Danger Zone / Plan & Billing restricted to admin/owner | ✅ Verified |
| CSP in `vercel.json` | ✅ Verified — `script-src` allows only `self`, jsdelivr, cdnjs; `connect-src` restricts to `*.supabase.co` |
| `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` | ✅ Verified |
| Android: `MIXED_CONTENT_NEVER_ALLOW` | ✅ Verified |
| Electron: `contextIsolation: true`, `nodeIntegration: false` | ✅ Verified |
| API rate limiting (HTTP 429) | ✅ Live-tested and confirmed |

**⚠️ One security note:** `setAllowUniversalAccessFromFileURLs(true)` and `setAllowFileAccessFromFileURLs(true)` are set in `MainActivity.java`. These are overly permissive for a file-hosted app and could allow cross-origin file reads from local storage. Since the app loads from a remote HTTPS URL (not `file://`), practical exploitation is low but the flags should be removed in the next Android build.

---

## Database / Data Model Audit

### Fixed (confirmed in migrations)
- `doppio_table_sessions` table created with correct RLS
- `on_order_inserted_or_deleted()` trigger fixed — was referencing `NEW.table_number` instead of `NEW."tableNumber"` (camelCase mismatch that broke all QR ordering)
- `rs_normalize_table_key()` function created — consistent table key normalization between trigger and `tenant-public` lookup
- `API.upsert` is present in `doppio-api.js` (confirmed at line ~350 of the `api` object)

### Outstanding data-layer defects (from Naming Audit, not yet fixed in code)
These are cloud-save failures — records appear saved locally but never reach Supabase:

| Feature | Broken because | Impact |
|---|---|---|
| **Reservations** | Code sends `guestName`, `pax`, `tableNumber` — DB requires `guest_name` (NOT NULL), `party_size` (NOT NULL), `table_number`, `reserved_for` | Every reservation save silently fails cloud sync |
| **Offers / Promo codes** | Code never sends `title` — DB requires it (NOT NULL) | Offer creation rejected on every save |
| **Purchase Orders** | Code sends `poNumber`, `supplier`, `items` — DB requires `vendor_name` (NOT NULL), `item_name` (NOT NULL) | PO cloud saves rejected |
| **Inventory min-stock** | Code sends `threshold` — real column is in a separate `doppio_inventory_thresholds` table | Min-stock levels don't persist to cloud |
| **Vendors** | `contact` → should be `phone`; extra fields dropped | Partial save — core function works |
| **Customers/CRM** | `email`, `dues`, `marketing_opt_in` sent — none are columns | If live DB lacks these, full customer save fails |

These affect Growth Hub and Inventory modules. Core POS, billing, orders, and KDS are unaffected.

---

## UI/UX/CX Assessment

### Strengths
- **Responsive design** — confirmed breakpoints for mobile, tablet, desktop. POS layout shifts order types to cart sidebar on desktop to prevent overflow
- **Dark/Light theming** — persistent, FOUC-prevented via inline script before render
- **Glassmorphic design system** — consistent `restrosuite.css` design tokens throughout
- **Loading states** — FOUC guard hides `#app` until CSS confirmed loaded (2500ms safety timeout), boot spinner shown
- **Error handling** — global `window.onerror` + `onunhandledrejection` shows debug banner; `withToast()` pattern gates success toasts on actual async resolution
- **Accessibility** — skip-nav link, ARIA roles on tabs, ARIA `aria-expanded` on hamburger, `aria-label` on icon buttons, reduced-motion respect in animations
- **Toast notifications** — success/error variants with icons, 2.6s auto-dismiss
- **Offline resume** — login page detects and presents cached session

### Known UX gaps (from Issue Audit, P0–P1, not yet fixed)
- Touch targets on POS name/phone fields are 34px (below 44px Material minimum)
- Waiter/KDS add-to-cart and qty buttons are 26–28px
- Attention-blink animation class defined in CSS but not attached to tab badges (no visible blink on new orders)
- Reports category breakdown fix was documented but the bill `cat` field propagation should be verified with live data

---

## PWA Manifest Assessment

```json
{
  "start_url": "/login",
  "display": "standalone",
  "icons": [{ "sizes": "192x192" }, { "sizes": "512x512", "purpose": "maskable" }]
}
```

- ✅ `start_url`, `display: standalone`, `theme_color`, `background_color`, `orientation: any`
- ✅ Both icon sizes for Android and iOS home screen add
- ✅ `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` set
- ⚠️ Single PNG used for both 192×192 and 512×512 — no separate high-res icon. Will appear blurry at 512px on some launchers. Recommend a dedicated 512px asset
- ⚠️ No `screenshots` array in the manifest — Play Store and modern browsers use these for the "install app" prompt UI

---

## Deployment Checklist (blocking before launch)

These are not code changes — they are operational steps that must be completed:

| Step | Status | Notes |
|---|---|---|
| `supabase db push` — apply all migrations to production | ❓ Unverified | 47 migrations total. Must include `20260707120000_fix_table_session_trigger.sql`, `20260709120000_license_lease_backstop.sql`, `20260709140000_plan_pricing.sql` |
| Deploy Edge Functions: `supabase functions deploy tenant-public tenant-data` | ❓ Unverified | Required for QR ordering table session lookup and upsert operation |
| Set Supabase secrets: `SUPERADMIN_SESSION_SECRET`, `PIN_RESET_CODE_HASH`, `LICENSE_SIGNING_KEY`, `ALLOWED_ORIGINS` | ❓ Verify all set | Without `SUPERADMIN_SESSION_SECRET`, every login returns HTTP 500 |
| Set Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY` | ❓ Verify |  |
| Populate `desktop/config.json` before distributing EXE | ❓ Must be done | Blank config causes "credentials missing" on start |
| Smoke test — scan real table QR, place order end-to-end | ❓ Required | Confirms trigger + session + tenant-public are all live |
| Increment Android `versionCode` to ≥ 2 before next Play Store release | ❌ Not done | versionCode still 1 in build.gradle |

---

## Prioritised Fix List

### Must fix before public launch
1. **Run `supabase db push` + deploy Edge Functions** — without this, QR ordering, upsert sync, and license backstop are not live regardless of code state
2. **Verify all Supabase and Vercel secrets are set** — missing `SUPERADMIN_SESSION_SECRET` causes HTTP 500 on all logins
3. **Increment Android `versionCode`** — Play Store users can never receive updates until this is > 1

### Fix in first patch (within 1 week)
4. **Reservations, Offers, Purchase Orders field name mismatches** — these three features silently don't cloud-sync. Fix the client `MAP` in `db.js` to match the real DB columns (`guest_name`, `party_size`, `reserved_for`, `title`, `vendor_name`, `item_name`)
5. **Touch target sizes** — POS name/phone fields and KDS buttons below 44px minimum
6. **Attention-blink CSS** — add `.attention-blink { animation: blink 1.2s infinite; }` to activate the already-wired tab badge blinking

### Fix in next sprint (2–4 weeks)
7. **Remove `setAllowUniversalAccessFromFileURLs(true)`** from Android WebView settings
8. **Splash/branding cleanup** — replace remaining "Doppio Café" references in `home.html`, `android-app` splash assets, and `build.gradle` package description with RestroSuite
9. **Add 512×512 distinct PWA icon** and `screenshots` to manifest for richer install prompts
10. **Offline data queue (P2)** — IndexedDB write queue for true offline POS operation

---

## Test Suite

`npm test` → **82 tests, 0 failures** (confirmed in QA Fix Verification report). Covers:
- `database-contract` — every `TENANT_TABLES` entry has a migration and both browser/Edge adapters
- `staff-access` — role→tab maps consistent
- `security-contract`, `operations`, `domain`, `imports`, `observability`, `no-stub-ui`

The `no-stub-ui` test enforces that no `onclick="void(0)"` or "coming soon" placeholders exist — none were found in the source audit either, confirming this.

---

## Summary Table

| Dimension | Rating | Notes |
|---|---|---|
| UI implementation completeness | 🟢 100% | Zero stubs, all buttons wired |
| UX quality | 🟡 85% | Minor touch target and blink gaps |
| CX / customer workflows | 🟢 Ready | QR ordering, receipts, WhatsApp — all real |
| Web security | 🟢 Strong | CSP, CORS, RLS, HMAC sessions, XSS escaping |
| PWA offline capability | 🟡 Partial | Shell offline ✅, data offline ❌ |
| Desktop (Electron) | 🟢 Ready | Pending populated config.json |
| Android app | 🟡 Functional | versionCode freeze blocks Play Store updates |
| Database schema alignment | 🟡 Partial | 3 features with hard-broken cloud saves |
| Deployment readiness | ⚠️ Blocked | DB migrations + Edge Functions must be deployed |
| **Overall launch readiness** | ⚠️ **Conditional** | Fix 3 deployment gates + data mismatches = launch-ready |
