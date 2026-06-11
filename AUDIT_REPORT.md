# RestoSuite — Full-System Audit & Hardening Report

**Date:** 2026-06-11 · **Scope:** Web app, dashboard modules, Supabase edge functions & migrations, Android wrapper, WhatsApp gateway, deployment config, docs, tests.

---

## Overall verdict

This is a genuinely well-engineered product for its stage. The architecture — static frontend on Vercel, all data access proxied through service-role edge functions with signed session tokens, PBKDF2 (210k iterations) password hashing, per-action rate limiting, role/tab/table RBAC, plan entitlements, RLS migrations, CI with asset-parity checks and 71 passing tests — is well above typical solo-built SaaS. The main risks were a CORS misconfiguration, a few XSS gaps, and maintainability debt in the 17,000-line `dashboard.js` monolith.

---

## Fixed in this pass (verified: `npm run check` ✓, `npm test` 71/71 ✓, esbuild parse of all 8 edge functions ✓)

### Security

1. **CORS origin wildcard (HIGH).** All five authenticated edge functions (`tenant-access`, `tenant-data`, `tenant-admin`, `tenant-users`, `app-observability`) accepted any origin ending in `.vercel.app`. Anyone can host a page on a free `*.vercel.app` subdomain, so a malicious site could make credentialed cross-origin calls from a logged-in user's browser. Replaced with an **exact-match allowlist** driven by `ALLOWED_ORIGINS` (comma-separated, documented in `.env.example`). `tenant-public` keeps deliberately open CORS (public QR ordering, rate-limited server-side) — unchanged.
   → **Action needed: redeploy all five functions** (`supabase functions deploy <name>`). Optionally set `ALLOWED_ORIGINS` if you use preview deploys or a custom domain.

2. **Stored XSS via order data into KDS (HIGH).** The kitchen-display card renderer in `dashboard.js` interpolated `item.name`, qty, toppings/customizations, `orderId`, and `orderType` into `innerHTML` unescaped. QR guest orders flow into this surface, making it a stored-XSS vector into staff sessions. All fields now pass through `escHtml()`.

3. **XSS via tenant display name (MEDIUM).** Mobile brand title rendered the tenant name unescaped (`dashboard.js` ~line 9187). Now escaped / `textContent`.

4. **Timing side-channel in Razorpay webhook (LOW).** Signature comparison used `===`; replaced with a constant-time comparison.

5. **Supply-chain pinning (LOW).** `supabase-js` was loaded from CDN as floating `@2` in `login.html`, `dashboard.html`, `home.html`; now pinned to `@2.49.8` (matches package.json). Consider adding SRI hashes next.

### Reliability / correctness

6. **`npm test` was broken on Node 22 LTS** — `--test-isolation=none` is rejected (`node: bad option`). Removed the flag; suite runs and passes (71/71).

7. **Service worker offline fallback corrupted non-HTML requests.** Any failed GET (image, script, CSS) fell back to `login.html` HTML. Now only page navigations fall back; other failures return 504. Cache bumped to `restrosuite-shell-v2` so clients pick up the new worker.

8. **Android asset parity** — all changed web files re-synced into `android-app/app/src/main/assets/` (parity check passes).

### Config/docs

9. `.env.example` documents `ALLOWED_ORIGIN` / `ALLOWED_ORIGINS` for edge functions.

*Note: I briefly added `*.hf.space` to the CSP for the cloud WhatsApp gateway, then reverted it — your own security-contract test correctly forbids it while zero-cost mode is active. When you enable the paid gateway, update CSP + test together.*

---

## What's already strong (keep doing this)

- **Auth design:** no Supabase client-side auth bypass — everything goes through edge functions with the service role key server-side only; signed tenant/superadmin session tokens; credential recovery with expiring one-time tokens; superadmin recovery deliberately offline.
- **Defense in depth:** RLS tenant isolation migration on top of the proxy layer; per-table/tab/role write permissions; per-action rate limits keyed by hashed client IP.
- **Secrets hygiene:** no keys in source; runtime config via `/api/config`; `.gitignore` covers keystores, WhatsApp sessions, env files.
- **Ops maturity:** CI (Node 20/22 matrix, checks, tests, Vercel preview deploys), free-tier guardrail script, launch runbook, SOPs, QA checklist, test plan.
- **Offline-first POS:** tenant-namespaced localStorage + IndexedDB “resilience vault,” offline bill queue with replay, Android network-state bridge.
- **Marketing site:** strong SEO meta/OG/sitemap/robots, clear IA, accessible touches (skip link, aria roles, `prefers-reduced-motion`, focus-visible).

---

## Remaining gaps & roadmap (priority order)

### P1 — Architecture debt
- **`dashboard.js` is 17,311 lines.** You already extracted 14 domain modules (`src/dashboard/*`) — finish the job. Suggested order (lowest coupling first): KDS rendering → tokens/queue → reports → CRM → POS cart. Mechanics: move each tab's render + event-wiring into its module behind the existing `RestroSuite.<domain>` pattern, keep `dashboard.js` as orchestrator only. Target: <2,000 lines. Do it one tab per PR with manual smoke tests; there are no browser-level tests to catch regressions (see next point).
- **No browser/E2E tests.** Add Playwright with 4 smoke flows: login → POS bill → KDS bump → report view. This is the prerequisite for safely splitting the monolith.
- **`dashboard.html` (~4,400 lines) + inline styles** — extract per-tab partials when you split the JS.

### P2 — Security hardening (next round)
- **CSP still allows `'unsafe-inline'` scripts** — required today because pages have inline `<script>` blocks. Long-term: move inline scripts to files, then drop `'unsafe-inline'` (kills most residual XSS risk).
- **SRI hashes** on the two CDN scripts (supabase-js, xlsx).
- **Session storage:** signed tokens live in `sessionStorage` — acceptable, but document the trade-off; consider short token TTL + refresh if not already.
- **`qr-order.html` public inputs:** server should length-cap and strip control characters from guest-supplied fields (toppings/notes) at `tenant-public` — escaping now exists at render, add validation at write.
- **Android:** `setAllowFileAccess(true)` is required for the asset bundle but consider migrating to `WebViewAssetLoader` (https URLs) — removes the file:// trust zone and enables proper SW/cookie behavior.

### P3 — Performance
- `dashboard.js` (~17k lines) parses on every dashboard load — splitting (P1) enables per-tab lazy loading.
- Self-host the Inter/Outfit fonts and Font Awesome subset (icons used) — removes 2 render-blocking third-party origins and helps the CSP goal.
- Convert hero/menu PNGs to WebP/AVIF with `srcset` (current PNGs are the heaviest assets on the marketing page).
- Add `defer` to non-critical scripts in `dashboard.html` if not already.

### P4 — UX/UI polish
- The login/marketing design system is coherent (Swiggy-orange light theme). The dashboard still carries the older “brown-cream Doppio” theme in places — unify tokens into one shared CSS custom-property sheet.
- Add a visible offline banner state in the dashboard tied to the existing connectivity events (the plumbing exists; surface it consistently).
- Empty states: several tabs render bare “no data” text; add guided empty states (e.g., “Add your first menu item → button”) — big onboarding win for new outlets.
- Run Lighthouse on `/dashboard.html` logged-in (mobile) and fix the top items; the marketing page is already in good shape.

### P5 — Housekeeping
- `android-app/app/build/` (53 MB) and `node_modules/` (87 MB) exist on disk but are correctly untracked — run a periodic `git clean -ndX` check so they never slip in.
- Two legacy SQL files at root (`supabase_migration.sql`, `supabase_gateway_migration.sql`) duplicate what's in `supabase/migrations/` — mark as deprecated or delete to avoid drift.
- The `.kiro` auto-push-on-save hook commits on every save — consider disabling for refactor work; you want reviewable commits.

---

## Round 2 findings (launch-readiness pass)

10. **LAUNCH BLOCKER (fixed in code): live `SUPABASE_URL` env var is wrong.** Vercel serves `https://htkauiibuejetimfiavs.supabase.co/rest/v1/` from `/api/config` — the frontend appends `/functions/v1/...`, producing broken URLs. Login on production was likely failing. `api/config.js` and `config.js` now normalize the URL (strip trailing slashes and `/rest/v1`-style suffixes), so the next deploy fixes it even if the env var stays wrong. Still: **correct the Vercel env var to `https://htkauiibuejetimfiavs.supabase.co`**.
11. **`scripts/check-launch.cjs` was stale** — it required hardcoded Supabase keys in frontend files, contradicting the runtime-config architecture (it failed on current code). Rewritten: now *fails* if hardcoded credentials reappear, verifies runtime-config plumbing, enforces the exact-match CORS contract, and pulls live config from `/api/config` for backend probes (`SKIP_LIVE_LAUNCH_CHECK=1` for offline runs). All checks pass.

## Deploy checklist for this change set

1. `git diff` review, then commit.
2. `supabase functions deploy tenant-access tenant-data tenant-admin tenant-users app-observability razorpay-webhook`
3. (Optional) `supabase secrets set ALLOWED_ORIGINS=https://codearc-restrosuite.vercel.app,<other origins>`
4. Push → Vercel deploys static files (vercel.json unchanged in behavior).
5. Smoke test: login, POS bill, KDS view, QR order, offline reload (new SW v2 must activate — close all tabs once).
