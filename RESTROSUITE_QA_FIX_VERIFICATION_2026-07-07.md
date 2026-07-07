# RestroSuite — QA Fix Verification & Launch Readiness

**Date:** 7 July 2026
**Scope:** Re-open the prior "Live QA Audit" findings, verify each fix in the actual codebase, repair anything incomplete, and re-assess launch readiness.
**Method:** Source-level verification of the canonical repo (repo-root `assets/`, `src/`, and `supabase/` trees), plus the project's own automated test suite. The prior audit's five launch-blockers and three secondary issues were each traced to the code that fixes them.

---

## Verdict

**All eight audited issues are resolved in committed, pushed code**, and the full automated suite (82 tests) passes. The remaining gate is **deployment**, not code: the Supabase migration and two Edge Functions must be applied to the production project (a git push does not run them). Once deployed and smoke-tested with a real QR scan, this is launch-ready.

---

## Verification of each audit finding

All fixes landed in commit `1d4517e` ("Fix QA audit issues…") plus loader-fix `67a83b8`, both already on `origin/main`.

### 1. Role permissions not enforced in the dashboard — FIXED
- `assets/dashboard.js` builds a per-role tab list (`ROLE_TAB_MAP`), prefers the backend-computed `allowed_tabs`, and a non-admin role that resolves to nothing gets POS only — never the full dashboard.
- Enforcement is in **two layers**: cosmetic sidebar/mobile-nav/more-sheet hiding (`applyStaffRoleTabFiltering`) **and** route-level blocking inside `activateTab()`, so a saved tab, URL hash, global search, or the mobile "More" sheet cannot open a restricted screen.
- Re-applies on hydration and on live role changes (Supabase realtime `tenant_users` subscription).
- Server-side defence: `supabase/functions/tenant-data` enforces `TABLE_TAB_ACCESS` and `TABLE_WRITE_ROLES`, so a tampered client still can't read/write tables outside its role.

### 2. Settings / Danger Zone open to every role — FIXED
- `renderSettings()` (`assets/features-shell.js`) shows a "Settings is restricted" lock screen for any role below manager; **Plan & Billing** and **Danger Zone** are filtered out of the settings nav for anyone who isn't owner/admin.
- The destructive **Reset Outlet Data** button has an independent defence-in-depth check that refuses to run for non-owner/admin roles even if the pane is somehow rendered.

### 3. QR table ordering ("Table Session Closed") — FIXED
This was the deepest issue; the real root cause was a database trigger bug, now fixed in `supabase/migrations/20260707120000_fix_table_session_trigger.sql`:
- The `on_order_inserted_or_deleted()` trigger referenced `NEW.table_number`, but the column on `doppio_pending_orders` is camelCase `"tableNumber"`. Every KOT insert was aborting with *"record 'new' has no field table_number"* — so orders never reached the cloud **and** table sessions were never opened. Fixed to `NEW."tableNumber"`.
- Table keys are now normalized identically on **write** (trigger `rs_normalize_table_key`) and on **read** (`normalizeTableKey` in `tenant-public`), so "Table 05" and "5" resolve to the same session (previously a guaranteed miss).
- `doppio_table_sessions` table is created with RLS + realtime; sending a KOT auto-opens an active session; deleting the last pending order auto-closes it.
- The customer page's `get_active_session` action exists in `supabase/functions/tenant-public` and returns an HMAC-**signed** session token for active tables.
- `doppio_table_sessions` is registered in `tenant-data`'s `TENANT_TABLES`, `TABLE_TAB_ACCESS`, and `TABLE_WRITE_ROLES`, and in the browser adapter — so staff writes are permitted and the DB-contract test passes.

### 4. `API.upsert is not a function` (sync layer) — FIXED
- The `API` proxy in `assets/db.js` was missing an `upsert` method; it now proxies to `RS_API.upsert`, which already existed in `assets/doppio-api.js`. The `tenant-data` Edge Function supports the `upsert` operation (with a required tenant-scoped conflict key). The console error loop is gone.

### 5. Employee Ledger → "Logins" tab crash (`safe is not defined`) — FIXED
- `assets/features-manage.js` now defines `const safe = esc;`, the aliased HTML-escaper the Logins render path expected.

### Secondary issues — all FIXED
- **Hold/recall mislabeling:** recalling a held "Walk-in / Takeaway" cart no longer overwrites an actively selected dine-in table (`assets/features-pos.js`).
- **Reports "Uncategorized":** bill line items now carry a `cat` field, which the Reports category breakdown reads.
- **WhatsApp gateway retry storm:** topbar status polling uses adaptive exponential backoff, capped at 5 minutes, and pauses on hidden tabs.

---

## Test results

`node --test tests/*.test.cjs` → **82 passed, 0 failed.** This includes:
- `database-contract` — every `TENANT_TABLES` entry (now including `doppio_table_sessions`) has a `CREATE TABLE` migration and is exposed by both the browser and Edge adapters.
- `staff-access` — role→tab maps are complete and consistent.
- `security-contract`, `operations`, `domain`, `imports`, `observability`, `no-stub-ui`.

The `tests/qr-live-harness` end-to-end suite could not run **in this Linux sandbox** because the installed `esbuild` is the Windows native binary (node_modules came from your Windows machine). It should run normally on your PC via `node tests/qr-live-harness/run.js`.

---

## Required before you flip the switch (deployment, not code)

1. **Apply the DB migration** to production Supabase: `supabase db push` (adds `doppio_table_sessions`, the fixed trigger, and `rs_normalize_table_key`). The migration is self-contained and safe to re-run.
2. **Deploy the two Edge Functions:** `supabase functions deploy tenant-public tenant-data`. Without this, `get_active_session` and the table allowlist won't be live and QR ordering stays broken even though the frontend is deployed.
3. **Frontend** deploys automatically on push to Vercel — confirm the latest build is live.
4. **Smoke test on a real device:** log in as a non-admin role (confirm restricted sidebar + blocked deep-links), open a table's QR, send a KOT from POS, then scan the table QR and place an order end to end. Confirm the console no longer logs `API.upsert is not a function`.

---

## Note on repository layout

There is a stale, untracked duplicate backend under `codearc-restrosuite/supabase/…`. It is **not** what the tests or deployment use — the canonical, deployed backend is the repo-root `supabase/` tree. Work only in the root tree to avoid editing a copy that never ships.
