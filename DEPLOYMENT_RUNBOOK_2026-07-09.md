# RestroSuite — Go-Live Deployment Runbook

**Date:** 9 July 2026
**Purpose:** The exact, in-order commands to take the now-fixed codebase live. Everything here is operational — it needs your Supabase, Vercel and Play Store credentials, so it can't be automated from the code side.

**Live project reference:** `htkauiibuejetimfiavs` (from `desktop/config.json` → `supabaseUrl`)
**Production origin:** `https://restrosuite.codearc.co.in`

Run the steps top to bottom. Each step has a verification you should see before moving on.

---

## 0. One-time prerequisites

```bash
# Install the Supabase CLI if you don't have it
npm install -g supabase

# Log in (opens a browser)
supabase login

# Link this repo to the live project
cd <path-to>/restrosuite
supabase link --project-ref htkauiibuejetimfiavs
```

**Verify:** `supabase projects list` shows `htkauiibuejetimfiavs` with a ● in the "linked" column.

---

## 1. Apply database migrations (46 files, incl. the new CRM fix)

```bash
supabase db push
```

This applies every file in `supabase/migrations/`, including the launch-critical ones:

- `20260707120000_fix_table_session_trigger.sql` — QR-ordering table sessions
- `20260707160000_snake_case_column_rename.sql` — the naming reconciliation
- `20260709120000_license_lease_backstop.sql` — offline license backstop
- `20260709140000_plan_pricing.sql` — plan/billing pricing
- `20260709160000_crm_customer_fields.sql` — **new**: adds `email` / `dues` / `marketing_opt_in` to `doppio_crm`

**Verify:** command ends with `Finished supabase db push`. Then in the Supabase SQL editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'doppio_crm'
  AND column_name IN ('email','dues','marketing_opt_in');
-- should return 3 rows
```

---

## 2. Set the Edge Function secrets

Without `SUPERADMIN_SESSION_SECRET` **every login returns HTTP 500**, so do this before deploying functions.

```bash
# 64-byte random secret for signing superadmin sessions
supabase secrets set SUPERADMIN_SESSION_SECRET="$(openssl rand -hex 64)"

# SHA-256 hash of your chosen PIN-reset code (never store the raw code)
#   replace 123456 with the real reset code
supabase secrets set PIN_RESET_CODE_HASH="$(printf '123456' | openssl dgst -sha256 -hex | awk '{print $2}')"

# License signing key (base64 PKCS8). Generate a keypair if you don't have one:
#   node scripts/generate-license-keys.js
supabase secrets set LICENSE_SIGNING_KEY="<base64-pkcs8-private-key>"
supabase secrets set LICENSE_OFFLINE_WINDOW_DAYS="3"

# CORS allowlist (comma-separated, no trailing slash)
supabase secrets set ALLOWED_ORIGINS="https://restrosuite.codearc.co.in"
```

**Verify:** `supabase secrets list` shows all five names with a non-empty digest.

> The superadmin **password** hash is generated separately with
> `node scripts/hash-superadmin-password.cjs` and stored per that script's
> instructions — do this if you're rotating the superadmin password.

---

## 3. Deploy the Edge Functions

QR ordering and the app's own login token need these. The app authenticates with its own token (not a Supabase JWT), so the auth functions must be deployed with `--no-verify-jwt`.

```bash
# QR ordering: public table lookup + tenant data sync
supabase functions deploy tenant-public --no-verify-jwt
supabase functions deploy tenant-data   --no-verify-jwt

# Auth / access
supabase functions deploy tenant-access --no-verify-jwt
supabase functions deploy tenant-users  --no-verify-jwt
supabase functions deploy tenant-admin  --no-verify-jwt

# Licensing + billing (same set as deploy-billing.bat)
supabase functions deploy license-lease     --no-verify-jwt
supabase functions deploy razorpay-route     --no-verify-jwt
supabase functions deploy razorpay-webhook   --no-verify-jwt

# Observability + notifications (optional but recommended)
supabase functions deploy app-observability  --no-verify-jwt
supabase functions deploy notify-registration --no-verify-jwt
```

(Windows shortcut for the billing/licensing subset: double-click `deploy-billing.bat` after `supabase login`.)

**Verify:** each deploy prints `Deployed Function <name>`. In the dashboard, Edge Functions → all show a recent "Last deployed" time.

---

## 4. Set the Vercel environment variables

In the Vercel project → Settings → Environment Variables (Production), or via CLI:

```bash
vercel env add SUPABASE_URL production
#   value: https://htkauiibuejetimfiavs.supabase.co
vercel env add SUPABASE_ANON_KEY production
#   value: the anon key from desktop/config.json (or Supabase → Project Settings → API)
```

Then redeploy so the vars take effect:

```bash
vercel --prod
```

**Verify:** open `https://restrosuite.codearc.co.in/api/config` in a browser — it should return JSON containing `supabaseUrl` and `supabaseAnonKey`, **not** an error.

---

## 5. Ship the Android update

The version freeze is fixed in `android-app/app/build.gradle` (`versionCode 2`, `versionName "1.0.1"`).

```bash
npm run build:android        # runs sync-assets + gradle release build
# or manually:
cd android-app && ./gradlew bundleRelease
```

Upload the resulting `.aab` to the Play Console → Production track.

**Verify:** Play Console shows the new release as `2 (1.0.1)`, higher than the current live `1 (1.0.0)`.

---

## 6. End-to-end smoke test (do this on the live URL)

1. **Login** — sign in at `https://restrosuite.codearc.co.in/login`. A staff PIN login should succeed (confirms `SUPERADMIN_SESSION_SECRET` is set — no HTTP 500).
2. **QR order** — scan a real table QR (or open `/qr-order?...` for a seeded table), add an item, place the order.
3. **Table session** — in the dashboard → Floor, confirm the table flipped to an active session automatically (confirms the trigger + `tenant-public` are live).
4. **Customer save** — add a customer with an email in CRM, reload on a second device, confirm it synced (confirms the CRM migration + fallback).
5. **Billing** — take the order to bill, pay, and confirm the receipt PDF and (if enabled) WhatsApp send.

**All five green = launch-ready.**

---

## Rollback notes

- **Migrations** are additive/idempotent (`ADD COLUMN IF NOT EXISTS`), so re-running `supabase db push` is safe. The new CRM migration adds nullable/defaulted columns only — no data loss risk.
- **Functions** — redeploy the previous git revision of a function if one misbehaves; deploys are versioned in the dashboard.
- **Android** — you can halt a Play Store rollout from the Console; existing `1.0.0` installs keep working.
