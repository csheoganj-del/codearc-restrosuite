# RestroSuite Live QA Audit — 7 July 2026

**Method:** Live testing against production (`restrosuite.codearc.co.in`), not a code review and not a rehash of prior audit documents. A disposable test outlet ("Claude QA Test Kitchen") was provisioned directly in Supabase with one login per role, so nothing touched the real Doppio Cafe Nagpur tenant or its data. Every role was logged into fresh, the sidebar and key actions were exercised, a full POS sale was rung up and billed, the QR customer-ordering flow was tested end-to-end, and the offline-first sync layer was inspected. All test tenants and accounts were deleted from Supabase at the end of the session — nothing was left behind.

**Verdict: NOT launch-ready.** Core billing works, but there is a critical, reproducible access-control failure plus a broken sync function that quietly disables QR ordering. Both should be fixed before real staff and customers rely on this.

---

## What works correctly

- **Owner/admin login and full dashboard** — every tab (POS, Floor & Tables, KDS, Inventory, Menu Editor, Reports, Employees, Settings, etc.) loads without errors.
- **Core POS sale, cash payment, and bill generation** — added items, sent a KOT, took a cash payment, and got a correctly formatted GST bill (`RS-20260707-001`) with WhatsApp/print/refund actions in Bill History and revenue correctly rolled up into Reports.
- **Dine-in table occupancy tracking** — when a table is selected cleanly (not carried over from a held Takeaway cart) and a KOT is sent, Floor & Tables correctly flips the table to "Dining" with the right order value.
- **Menu Editor, Inventory, Online Orders (aggregator) screens** — all render cleanly with no console errors on a brand-new outlet.
- **Registration flow** — the two-step outlet signup (business info → owner info) and WhatsApp OTP verification work as designed; new signups correctly land in a "pending CodeArc approval" state rather than going live immediately.
- **Offline-first architecture is genuinely present** — service worker registers, and the app shell (95 files: HTML, CSS, JS) is precached, so the app has what it needs to launch without a network connection.
- **Superadmin console is properly locked down** — there is no way to reach it without a platform-owner-controlled deployment secret, and it isn't guessable from anything in the app. This wasn't tested live (by design, no credentials exist outside CodeArc's own secret store), which is the correct security posture, not a gap.

---

## Critical, launch-blocking issues

### 1. Role permissions are not enforced anywhere in the dashboard UI
This is the most serious finding. RestroSuite's own marketing promises "role-controlled access for every staff member," and the backend *does* correctly compute a restricted tab list per role (verified directly from the session data). But the dashboard sidebar ignores that list entirely.

Verified with a from-scratch account in an isolated incognito tab: a **Kitchen** role login (which should only ever see the Kitchen Display) landed on **Point of Sale** by default and had full sidebar access to POS, Floor & Tables, Bills, Inventory, Menu Editor, Online Orders, and Settings. The same was true for **Cashier** and **Waiter** test accounts. In practice, any staff login — kitchen, waiter, cashier — can ring up sales, edit the menu, view financials, and manage inventory, regardless of what the owner configured for them.

### 2. Settings — including a full data-wipe button — is open to every role
Settings (Outlet Profile, Taxes, Printers, WhatsApp Gateway, Payments, Team & Roles, **Plan & Billing**, and **Danger Zone**) is not gated by the role/tab permission system at all. A Cashier account reached **Danger Zone → "Reset Outlet Data"** — a button that permanently deletes all bills, transactions, customer profiles, menu items, staff, and inventory for the outlet — and could also open **Plan & Billing** to see/change the subscription plan. This was confirmed for Cashier and Manager; combined with finding #1, it's reasonable to assume every role can reach it.

### 3. QR table ordering — a flagship feature — doesn't actually work
Scanning a table's QR code always shows "**Table Session Closed**," even after staff seat the table and send a KOT through POS (which does correctly mark the table "Dining" in Floor & Tables). The customer-facing order page checks a separate `doppio_table_sessions` record in the cloud database that never gets created, because of finding #4 below. End to end, a real customer scanning a real table QR code cannot place an order.

### 4. The offline-sync layer is throwing a broken-function error, continuously
From the moment of login onward, the browser console repeats, roughly every 30–60 seconds:
`[RS_DB] initial/background getSettings sync failed: API.upsert is not a function`
This is a genuine JavaScript error (not a network hiccup) and it never stops on its own. It explains finding #3 — table sessions are supposed to sync to the cloud through this same `upsert` mechanism, so they silently never arrive. It very likely affects other data types that rely on the same sync path (settings, and possibly other write-behind data) whenever the local cache tries to reconcile with the cloud.

### 5. Employee Ledger → "Logins" tab crashes
Clicking Settings → Team & Roles → Manage Team → **Logins** throws `safe is not defined` and shows nothing. This is the screen meant to let an owner see/manage staff login credentials.

---

## Secondary issues

- **Order-type mislabeling under a specific sequence:** if a cart is started in Takeaway mode, put on hold, and then recalled after switching to Dine-in + selecting a table, the resulting KOT, kitchen ticket, and printed bill all say "Walk-in / Takeaway" instead of the actual table — even though the correct table was visibly selected. This is a real, reproducible bug, but narrower than it first appeared: a clean Dine-in flow (select table, then order) labels and tracks the table correctly.
- **Reports category mismatch:** a menu item correctly tagged "Mains" shows up as "Uncategorized" in the Sales Reports category breakdown.
- **Sign-out / heavy background retry traffic:** the dashboard's continuous WhatsApp-gateway reconnect attempts (shown as "Scan to Connect" / "WhatsApp Starting…" almost permanently, since no gateway was configured for this test outlet) made the tab appear to hang for automated tooling after clicking Sign Out. Worth checking on a real device/slow connection — persistent reconnect loops can drain battery/data even when they don't visibly break anything.

---

## Not fully tested

- **True offline (airplane-mode) ordering and reconnect-sync** — confirmed the architecture (service worker + local cache) is in place, but a live network-cutoff test wasn't performed. Given finding #4, I'd treat "syncs when reconnected" as unproven until that `API.upsert` error is fixed and reconnection is verified live.
- **Captain and Inventory roles individually** — not logged into separately, since Kitchen, Cashier, Waiter, and Manager already proved the sidebar/permission bug is systemic rather than role-specific.

---

## Recommendation

Do not launch to real staff/customers until: (1) the frontend actually filters the sidebar and route access by the role's `allowed_tabs`, (2) Settings — especially Danger Zone and Plan & Billing — is restricted to Admin/Owner only, (3) the `API.upsert is not a function` bug is fixed and QR ordering is verified working end-to-end with a real customer scan, and (4) the Employee Ledger "Logins" crash is fixed. These aren't polish items — #1 and #2 mean any staff member can currently delete a restaurant's entire operating history, and #3 means the QR ordering feature you're marketing doesn't function.
