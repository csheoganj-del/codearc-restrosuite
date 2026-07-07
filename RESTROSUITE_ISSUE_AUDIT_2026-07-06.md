# RestroSuite — Issue Audit & Remediation Plan
**Date:** 2026-07-06 · **Scope:** 17 issues reported across Android app, PWA/dashboard, POS/waiter/KDS, WhatsApp gateway, and backend/data layer.

Each item below states what's actually in the code today (with file:line evidence), the root cause, the proposed fix, and an effort/priority call. Priorities: **P0** = fix this week (safe, high-impact, mostly small diffs), **P1** = next sprint (real but scoped features), **P2** = larger builds needing new infra or third-party setup.

---

## Phase 1 — P0 Quick Wins (est. 3–5 engineering days total)

### 1. Toasts firing before the DB write actually completes
**Found:** `dashboard.js:190` (tenant impersonation toast fires right before `location.reload()` — never seen), `:855` (`addToCart` toast fires synchronously, not tied to the save), `:1153` (KOT-sent toast fires without awaiting `RSPOS.kot()`), `:1768` (table-status toast fires without awaiting intermediate writes).
**Root cause:** Toasts were wired for instant UX feedback, not gated on the actual async Supabase call resolving.
**Fix:** Introduce one shared helper — `withToast(promise, {pending, success, error})` — and route these four call sites (and any others using the same pattern) through it: toast only fires in `.then()` (success) or `.catch()` (failure), never before the `await`. Grep the codebase for other `toast(` calls sitting before an `await`/`.then` and fix in the same pass.
**Effort:** S (1 day, mostly mechanical once the helper exists).

### 2. Attention items don't actually blink
**Found:** `dashboard-styles.css:626` defines `@keyframes blink` but it's never attached to a class other than `.status-dot.green`. `dashboard.js:1616` already toggles an `.attention-blink` class on tabs — but that class has no CSS animation, so nothing visibly blinks.
**Root cause:** One-line CSS rule missing.
**Fix:** Add `.attention-blink { animation: blink 1.2s infinite; }` and extend the same class to new-order badges, low-stock warnings, and the new "gateway offline" banner (see #8).
**Effort:** XS (under an hour).

### 3. POS name/phone fields too small
**Found:** `dashboard.html:450-451` — height 34px, no vertical padding, 12.5px font (Material minimum touch target is 44px).
**Fix:** Bump to 44px+ height, 10px vertical padding, 14px font.
**Effort:** XS.

### 4. Waiter/KDS buttons too small and cramped for fast tapping
**Found:** `order.html:150` add-to-cart button (28×28px), `:160` qty buttons (26×26px), `:213` cart row gaps (12px) — all below the 44px touch-target guideline, which slows staff down on tablets mid-rush.
**Fix:** Raise all interactive controls to 44px+ with ≥16px gaps; audit KDS card spacing the same way.
**Effort:** S (half day, CSS-only).

### 5. Stub tabs/buttons
**Found:** Audited `dashboard.html`, `index.html`, `kds.html`, `order.html` — every tab and button currently has a real handler (help button, tour buttons, nav tabs all wired). **No stubs found.**
**Action:** No fix needed now; add a lint/CI check that fails the build if a new `onclick="void(0)"` or "coming soon" placeholder is introduced, so this stays true.
**Effort:** XS (just the CI check).

### 6. PWA/browser stuck on old version after deploy
**Found:** `service-worker.js` already does `skipWaiting()` (line 80) and `clientsClaim()` (line 90) correctly — but `pwa.js` never listens for `updatefound` or a controller change, so the open tab has no idea a new version activated and never prompts a reload.
**Fix:** Add an update listener in `pwa.js` that shows a "New version available — Reload" toast/banner when a new SW takes control, plus `window.location.reload()` on confirm. This is the same underlying issue as the Android app's WebView cache (see #16) — different fix, same symptom.
**Effort:** S (half day).

### 7. HTML skeleton/flash on load
**Found:** `dashboard.html` has no critical inline CSS and renders `<div class="app" id="app">` (line 257) before any JS runs, with render-blocking stylesheets loaded normally. `login.html` already avoids this with an early theme-init script — `dashboard.html` doesn't follow the same pattern.
**Fix:** Mirror `login.html`'s approach: inline the minimal critical CSS, keep `#app` hidden (`display:none`) until first paint is ready, then reveal.
**Effort:** S (half day).

---

## Phase 2 — P1 Scoped Features (est. 2–3 weeks)

### 8. WhatsApp gateway down → notify immediately, every channel
**Found:** `whatsapp-gateway.js:407-456` already has `sendAdminAlert()` wired to email (Gmail SMTP) on disconnect/QR-needed/reconnect events (`:938-969`). That part works today.
**Missing:** No auto-restart/recovery hook in the pm2/PowerShell start scripts, no health-check endpoint, and — per your choice — no Telegram/SMS, desktop popup, or in-dashboard push yet.
**Fix:** Extend `sendAdminAlert()` to fan out to all four channels you asked for:
- Keep existing email.
- Add a Telegram bot notification (bot token + chat ID as new env vars — quick to add, reaches you anywhere).
- Add a lightweight desktop notification+sound on the PC running the gateway (e.g. `node-notifier`, triggered from the same disconnect handler).
- Write a `system_status` row to Supabase on disconnect; the admin dashboard subscribes to it via Realtime and shows a persistent, blinking "WhatsApp gateway offline" banner (reuses the blink fix from #2).
Also add a `/health` endpoint plus pm2 auto-restart config, so transient crashes recover without waiting on you.
**Effort:** M (3-4 days).

### 9. Manager-only POS mode (no KOT/waiter routing)
**Found:** Tab visibility is configurable per role today (`dashboard.js:4271-4276`, `allowed_tabs` in `supabase_migration.sql:15`), but that only hides UI — it does **not** stop orders from being queued to kitchen/waiter. **This feature doesn't exist at all currently.**
**Fix:** Add an `order_routing_mode` setting on the tenant (`'full'` vs `'pos_only'`), toggleable only by manager/admin. When `'pos_only'`: QR orders and POS orders still get created normally, but the routing step that queues them into KDS/waiter tables is skipped — they land directly in the manager's POS/order dashboard only. Needs changes in the order-creation path (wherever orders currently fan out to kitchen queue) plus a settings UI toggle.
**Effort:** M (3-4 days, touches order-creation logic so needs careful testing).

### 10. Onboarding: mandatory profile-completion step for new clients
**Found:** `src/dashboard/onboarding.js:260-368` has a dismissible "tour" that nudges toward completing the business profile, and `doppio_business_profile` table already exists with the right fields (business name, address, phone, GST, etc. — `20260601000000_core_pos_tables.sql:7-37`). What's missing is a **blocking** first-login widget — today it's a skippable tour, not a required step.
**Fix:** Build a modal/wizard shown on first login that must be completed (or explicitly deferred with a visible reminder) before the dashboard is fully usable, writing straight into the existing `doppio_business_profile` table via the existing edge function. Reuses existing schema — this is a UI-layer build, not a new data model.
**Effort:** S–M (2-3 days).

### 11. Roles: live sync without forcing re-login
**Found:** Role/permission model is solid — `tenant_users` table with role + `allowed_tabs` + `session_version` (`20260608110000_tenant_staff_identity.sql`), role→tab mapping enforced both client-side and at the Edge Function layer (`tenant-data/index.ts:76-127`). Today, a role change only takes effect after the affected user re-logs in (via `session_version` bump forcing session revocation).
**Fix:** Add a Supabase Realtime subscription on `tenant_users` scoped to the logged-in user; on a role/`allowed_tabs` change, push the update to re-render their nav live instead of waiting for the next login. Reserve the "force logout" behavior only for security-sensitive changes (e.g. deactivation).
**Effort:** S–M (2 days).

### 12. Disaster recovery — make it real, not just a doc
**Found:** `npm run backup` (`scripts/backup-db.js`) exists and dumps 29 tables to a local ZIP; `BACKUP_RESTORE_SOP.md` describes the *manual* restore steps. There is no scheduling and no automated restore script — it's a documented manual process today.
**Fix:** Put the existing backup script on a nightly schedule (cron on the server or a scheduled GitHub Action hitting an endpoint), retain N days, and write an actual restore script that mirrors the SOP steps instead of relying on a human following a doc under pressure. This dovetails with #13 below — once Google Drive export exists, nightly backups can also push an off-site copy there automatically.
**Effort:** S–M (2-3 days), most of the hard part (the backup logic itself) already exists.

---

## Phase 3 — P2 Larger Builds (est. 3-4+ weeks, needs external setup)

### 13. Google Drive backup/export/import (full OAuth auto-sync, per your preference)
**Found:** Zero existing Google API integration anywhere in the repo (`google`, `drive`, `oauth`, `googleapis` — no matches). Current backup is a global, not per-tenant, JSON/ZIP dump with no re-import path at all.
**Fix (full auto-sync, as you specified):**
- Set up a Google Cloud project + OAuth consent screen for RestroSuite (this needs your Google account and a few decisions from you: app name, verification status, scopes requested).
- Add a "Connect Google Drive" button in tenant settings; store the refresh token encrypted, scoped to that tenant.
- Extend the existing `backup-db.js` logic to scope by `tenant_id` (schema already supports this cleanly per the tenant-isolation audit) and upload the package to a "RestroSuite Backups" folder in the client's own Drive via the Drive API, on the same nightly schedule as #12.
- Build the **import** side: a picker to select a backup file from Drive, a schema/version check, and an upsert path (not a raw overwrite) so re-importing merges cleanly against `tenant_id` without creating duplicates — this is the trickiest part and needs real test coverage before going live with real client data.
**Effort:** L (1.5-2 weeks) — most of the time is OAuth plumbing + the import/merge logic, not the upload itself.

### 14. Offline PWA — make it actually usable with no network
**Found:** `service-worker.js:94-132` uses a network-first strategy and explicitly **skips caching anything under `/api/`** (line 99) — meaning billing/order data cannot be created or read at all while offline today; the SW currently only helps the static shell load, not real POS use.
**Fix:** This is the largest lift in the list. Needs an offline-write queue (IndexedDB) for orders/bills created with no connection, a background-sync step that replays queued writes once back online, and conflict handling for anything that changed server-side in the meantime.
**Effort:** L (1.5-2 weeks), and should be scoped/tested carefully — offline billing bugs mean real money discrepancies.

### 15. PDF bill generation reliability across devices
**Found:** `whatsapp-gateway.js` doesn't generate PDFs itself — it receives a pre-made base64 PDF and attaches it to the WhatsApp message (`:1921-1959`). Comments (`:2069, 2681`) point to a jsPDF-based edge function as the actual generator, which lives outside this repo/gateway.
**Fix:** Locate and audit that edge function directly (need to confirm which Supabase function it is) — if it depends on a headless-browser library like Puppeteer, that's the most likely source of "works on some devices, not others," since Chromium binaries can be missing or misconfigured in serverless environments. Recommend standardizing on a pure-JS PDF library (jsPDF, already referenced) so generation has no OS/binary dependency at all.
**Effort:** M (once the actual generator function is located; 2-3 days to standardize and add device-independent tests).

### 16. Android app: native-looking icons, correct branding, updates that actually land
**Found (all in `android-app/`):**
- Bottom nav uses Font Awesome web icons inside a WebView (`assets/dashboard.html:1033-1046`), not native Material icons — that's why it doesn't look like a "real" Android app.
- Splash and bundled web assets still reference the old "Doppio Café" branding (package is still `com.doppiocafe.pos`; splash uses a ☕ emoji plus leftover "Doppio" text in `home.html` and JS fallbacks).
- Update-stuck: WebView is set to `LOAD_DEFAULT` cache mode (`MainActivity.java:99`), the service worker's `CACHE_NAME` has to be bumped **by hand** on every release, and `versionCode`/`versionName` in `build.gradle` have been frozen at `1` / `"1.0.0"` since the start — so the Play Store (and any update check) has no signal a new version exists.
**Fix, staged:**
- Quick/safe now: swap the Font Awesome bottom-nav icons for a Material-style icon set (CSS/asset swap, no native rebuild), and replace the leftover Doppio splash/text assets with RestroSuite branding.
- Also quick: switch WebView cache mode to no-cache-first-then-network, automate the SW `CACHE_NAME` bump at build time (inject a timestamp), and actually increment `versionCode`/`versionName` every release going forward.
- Bigger, needs your decision: fully renaming the package (`com.doppiocafe.pos` → `com.restrosuite.pos`) forces a **new** Play Store listing — existing installs can't silently update onto a different package ID. Recommend doing this only if you're prepared for a relaunch; otherwise keep the current package ID and only fix the visible branding.
**Effort:** S for the branding/cache fixes (2-3 days); the package rename is its own project if you want it (flagging separately, not estimating without your go-ahead).

### 17. Sound announcement system
**Found:** Already exists and already toggleable — `service-alerts.js` plays a two-tone chime + one spoken announcement via Web Audio API and `speechSynthesis`, with a persisted mute toggle (`localStorage` key `rs_service_alert_mute`) and a visible mute button. No file dependencies, works across browsers.
**Action:** No fix needed. Worth extending the same toggle to the new "gateway offline" and "new order" blinking alerts so all attention-getting behavior is controlled from one settings switch.

### 18. Per-client settings isolation
**Found:** This is already solid — every operational table is scoped by `tenant_id` with foreign keys and `ON DELETE CASCADE`, unique constraints enforce one profile/menu-item/inventory-key per tenant, and Row-Level Security is forced on all tenant tables (`supabase_migration.sql:119-120`). No shared/global config found that should be per-client but isn't.
**Action:** No fix needed — call this out as a strength, not a risk.

---

## Suggested order of work

1. **This week:** items 1-7 (all P0, mostly CSS/small-JS, low risk, immediately visible improvements).
2. **Next 2-3 weeks:** items 8-12 — WhatsApp multi-channel alerting, manager-only POS toggle, mandatory onboarding widget, live role sync, and turning the backup script into a real scheduled/automated process.
3. **Following month:** items 13-16 — Google Drive OAuth backup/import, offline-capable PWA, tracking down and hardening the PDF generator, and the Android branding/update-mechanism fixes (with the package-rename decision called out separately).
4. **No action needed:** items 5, 17, 18 — already solid, just keep them from regressing.

One decision I need from you before starting Phase 3: whether to rename the Android package now (forces a new Play Store listing) or keep the current one and only fix the visible branding — I'd default to the latter unless you're already planning a relaunch.
