# RestroSuite Production Launch Runbook

Use this runbook before every production launch or major release. It assumes the zero-cost launch model: Vercel for hosting, Supabase for database and Edge Functions, and optional paid services only after revenue.

## Launch Order

1. Prepare Supabase.
2. Deploy Edge Functions.
3. Deploy the static app to Vercel.
4. Run production smoke tests.
5. Run Android WebView smoke tests.
6. Enable monitoring and daily review.
7. Start client onboarding.

## Supabase Setup

- Create or open the production Supabase project.
- Confirm the production project already contains the core POS tables listed in
  `scripts/check-launch.cjs`. The current repository does not contain their
  complete `CREATE TABLE` schema, so export that schema before a clean rebuild.
- Apply `supabase_migration.sql` to create/harden the tenant registry and attach
  existing core tables to tenants.
- Apply every migration in `supabase/migrations` in timestamp order.
- Apply `supabase_gateway_migration.sql` only when the optional WhatsApp gateway
  and session backup are being enabled.
- Confirm all tenant-owned tables have RLS enabled and forced.
- Confirm `anon` and `authenticated` do not have direct table access to tenant data tables.
- Add required Edge Function secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPERADMIN_SESSION_SECRET`
  - `EMAIL_RELAY_URL`
  - `EMAIL_RELAY_TOKEN` when the relay requires bearer authentication
  - `EMAIL_WEBHOOK_SECRET`
  - `ADMIN_ALERT_EMAIL`
  - `ZERO_COST_EMAILS_DISABLED=false`
  - `ALLOWED_ORIGIN=https://codearc-restrosuite.vercel.app`
- Deploy these Edge Functions:
  - `tenant-access`
  - `tenant-admin`
  - `tenant-data`
  - `tenant-public`
  - `tenant-users`
  - `notify-registration`
  - `app-observability`
- Create the `saas_tenants` INSERT/UPDATE database webhook described in
  `EMAIL_NOTIFICATION_SETUP.md`.

## Vercel Setup

- Import the repository into Vercel.
- Keep the deployment static and zero-cost.
- Confirm `vercel.json` security headers are active.
- Confirm the Vercel domain opens:
  - `/index.html`
  - `/login.html`
  - `/terms.html`
  - `/privacy.html`
  - `/refund-policy.html`
- Do not configure paid gateway or paid email providers until revenue justifies it.

## Production Smoke Test

- Register a test restaurant.
- Approve it from the superadmin console.
- Log in as the tenant admin.
- Create one staff user.
- Verify the staff user only sees assigned modules.
- Add one menu item and one inventory item.
- Create one POS bill.
- Create one QR order.
- Open Kitchen KDS and confirm order visibility.
- Open Growth Hub and create:
  - support ticket
  - reservation
  - purchase order
  - costing row
  - offer
  - refund request
  - outlet
- Export a backup file.
- Confirm app incidents appear in the superadmin incident panel after a test client-side error.

## Android Smoke Test

- Run `npm run sync:android` before building.
- Build the Android app.
- Open the Android app on a real device or emulator.
- Verify login, POS, QR orders, Growth Hub, bottom navigation, safe-area padding, and policy links.
- Confirm offline/online transitions do not freeze the UI.

## Go/No-Go Gate

Launch only when:

- `npm run check:launch` passes.
- `npm test` passes.
- `npm run check` passes.
- `npm run check:free-tier` passes.
- Production tenant login works.
- Production QR order works.
- RLS blocks cross-tenant access.
- Support, refund, backup, and policy workflows are ready.

## Rollback

- Revert the latest Vercel deployment if the frontend breaks.
- Disable registration approval for new clients if tenant onboarding breaks.
- Keep existing tenant data untouched unless a database migration caused the issue.
- Restore from manual JSON backup only after previewing the data impact.

