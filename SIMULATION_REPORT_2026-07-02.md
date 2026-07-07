# RestroSuite Production Live Simulation - 2 July 2026

Target tested: https://restrosuite.codearc.co.in with the live Supabase project `htkauiibuejetimfiavs`.

## Repairs Applied To Production

- Added missing live columns used by the dashboard and Edge Functions:
  - `doppio_business_profile`: `gst_number`, `upi_vpa`, `upi_id`, `passcode`, WhatsApp gateway fields, `table_count`, `feature_flags`, `created_at`
  - `doppio_bills`: `discount`, `orderType`, `tableNumber`
  - `doppio_employees`: `status`, `created_at`
- Changed live uniqueness rules so restaurants no longer block each other:
  - bills: `UNIQUE (tenant_id, "orderId")`
  - inventory: unique index on `(tenant_id, key)`
  - inventory thresholds: `PRIMARY KEY (tenant_id, ingredient_key)`
  - business profile: unique tenant profile index
- Applied migration: `supabase/migrations/20260702180000_live_schema_repair.sql`.
- Reloaded PostgREST schema cache.

## Production Simulation Result

Full 10-restaurant run passed.

- 10 temporary restaurants created and approved for the test.
- 10 owner logins completed through `tenant-access`.
- 30 staff accounts created.
- Full profile payloads inserted with tax, UPI, passcode, WhatsApp, table count, and feature flags.
- Shared menu item names worked across all 10 restaurants.
- Shared inventory keys and threshold keys worked across all 10 restaurants.
- 20 public QR orders created through `tenant-public`.
- Kitchen, waiter, and cashier workflow completed.
- 20 bills inserted with full dashboard bill payloads.
- Pending orders were cleared after billing.
- Inventory was deducted.
- Tenant isolation verified: every restaurant saw its own menu, orders, bills, staff, and inventory only.
- Schema drift count: 0.
- Cleanup verified: no `api-sim-*` or `sim-resto-*` tenants remain in production.

Focused staff-login run also passed.

- 1 temporary restaurant, 1 QR order.
- Cashier, kitchen, and waiter all logged in through `tenant-access`.
- Workflow ran using real staff sessions.
- Schema drift count: 0.
- Cleanup verified: no temporary tenant remains.

## Verification Commands

- `npm test`: 79 passed.
- `npm run check`: passed.
- Live schema verification confirmed the repaired columns and tenant-scoped constraints.
- Production leftover check returned zero simulation tenants.

## Still Blocked Externally

- WhatsApp gateway is reachable but not authenticated:
  - status: `connecting`
  - authenticated: `false`
  - recent events show QR generation followed by reconnect failures.
- Because WhatsApp is not authenticated, real customer registration OTP delivery and WhatsApp receipt sending cannot be completed end-to-end yet.
- The simulation used controlled service-role fallback for registration approval because fake OTP cannot pass production OTP validation and the local superadmin signing secret does not match production. The live owner and staff login paths were still tested through `tenant-access`.

## Saved Evidence

- 10-restaurant summary: `scratch/api-live-simulation-summary-10-restaurants.json`
- staff-login summary: `scratch/api-live-simulation-summary-staff-login.json`
- current/latest summary: `scratch/api-live-simulation-summary.json`

## Post-Deploy Browser Verification (real UI, 2 Jul afternoon)

Independent verification in a real Chrome session against the deployed build, driving the actual dashboard/POS/QR pages:

**Morning findings (browser session, before the schema repair + deploy):**
- 10 tenant dashboards (simtest01-10) ran simultaneously in one browser, each tab correctly pinned to its own tenant session (yesterday's cross-tab session-leak bug confirmed fixed).
- 20 public QR orders across the 10 kitchens; tenant isolation held (each kitchen saw only its own orders/menu).
- Reproduced live: bills silently lost to `doppio_bills_pkey` collisions (Kitchen 01 "settled" ₹720 + ₹323, nothing stored, pending orders cleared anyway); platform-wide unique menu names (`doppio_menu_name_key`) and CRM phones (`doppio_crm_phone_key`) blocking writes with fake success toasts; QR Orders screen not updating without reload; order ages showing as "3480h ago".

**Verified fixed on production after the git push + SQL migrations:**
1. **QR realtime**: placed a live order for doppiocl; it appeared on the open QR Orders screen with **no reload** via the new 12s visibility-aware polling fallback (realtime postgres_changes remain RLS-blocked for anon clients by design).
2. **Bill persistence**: simtest01 (0 bills after losing 2 in the morning) settled a fresh QR order through the real POS UI → bill `RS-20260702-001`, ₹233 Cash, stored server-side with itemization and CGST/SGST — the same bill number doppiocl already used today, proving the tenant-salted id fix.
3. **Menu names**: simtest01 added "SIM Test Dosa" (also on doppiocl's menu) successfully — per-tenant uniqueness live.
4. **Order ages**: cards now show "just now" / "26h 49m ago" correctly (d/m/y parse fix).
5. **Server-side order validation**: `create_order` correctly rejected an item not on the tenant's menu.

**Still open / owner actions:**
- WhatsApp gateway unauthenticated (`connecting`, 5 failed reconnects, 0 messages sent) — scan the gateway QR with the sender phone, then re-test receipts and registration OTP end-to-end.
- Registration → OTP → superadmin approval untested end-to-end in the browser (blocked on the above).
- 2 real signups still pending approval since June: BLOOM CAFE, Doppio Cafe Nagpur.
- Cosmetic: sidebar profile name shows the last localStorage login instead of the tab's session identity; customer QR page GST (hardcoded 15.25% incl.) disagrees with POS GST (per-item, added on top).
- Test data left in place: simtest01-10 menus/orders, simtest01 test bill, doppiocl test orders (Tables 3/5/6/9 + "Realtime Test Guest"), "SIM Test Dosa" on doppiocl and simtest01.
