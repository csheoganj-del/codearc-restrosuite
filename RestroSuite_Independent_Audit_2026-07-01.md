# RestroSuite — Independent Functional Audit

**Date:** 1 July 2026
**Method:** Live click-testing of the production site (restrosuite.codearc.co.in) with real network/console inspection, plus direct source-code verification (not reliance on prior self-written audit docs). Every claim below is backed by a file:line citation, a live HTTP response, or a reproducible browser action.

This audit exists because the repo already contains several self-generated "GREEN / READY, 78/78 tests passed" reports (`LAUNCH_READINESS_AUDIT_2026.md`, `FULL_TEST_REPORT.md`, `ROLE_TEST_REPORT.md`, all dated 29-30 June 2026) that read as generic checkmark tables with no evidence trail. This audit independently re-verifies their claims against the live site and current code.

---

## 1. Is "realtime" real?

**Yes — genuinely implemented, not faked.** The dashboard opens real Supabase Realtime WebSocket subscriptions (`assets/dashboard.js:4021-4101`, `setupTenantDataRealtime()`) using `.channel(...).on('postgres_changes', ...).subscribe()` for bills, pending/KDS orders, employees, attendance, CRM, menu, and inventory, scoped per tenant. The underlying Postgres tables are actually enrolled in the `supabase_realtime` publication via two real migrations (`20260609090000_client_dashboard_realtime.sql`, `20260630090000_enable_inventory_notifications_realtime.sql`). The WhatsApp gateway also runs its own realtime listener to auto-fire receipts on new bills.

The handful of `setInterval` calls in the codebase are cosmetic (a 1-second KDS countdown re-render, a 2-minute app-version check, a 2-second tab-blink animation) — not disguised polling standing in for "live" data. Data refresh is event-driven (realtime push, or tab-focus/reconnect), which is the correct architecture.

One gap: the `.subscribe()` calls have no status callback, so a silently-dropped channel (e.g. after a long tab sleep) has no visible reconnect indicator beyond the existing online/offline resync fallback. Not fake, just under-instrumented.

## 2. Do the buttons/workflows actually work?

**Mixed — most core money-and-order paths are real; several secondary actions are still dead stubs.**

Genuinely wired to real persistence (verified in source, several also verified live):
- POS checkout, cart, GST calculation — confirmed live: instant, correct math, no lag.
- Bill History reprint (opens real receipt from stored line items), share (builds a real WhatsApp deep link from the actual bill), refund (writes `status/refund_reason/refunded_at` to the cloud `doppio_bills` row, PIN-gated, with honest "cloud sync pending" messaging if the write fails instead of a blind success toast).
- Inventory "Raise Purchase Order" — persists via `RS.saveOne('purchase_orders', ...)`.
- QR/online order Accept / Mark Served / aggregator Accept-Ready-Reject — all call `RS_DB.put(...)` and persist.
- Cloud-write failures are now surfaced to the user (a status pill + `rs:cloud-fallback` event) instead of silently falling back to local-only storage.
- Superadmin UI exposure (previously a real security bug — client role switch revealed admin screens) is fixed: visibility and tab routing are now both gated by the actual backend session role, and the old client-side toggle has no click handler left.

Still fake or dead (contradicts the "GREEN/Ready" reports):
- **QR table "Merge" button** — `dashboard.js:1634`: `toast('Table merge is not connected yet')`. Honest label, but not implemented.
- **Growth Hub "Broadcast" and "Offer campaign" buttons** — `features-growth.js:610` and `:914`: both just toast `"...are not connected yet"`. The audit report's "Growth Hub modules 🟢 Ready" is false for these two.
- **Inventory table "Edit" (pencil) icon** — no click handler exists anywhere in the codebase. Clicking it does nothing at all — not even a toast. Contradicts "Inventory management 🟢 Ready."
- **Menu Editor** — a toast-only fake save/delete implementation still exists in `dashboard.js` (shows "Item removed" without touching the menu data). It's currently dead code, shadowed by a real implementation in `features-editor.js` which loads afterward and overwrites it — but if that file ever fails to load, the fake, silently-broken version becomes active with zero error surfaced.

## 3. Live bugs found by actually clicking through the production site

These were reproduced live on **restrosuite.codearc.co.in**, not just read from source:

**a) WhatsApp receipt sending is down right now, and the UI hides the failure.**
Clicking "Send WhatsApp Invoice" (both the homepage sandbox and, per code review, the same code path used for real receipts) fires `POST /api/sandbox-send`, which currently returns **HTTP 503 "Tunnel Unavailable"** — the Hugging Face Space hosting the WhatsApp gateway is asleep/unreachable. That part is an infra outage, not fraud. The real bug: `index.html:1645-1646` clears the cart and phone field **unconditionally**, whether the send succeeded, failed, or threw an error. A user sees a red error toast for half a second and the form resets as if it worked. Confirmed via network tab (503 response) and by reading the exact unguarded reset code.

**b) On the live customer QR-ordering page, tapping a menu item card (instead of its small "+" button) throws a JS error and silently does nothing.**
Tested on the real, live tenant "Big Bites Ballymahon" (`order.html?tenant=bbb&table=1`). Root cause: `order.html:618` builds the card's `onclick` attribute with a template-string bug that omits a closing parenthesis and quote — `onclick="addItem('ItemName'">` instead of `addItem('ItemName')">`. The browser throws `SyntaxError: missing ) after argument list` (captured live in the console) and the click is swallowed. The dedicated "+" button on each card works fine (it has its own, correctly-closed handler with `stopPropagation`), so most users won't notice — but anyone tapping the item name/description/price area, which is the larger and more natural tap target, gets nothing and no feedback.

**c) Currency/tax localization looks wrong for at least one live tenant.**
"Big Bites Ballymahon" (a takeaway in Ballymahon, Ireland, per its name and its fish-and-chips/kebab-heavy menu) is priced and taxed entirely in Indian conventions: every item shows a **₹** symbol, and the cart breakdown labels tax as **"GST"** rather than VAT. This may be a tenant on-boarding/configuration gap rather than a platform-wide bug, but as observed live it means a real customer-facing checkout is showing the wrong currency and tax label.

**d) Things that genuinely worked well live:** page load is fast (TTFB 159ms, full load 855ms), the interactive POS sandbox on the homepage updates totals instantly with no spinner, the real QR menu for a live tenant loaded 200+ items correctly, add-to-cart (via the correct button) and the cart drawer (quantities, subtotal, tax, total, name/phone fields, Place Order) all rendered smoothly and matched the "sub-millisecond local checkout" claim for local interactions.

## 4. Is the test suite meaningful, and does it actually pass?

Ran `npm test` directly today: **77/78 passing**, not the 78/78 claimed in three separate reports dated 29-30 June. The one failure (`tests/domain.test.cjs:273`, payroll calculation) is not flaky — it's a **date-dependent bug**: `src/dashboard/people.js` computes loss-of-pay deductions using the number of days in the *current* calendar month rather than a fixed pay-period length. The hardcoded test expectation assumed a 30-day month; today is July (31 days), so the same unmodified test now fails. This is proof that the "78/78, GREEN" reports were only true on the specific day they were written and were never re-verified since — and it's also a real payroll-math bug independent of the test.

Of the 78 tests, roughly half (`domain.test.cjs`, `operations.test.cjs`, `staff-access.test.cjs`) genuinely execute imported business logic and check computed results. The other half (`security-contract.test.cjs`, `database-contract.test.cjs`, `imports.test.cjs`, `observability.test.cjs`) only read source files as text and regex-match for the presence of certain code patterns — they never run the application, so they can't catch logic bugs, only "did someone delete this line." Two other files in the repo billed as tests aren't: `test-checkout-flow.js` is a screenshot script with zero assertions, and `scratch-pos-test.js` is corrupted — 4,986 bytes of null characters, no code at all.

## 5. UI/UX/CX and marketing-page honesty

The actual product screens (POS, dashboard, QR ordering, bill drawer) are visually polished, responsive, and fast where they work, consistent with the "premium SaaS" self-description.

The public marketing homepage makes claims that could not be verified and look inconsistent with a project whose own documentation references only a couple of real pilot tenants (`bbb`, `doppiocl`): a "1,420+ outlets" counter, three named "★★★★★ VERIFIED CUSTOMER PROOF" testimonials (Aarav Mehta/The Spice Bistro, Priya Sharma/Cafe Boho, Rahul Kapoor/Urban Tandoor), and a "TRUSTED BY" logo strip (The Spice Bistro, Cafe Boho, Urban Tandoor, Brew & Co, Masala House, Pixel Pizza) that reads as placeholder/demo branding rather than real named clients. None of this is a code defect, but if these are not real customers, labeling them "verified" is a factual-accuracy problem worth fixing before wider launch.

## 6. Prior audit reports vs. reality — direct contradictions found

| Prior report claim | Reality found today |
|---|---|
| "78/78 tests passed" (Full Test/Role Test/Launch Readiness reports) | 77/78 — one reproducible, date-dependent failure |
| "Growth Hub modules 🟢 Ready" | Broadcast and Offer-campaign buttons are still toast-only stubs |
| "Inventory management 🟢 Ready" | Inventory Edit button has no handler at all — completely dead |
| "Bill reprint/share/refund 🟢 Ready" | Verified true — this one genuinely holds up |
| "Globalization... fully functional" | At least one live tenant shows wrong currency symbol and tax label |

---

## Bottom line

This is not a bogus, all-fake demo — the core billing, refunds, QR ordering, inventory PO, and realtime dashboard sync are genuinely built and, for the most part, genuinely work, and they were fast and responsive in live testing. But it is also not the uniformly "GREEN / READY" product the newest self-authored reports claim. There are real, currently-live bugs (WhatsApp send silently fails and clears the cart anyway; a menu-card click bug on a real live tenant's ordering page; wrong currency/tax label for at least one live tenant), several buttons that are still honest-but-unfinished stubs (QR merge, Growth Hub broadcast/offers), one that's silently completely dead (Inventory Edit), a test suite that oversells its coverage and wasn't actually re-run before the last three reports were written, and marketing claims (1,420+ outlets, named "verified" testimonials) that don't appear to be substantiated anywhere in the codebase's own tenant data.
