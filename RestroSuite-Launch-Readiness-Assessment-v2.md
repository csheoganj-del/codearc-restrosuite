# RestroSuite — Launch Readiness Assessment (v2, post-fix)

**Date:** 9 July 2026
**Update:** This revises the 9 July v1 report after the code-level fixes were applied and verified against the actual source (not just the audit docs). Several items the v1 report inherited from older audits were already resolved in code; the genuinely open ones have now been fixed.

---

## Overall Verdict

**🟢 CODE READY — the only remaining gate is deployment (your Supabase/Vercel/Play Store steps in `DEPLOYMENT_RUNBOOK_2026-07-09.md`).**

Every code, data-layer, security, UX and manifest item is now green. Nothing further is required in the source tree before launch. What's left is operational: push migrations, set secrets, deploy functions, set env vars, ship the Android build, and run the five-point smoke test.

---

## What changed since v1

| Item | v1 status | Now | What was done |
|---|---|---|---|
| Android version freeze | 🔴 versionCode 1 | 🟢 | Bumped to `versionCode 2` / `versionName 1.0.1` in `android-app/app/build.gradle` |
| CRM cloud-save (`email`/`dues`/`marketing_opt_in`) | 🟡 columns missing | 🟢 | New migration `20260709160000_crm_customer_fields.sql` adds the columns; db.js gains a graceful fallback so saves succeed even pre-migration |
| Reservations / Offers / Purchase Orders field names | 🟡 "not yet fixed" | 🟢 | **Already fixed in code** — verified the db.js `MAP` sends correct snake_case (`guest_name`, `party_size`, `reserved_for`, `title`, `vendor_name`, `item_name`) backed by migrations `align_feature_columns` + `snake_case_column_rename` |
| Vendors / Inventory field names | 🟡 | 🟢 | Verified: `phone`, `terms`, `rating`, `items_count`, and legacy `threshold`/`label` columns all exist and are mapped correctly |
| Attention-blink on tab badges | 🟡 "not attached" | 🟢 | **Already wired** — `.attention-blink` + `tab-attention-pulse`/`rs-attention-blink` keyframes exist and are toggled from `dashboard.js` for QR/KDS/low-stock, with reduced-motion respected |
| Touch targets <44px | 🟡 | 🟢 | `.cust-qty-btn`, `.cart-qty-btn` raised to 44px; `.kds-eta-btn` chips given a ≥44px tap area |
| Android WebView file access | 🟡 over-permissive | 🟢 | `setAllowFileAccess`, `setAllowUniversalAccessFromFileURLs`, `setAllowFileAccessFromFileURLs` all set to `false` |
| PWA icons (single blurry PNG) | 🟡 | 🟢 | Rendered a crisp 512px icon and a padded maskable icon from the SVG; both referenced in the manifest and precached |
| PWA `screenshots` array | 🟡 missing | 🟢 | Added two `wide` screenshots for richer install prompts |
| Customer-visible "Doppio Cafe" fallback | 🟡 | 🟢 | UPI payee fallback and order-page placeholder guards replaced with neutral values |
| `desktop/config.json` credentials | ❓ unverified | 🟢 | Already populated with real `supabaseUrl` + `supabaseAnonKey` |

---

## Remaining (operational only — see the runbook)

| Step | Owner | Blocking? |
|---|---|---|
| `supabase db push` (46 migrations incl. the new CRM one) | You | Yes |
| Set secrets: `SUPERADMIN_SESSION_SECRET`, `PIN_RESET_CODE_HASH`, `LICENSE_SIGNING_KEY`, `ALLOWED_ORIGINS` | You | Yes — missing session secret = HTTP 500 on all logins |
| Deploy Edge Functions (`tenant-public`, `tenant-data`, `license-lease`, …) | You | Yes |
| Set Vercel env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, then `vercel --prod` | You | Yes |
| Build + upload Android `.aab` to Play Console | You | For the mobile update |
| Five-point end-to-end smoke test on the live URL | You | Final gate |

---

## Unchanged strengths (still green from v1)

- **Security** — runtime `/api/config` (no hardcoded keys), CORS exact-match allowlist, `FORCE ROW LEVEL SECURITY` on all `doppio_*` tables, `esc()` XSS escaping, signed/expiring superadmin HMAC sessions, route-level role enforcement, CSP + HSTS + `X-Frame-Options: DENY`, live-tested 429 rate limiting, Electron `contextIsolation`/`nodeIntegration:false`.
- **Desktop (Electron)** — single-instance lock, CORS origin rewrite, offline-lease gate, `config.json` populated. Ready.
- **Core app** — POS, billing/receipts, KDS, QR ordering, tax/GST worksheets, dashboards, settings, superadmin — all fully implemented, zero stub UI (enforced by the `no-stub-ui` test).

---

## Verification

- `npm test` → **82 tests, 0 failures.**
- All edits confirmed present via the file tools; each fix grep-verified in place.
- Migrations are additive and idempotent (`ADD COLUMN IF NOT EXISTS`) — safe to (re)run.

---

## Decisions intentionally left as-is

- **Android package ID `com.doppiocafe.pos`** — kept. Renaming forces a brand-new Play Store listing and abandons all existing installs; not worth it. Only the visible branding was cleaned.
- **`home.html` ("Doppio Cafe Nagpur")** — this is a **demo tenant storefront** served at `/home`, not RestroSuite product chrome. Rebranding a sample café to the platform name would be semantically wrong, so it's left as the demo it is.
- **Full snake_case migration of the remaining camelCase tables** (`doppio_bills`, `doppio_pending_orders`, etc.) — the QR-critical ones are already reconciled; a blanket rename is a planned, non-blocking cleanup, not a launch requirement.
