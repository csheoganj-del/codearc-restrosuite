# RestroSuite Production QA Checklist

Run this checklist after every production deployment.

## Public Website

- Home page loads on desktop and mobile.
- Pricing section is visible.
- Client Portal Login link opens `login.html`.
- Terms, Privacy, and Refund Policy links open and are mobile readable.
- No console error blocks page interaction.

## Tenant Registration and Login

- New tenant registration submits successfully.
- Pending tenant appears in superadmin registry.
- Superadmin approval activates the tenant.
- Tenant admin can log in.
- Invalid tenant credentials are rejected.
- Disabled or rejected tenants cannot log in.

## Staff Permissions

- Admin can create staff users.
- Cashier cannot see restricted admin modules.
- Kitchen user can access KDS without POS admin controls.
- Revoked staff account cannot validate an existing session.
- Plan limits prevent excess staff creation.

## POS and Billing

- Menu item can be added.
- Inventory item can be added.
- POS bill calculates subtotal, GST, discount, and total correctly.
- Split payment rejects mismatched totals.
- Bill history can search and export.
- Refund request can be logged in Growth Hub.

## QR Ordering

- Public QR menu loads from `tenant-public`.
- Invalid item prices are rejected server-side.
- Order appears in pending orders.
- KDS receives or displays the order.
- Monthly starter order cap is respected.

## Growth Hub

- Onboarding checklist toggles instantly.
- Support ticket saves locally and cloud insert is attempted.
- Reservation creates a row.
- Purchase order creates a row.
- Costing row shows margin.
- Offer creates a coupon record.
- Refund request creates a manager approval record.
- Device test updates printer status.
- Outlet record is created.
- Compliance panel shows legal, migration, backup, and QA readiness.

## Superadmin

- Platform Snapshot shows total, active, pending, paid-tier, and risk counts.
- Tenant registry loads.
- Plan and subscription fields can be updated.
- Tenant reset clears tenant-owned operational tables.
- Incident list loads, filters, and resolves reports.

## Mobile and Android

- Dashboard bottom navigation is usable with one hand.
- More drawer exposes secondary modules.
- Growth Hub forms do not overflow on mobile.
- Buttons are at least touch-friendly height.
- Android WebView uses the same synced web assets.
- Offline status does not lock the app.

## Security

- Tenant tables are only accessed through Edge Functions.
- RLS is enabled and forced.
- Cross-tenant reads fail.
- Password hashes are not returned to dashboards.
- API traffic is not cached by service worker.
- Security headers are present in Vercel response.

## Zero-Cost Guardrails

- No Hugging Face gateway URL is active in Vercel CSP.
- Email sending remains optional/disabled for free launch.
- Tenant reads are capped.
- Public menu reads are capped.
- Retention cleanup exists for logs and temporary operational records.

