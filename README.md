# CodeArc RestroSuite

> Zero-cost restaurant SaaS — POS billing, KDS, inventory, CRM, WhatsApp receipts, and multi-tenant management on Vercel + Supabase.

**Live site:** https://codearc-restrosuite.vercel.app  
**Stack:** Vanilla JS · HTML/CSS · Supabase (Postgres + RLS + Edge Functions) · Vercel · Node.js WhatsApp Gateway · Android WebView wrapper

---

## Table of contents

- [Architecture overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Supabase setup](#supabase-setup)
- [Vercel deployment](#vercel-deployment)
- [WhatsApp gateway](#whatsapp-gateway)
- [Razorpay subscription billing](#razorpay-subscription-billing)
- [Android build](#android-build)
- [CI / CD](#ci--cd)
- [Scripts reference](#scripts-reference)
- [Project structure](#project-structure)
- [Superadmin setup](#superadmin-setup)
- [Troubleshooting](#troubleshooting)

---

## Architecture overview

```
Browser / Android WebView
        │
        ▼
  Vercel (static HTML/JS/CSS)
        │
        ├─► Supabase Edge Functions  (tenant-access, tenant-data, tenant-admin, razorpay-webhook)
        │         │
        │         ▼
        │   Supabase Postgres (RLS-locked tables, saas_tenants)
        │
        └─► WhatsApp Gateway (Node.js, persistent VPS/Railway process)
                  │
                  ▼
           whatsapp-web.js ─► WhatsApp Web session
```

All browser clients talk to Supabase **only** through Edge Functions — no direct table access from the client side. Row-Level Security is enforced and all permissive public policies are dropped.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | `>=20 <26` |
| npm | `>=10` |
| Supabase CLI | latest (`npm i -g supabase`) |
| Vercel CLI | latest (`npm i -g vercel`) |
| Android Studio *(optional)* | Flamingo or newer |

---

## Environment variables

Create a `.env` file at the repository root (never commit this):

```env
# ── Supabase ──────────────────────────────────────────────
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>   # Edge Functions only

# ── Razorpay ──────────────────────────────────────────────
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-signing-secret>

# ── WhatsApp Gateway ──────────────────────────────────────
GATEWAY_PORT=3001
GATEWAY_AUTH_TOKEN=<strong-random-token>          # Generated once, shared with dashboard

# ── Superadmin ────────────────────────────────────────────
SUPERADMIN_PASSWORD_HASH=<pbkdf2-hash>            # Run: npm run hash:superadmin
```

For **Vercel**, add these as environment variables in the project dashboard under **Settings → Environment Variables**. The frontend reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` at build time via `vercel.json` or injected into the HTML.

For the **WhatsApp gateway server**, copy `.env` to your VPS / Railway service.

---

## Local development

```bash
# 1. Clone and install
git clone https://github.com/csheoganj-del/codearc-restrosuite.git
cd codearc-restrosuite
npm install

# 2. Add environment variables
cp .env.example .env
# Fill in your Supabase and Razorpay credentials

# 3. Run the static site (any local server)
npx serve .            # or: python3 -m http.server 8080

# 4. (Optional) Start the WhatsApp gateway locally
npm run start:gateway

# 5. Run tests and checks
npm test
npm run check
```

---

## Supabase setup

### 1. Create a Supabase project

Go to https://supabase.com, create a new project, and note the **Project URL** and **anon key**.

### 2. Run the migrations

Open the **SQL Editor** in your Supabase dashboard and run both files in order:

```
supabase_migration.sql           ← core multi-tenant schema + RLS
supabase_gateway_migration.sql   ← WhatsApp gateway session tables
```

Or use the Supabase CLI:

```bash
supabase db push
```

### 3. Deploy Edge Functions

```bash
supabase functions deploy tenant-access
supabase functions deploy tenant-data
supabase functions deploy tenant-admin
supabase functions deploy razorpay-webhook
```

Set secrets for the Edge Functions:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<value>
supabase secrets set RAZORPAY_KEY_SECRET=<value>
supabase secrets set RAZORPAY_WEBHOOK_SECRET=<value>
```

### 4. Enable Realtime

The migration already adds `saas_tenants` to the `supabase_realtime` publication. Confirm in **Database → Replication**.

---

## Vercel deployment

```bash
# First-time setup
vercel link

# Deploy to production
npm run deploy:production
# (runs: npm test → sync:android → npm run check → vercel --prod)
```

The `vercel.json` at the repo root handles clean URLs and rewrites for `/login` and `/dashboard`.

Set these environment variables in the Vercel dashboard:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

> The service role key must **never** go into Vercel — it belongs only in Edge Functions and the WhatsApp gateway.

---

## WhatsApp gateway

The WhatsApp gateway uses `whatsapp-web.js`, which maintains a persistent browser session. **It cannot run on Vercel** (serverless, no persistent state). You must deploy it separately.

See [`docs/whatsapp-gateway-deploy.md`](docs/whatsapp-gateway-deploy.md) for step-by-step instructions for Railway, Render, or a VPS.

**Quick local test:**

```bash
npm run start:gateway
# Scan the QR code printed to terminal with your WhatsApp mobile app
```

---

## Razorpay subscription billing

The repo includes a Supabase Edge Function at `supabase/functions/razorpay-webhook/` that:

- Verifies the Razorpay webhook signature
- On `subscription.activated` — sets tenant `status = 'active'` and stores `plan_id` and `subscription_id`
- On `subscription.charged` — records payment and updates `subscription_renewed_at`
- On `subscription.cancelled` / `payment.failed` — sets tenant `status = 'suspended'`

**Setup:**

1. In the Razorpay dashboard, create a plan for each tier with these exact `plan_id`s (the webhook maps them to entitlements):
   - `plan_starter_monthly` → starter — **₹749 / month**
   - `plan_growth_monthly` → growth — **₹1,499 / month**
   - `plan_enterprise_monthly` → enterprise — **₹2,999 / month**

   The pricing above is the single source of truth and must match the
   `index.html` pricing cards and `razorpay-webhook/index.ts` `PLAN_SLUG_MAP`.
2. Set the webhook URL to: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`
3. Enable events: `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.completed`, `payment.failed`
4. Copy the webhook signing secret to Supabase secrets: `supabase secrets set RAZORPAY_WEBHOOK_SECRET=<value>`
5. Run the idempotency migration so retried deliveries are de-duplicated:
   `supabase/migrations/20260625000000_webhook_idempotency.sql`

Frontend integration notes are in [`docs/razorpay-frontend.md`](docs/razorpay-frontend.md) *(to be added alongside checkout flow)*.

---

## Android build

The Android app is a WebView wrapper that mirrors the web assets.

```bash
# Copy web assets into the Android project
npm run sync:android

# Build the debug APK (requires Android SDK on PATH)
npm run build:android
```

Set `SKIP_ANDROID_BUILD=1` to skip the Android step in the release pipeline:

```bash
SKIP_ANDROID_BUILD=1 npm run deploy:production
```

---

## CI / CD

GitHub Actions runs on every push and pull request to `main`. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

The pipeline:
1. Installs Node.js dependencies
2. Runs `npm run check` (JS syntax + asset parity)
3. Runs `npm test` (billing, ordering, inventory, auth, tenant contracts)
4. Fails the PR if any check or test fails — nothing merges to `main` with a broken test suite

---

## Scripts reference

| Script | What it does |
|--------|-------------|
| `npm test` | Runs all `.test.cjs` files — billing, POS, inventory, auth, tenant |
| `npm run check` | JS syntax check + web/Android asset parity |
| `npm run check:free-tier` | Verifies nothing exceeds Supabase/Vercel free-tier limits |
| `npm run check:launch` | Combined pre-launch readiness check |
| `npm run hash:superadmin` | Generates a PBKDF2 hash for the superadmin password |
| `npm run start:gateway` | Starts the WhatsApp gateway (requires persistent environment) |
| `npm run sync:android` | Copies canonical web assets into the Android wrapper |
| `npm run build:android` | Builds the Android debug APK |
| `npm run deploy:production` | Full release: test → sync → check → build Android → Vercel deploy |

---

## Project structure

```
codearc-restrosuite/
├── index.html                  Landing page
├── login.html                  Tenant login & registration
├── dashboard.html              Main tenant dashboard shell
├── dashboard.js                Event orchestration (Phase 2: partially split)
├── dashboard-styles.css
├── home.html
├── script.js
├── styles.css
├── whatsapp-gateway.js         WhatsApp gateway server (Node.js)
├── recipes.json                Seed recipe data
├── vercel.json                 Vercel routing config
├── package.json
│
├── src/dashboard/              Phase 2 domain modules
│   ├── api.js                  Tenant auth/admin/data API
│   ├── auth.js                 Session state
│   ├── billing.js              Billing totals and deductions
│   ├── bills.js                Bill dates and CSV export
│   ├── inventory.js            Inventory FEFO logic
│   ├── onboarding.js           Onboarding component
│   ├── pos.js                  POS payment calculations
│   ├── operations.js           KDS/QR date operations
│   ├── people.js               CRM loyalty and payroll
│   ├── superadmin.js           Superadmin status/selection
│   └── whatsapp.js             WhatsApp routing helpers
│
├── supabase/
│   ├── functions/
│   │   ├── tenant-access/      Login, registration, session
│   │   ├── tenant-data/        CRUD for operational tables
│   │   ├── tenant-admin/       Superadmin management
│   │   └── razorpay-webhook/   Subscription lifecycle handler
│   └── config.toml
│
├── supabase_migration.sql      Core schema + RLS setup
├── supabase_gateway_migration.sql
│
├── android-app/                Android WebView wrapper
├── images/
├── scripts/                    Dev/build/release utilities
├── tests/                      Node.js test files
├── docs/                       Supplementary documentation
│   └── whatsapp-gateway-deploy.md
│
└── .github/
    └── workflows/
        └── ci.yml              GitHub Actions CI pipeline
```

---

## Superadmin setup

The superadmin account controls tenant approval and platform-wide settings. To set a real password:

```bash
# Generate a PBKDF2 hash interactively
npm run hash:superadmin

# Then apply it in Supabase SQL Editor:
UPDATE public.saas_tenants
SET password_hash = '<output-from-above>'
WHERE username = 'admin';
```

> The default seed value is a deliberately invalid locked string — no login is possible until you run the above.

---

## Troubleshooting

**Dashboard shows "unauthorised" after login**
- Confirm your Supabase Edge Functions are deployed and the `SUPABASE_SERVICE_ROLE_KEY` secret is set.
- Check the browser console for CORS errors — the Edge Function URL must match `SUPABASE_URL`.

**WhatsApp QR code never appears**
- The gateway requires a persistent Node process. Make sure you're not running it in a serverless environment.
- See `docs/whatsapp-gateway-deploy.md`.

**Android build fails**
- Ensure `ANDROID_HOME` is set and `sdkmanager` / `gradlew` are available.
- Run `npm run sync:android` before `npm run build:android`.

**Razorpay webhook returns 401**
- Verify `RAZORPAY_WEBHOOK_SECRET` in Supabase secrets matches the secret in the Razorpay dashboard exactly.

**Tests fail with "Cannot find module"**
- Run `npm install` first. Tests use the Node built-in test runner (Node ≥20 required).

---

## Licence

Private — © 2026 CodeArc Tech Labs Private Limited. All rights reserved.
