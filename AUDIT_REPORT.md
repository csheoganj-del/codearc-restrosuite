# RestroSuite Functional Audit Report

Date: 2026-06-18

Scope:
- Client dashboard tabs and POS workflow.
- Superadmin and gateway backend access.
- Supabase login/session and tenant-data read/write/update/delete path.
- Static inspection of action handlers that only toast or do not persist.

## Executive Summary

Launch readiness is not complete. Core Supabase Edge Function access is working, and the POS add-item to bill-preview workflow works in the browser. However, several visible actions are still toast-only, some data formatting is broken for live QR/KDS orders, admin screens can be visually exposed from a client dashboard role switch, and Android asset sync has an unrelated existing failure in `login.html`.

## Test Results

Passed:
- `npm run check:launch`
- Direct test suites:
  - `tests/security-contract.test.cjs`
  - `tests/database-contract.test.cjs`
  - `tests/domain.test.cjs`
  - `tests/imports.test.cjs`
  - `tests/observability.test.cjs`
  - `tests/operations.test.cjs`
  - `tests/staff-access.test.cjs`
- Syntax checks for key dashboard/API files.
- Live Supabase client login, session validation, tenant-data read, insert, update, delete, and cleanup.
- Live Supabase superadmin login, session validation, tenant listing, and gateway status.
- Browser POS workflow: add item, total update, Print & Pay, cart clear, bill preview modal, WhatsApp/Print/New order buttons.
- Mobile POS workflow at 390x844: menu view, cart view, checkout button visible.

Blocked/limited:
- `npm test` fails in this environment with `spawn EPERM`; running the same test files directly passed.
- `npm run check` fails because Android `login.html` is out of sync.

## Findings

### Critical - Client Role Switch Exposes Superadmin Screens

Evidence:
- `assets/dashboard.js:1953-1957` toggles Super-Admin UI for non-superadmin users.
- Live browser test showed Super-Admin and Gateway Monitor links became visible from the client dashboard.
- Backend calls fail without a superadmin token, but users can still see admin screens and error states.

Recommendation:
- Remove the production role switch or gate it behind an explicit development flag.
- Never reveal `super-admin-tab` or `gateway-monitor-tab` unless `RS_API.session().role === "superadmin"` and an admin token exists.

### High - Bill History Actions Are Toast-Only

Evidence:
- `assets/dashboard.js:426-428`
- Reprint only shows "Reprinting bill..."; it does not open the receipt preview or call print.
- Share only shows "Bill shared on WhatsApp"; it does not open/share a receipt.
- Refund only shows "Refund initiated"; bill status remains Paid and no backend update occurs.

Recommendation:
- Wire Reprint to the restored receipt preview/print flow using stored bill line items.
- Wire Share to WhatsApp receipt text generation.
- Wire Refund to a confirmed backend update and refresh bill status.

### High - QR/KDS Live Orders Show Invalid Time

Evidence:
- `assets/dashboard.js:272`, `assets/dashboard.js:291`, `assets/dashboard.js:302`
- Live pending order had `dateTime: "17/6/2026, 5:56:09 pm"`.
- Browser rendered `NaNh NaNm ago` and `NaN:NaN`.

Recommendation:
- Store pending-order timestamps as ISO strings.
- Use the existing custom locale parser in `src/dashboard/operations.js` when legacy localized strings are encountered.

### Medium - Cloud Write Failures Can Be Hidden by Local Fallback

Evidence:
- `assets/db.js:283` falls back to local cache after cloud failure.
- `assets/features-pos.js:212` saves bills without awaiting `RS.saveOne(...)`.

Recommendation:
- For billing, KOT, refunds, inventory writes, and customer creation, await persistence and show a clear sync warning if cloud save fails.
- Keep local fallback for offline mode, but label records as pending sync.

### Medium - Floor and Customers Tabs Initially Look Blank During Async Load

Evidence:
- `assets/features-growth.js:31` and `assets/features-growth.js:162`
- Browser test showed these tabs were blank at first, then rendered after waiting.

Recommendation:
- Render an immediate loading/empty state before `RS_DB.list(...)`.
- Replace blank panels with "Loading tables..." / "Loading customers..." and timeout fallback.

### Medium - Several Operational Actions Are Not Fully Connected

Evidence:
- `assets/dashboard.js:391-392`: QR merge and bill actions only toast.
- `assets/dashboard.js:452`: inventory purchase order draft only toasts.
- `assets/dashboard.js:566-567`: fallback editor edit/delete handlers only toast.
- `assets/features-growth.js:152-155`: aggregator accept/ready/reject/rider actions mutate local memory only.

Recommendation:
- For each action, define expected backend table/operation and wire success/error feedback.
- Disable or hide actions that are not implemented for production.

### Low - Android Asset Sync Check Fails

Evidence:
- `npm run check` reports: `Android asset is out of sync: login.html`.

Recommendation:
- Run the project sync process or manually sync `login.html` into the Android asset copy after confirming no Android-specific changes are needed.

## Backend Verification Details

Client tenant `doppiocl`:
- Login: passed.
- Validate session: passed.
- `doppio_menu` select: passed.
- Temporary `doppio_draft_orders` insert: passed.
- Temporary update: passed.
- Temporary delete: passed.
- Cleanup verification: passed.

Superadmin:
- Login: passed.
- Validate session: passed.
- `list_tenants`: passed, 3 tenants returned.
- `gateway_status`: passed.

## Launch Readiness

Status: Not ready for full production launch.

The backend contracts and core POS checkout are functional, but production launch should wait until:
- Unauthorized superadmin UI exposure is removed.
- Bill History reprint/share/refund are fully wired.
- QR/KDS date parsing is fixed.
- Critical writes surface cloud persistence failures.
- Async tabs show loading states.
- Android sync check is resolved.
