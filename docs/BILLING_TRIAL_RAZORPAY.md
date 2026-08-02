# RestroSuite billing — Express / Serve / Command

## Plans

| Plan | Monthly | Yearly | Job |
|------|---------|--------|-----|
| **Express** | ₹499 | ₹4,999 | Counter / takeaway billing (front) |
| **Serve** | ₹999 | ₹9,999 | Tables + QR + KDS (default trial) |
| **Command** | ₹2,499 | ₹24,999 | Stock, staff, multi-outlet, deep reports |

## 30-day free trial

- New registration → `plan_code=serve`, `subscription_status=trialing`, period = **now + 30 days**
- Status `approved` immediately (can sign in)
- One trial per WhatsApp phone number
- **No grace** after period end — POS / lease lock

## Last 3 days reminders

| Channel | How |
|---------|-----|
| **WhatsApp** | `billing-reminders` edge → gateway `/send` |
| **Email** | same function → `EMAIL_RELAY_URL` |
| **On screen** | `assets/modules/billing-nudge.js` once per day on first open |

Cron: `POST /functions/v1/billing-reminders` hourly with  
`Authorization: Bearer <BILLING_CRON_SECRET or EMAIL_WEBHOOK_SECRET>`.

## Pay → period extends from **expiry**, not payment day

```
base = max(subscription_current_period_end, now)
new_end = base + 1 month (or +1 year)
```

Razorpay subscription `create_subscription` sets `start_at` to current period end when still in future so first charge aligns with expiry.

## Razorpay setup

1. Create plans in Razorpay dashboard:
   - Express monthly / yearly  
   - Serve monthly / yearly  
   - Command monthly / yearly  
2. Store IDs on `saas_plans`:
   - `razorpay_plan_id`
   - `razorpay_plan_id_yearly`
3. Webhook URL: `…/functions/v1/razorpay-webhook`  
   Events: `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.completed`, `payment.failed`, …

## Deploy

```bash
# SQL
supabase db push
# or run migrations/20260801120000_express_serve_command_billing.sql

supabase functions deploy tenant-access
supabase functions deploy razorpay-route
supabase functions deploy razorpay-webhook
supabase functions deploy license-lease
supabase functions deploy billing-reminders
supabase functions deploy tenant-public
supabase functions deploy tenant-admin
```

## Invoice PDF (register + pay)

On **register** and **successful plan payment**, the platform builds a professional A4 PDF and delivers it via:

| Channel | How |
|---------|-----|
| **Email** | `EMAIL_RELAY_URL` with PDF attachment (base64) |
| **WhatsApp** | Gateway `/send` with `pdfData` |

| Event | Document | Amount |
|-------|----------|--------|
| Register (trial) | Trial confirmation `TRS-RS-…` | ₹0 |
| Pay / renew | Tax invoice `INV-RS-…` | GST-inclusive 18% reverse calc |

Shared module: `supabase/functions/_shared/billing-invoice.ts`  
Stored rows: `saas_invoices`

Optional seller env overrides:

- `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_GSTIN`
- `INVOICE_SELLER_STATE`, `INVOICE_SELLER_STATE_CODE`
- `INVOICE_SELLER_EMAIL`, `INVOICE_SELLER_PHONE`, `INVOICE_SELLER_WEB`

## Secrets

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
- `EMAIL_RELAY_URL` / `EMAIL_RELAY_TOKEN`
- `WHATSAPP_GATEWAY_URL` / `WHATSAPP_GATEWAY_TOKEN`
- `BILLING_CRON_SECRET` (or reuse `EMAIL_WEBHOOK_SECRET`)
- Invoice seller fields (optional, see above)
