# RestoSuite Recommendation Buildout

This repository now implements the product recommendations as a coherent zero-cost-first SaaS foundation.

## Product and Restaurant Operations

- Guided production onboarding checklist.
- In-product support tickets with priority and status.
- Reservations and waitlist records.
- Vendor and purchase-order tracking.
- Menu item costing and gross-margin visibility.
- Offers and coupon records.
- Refund and void approval requests.
- Receipt-printer and device setup tracking.
- Multi-outlet readiness and outlet records.
- Backup snapshots, restore safety guidance, and migration status.

## SaaS Operations

- Plan entitlements enforced by backend access functions.
- Starter, Growth, and Enterprise access to Growth Hub.
- Billing and upgrade readiness with SaaS invoice records.
- Tenant-scoped data tables and reset coverage.
- Role-aware access through the tenant data gateway.
- Application incident monitoring for superadministrators.
- Free-tier limits, retention cleanup, and optional paid integrations.

## Security and Compliance

- Forced row-level security on every Growth Hub table.
- Direct anonymous and authenticated table access revoked.
- Tenant ownership attached server-side.
- Unique tenant keys protected with conflict-aware upserts.
- Terms of Service, Privacy Policy, and Refund Policy linked publicly.
- Input rendering remains escaped and new forms require their business keys.

## Experience and Performance

- Responsive Growth Hub on desktop, mobile web, PWA, and Android WebView.
- Shared visual design tokens and touch-friendly controls.
- Local-first interaction for immediate feedback with cloud persistence.
- Existing read caching, queued writes, idle work, and online visibility guards retained.

## Verification

- Security-contract tests cover the new workflows, tables, RLS, entitlement wiring, legal pages, and responsive policy layout.
- Project checks keep Android web assets identical to the web application.
- Free-tier checks prevent accidental paid infrastructure dependencies.
