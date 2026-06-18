# Registration Email Setup

Registration and approval emails are sent by the Supabase Edge Function
`notify-registration`. The WhatsApp gateway remains responsible for WhatsApp
messages and does not send registration emails unless
`REGISTRATION_EMAILS_ENABLED=true` is explicitly configured.

## Required Supabase Secrets

Configure these secrets for the production Supabase project:

```text
EMAIL_RELAY_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
EMAIL_RELAY_TOKEN=
EMAIL_WEBHOOK_SECRET=generate-a-long-random-secret
ADMIN_ALERT_EMAIL=hello@codearc.co.in
ZERO_COST_EMAILS_DISABLED=false
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to deployed Edge
Functions by Supabase and are used to write delivery events to
`gateway_health_log`.

## Database Webhook

Create one Supabase Database Webhook:

- Table: `public.saas_tenants`
- Events: `INSERT` and `UPDATE`
- Method: `POST`
- URL:
  `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-registration`
- Header:
  `x-webhook-secret: <same value as EMAIL_WEBHOOK_SECRET>`

The webhook payload must include `type`, `table`, `record`, and `old_record`.
Supabase database webhooks use this shape by default.

## Relay Contract

The relay receives:

```json
{
  "to": "owner@example.com",
  "subject": "Registration Received",
  "html": "<html>...</html>"
}
```

It must return an HTTP 2xx response with one of:

```json
{ "status": "success" }
```

```json
{ "status": "ok" }
```

```json
{ "ok": true }
```

When the relay requires bearer authentication, set `EMAIL_RELAY_TOKEN`. For
example, the existing WhatsApp gateway can act only as an email relay:

```text
EMAIL_RELAY_URL=https://YOUR_GATEWAY_HOST/send-email
EMAIL_RELAY_TOKEN=<the gateway GATEWAY_TOKEN>
```

The Edge Function remains the only registration-email orchestrator. Keep
`REGISTRATION_EMAILS_ENABLED=false` on the gateway to prevent duplicates.

## Deployment Commands

After installing and authenticating the Supabase CLI:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set EMAIL_RELAY_URL="..." EMAIL_RELAY_TOKEN="..." EMAIL_WEBHOOK_SECRET="..." ADMIN_ALERT_EMAIL="hello@codearc.co.in" ZERO_COST_EMAILS_DISABLED="false"
supabase functions deploy notify-registration --no-verify-jwt
```

## Expected Notifications

- New registration:
  - Confirmation email to the outlet owner.
  - New-registration alert email to `ADMIN_ALERT_EMAIL`.
  - WhatsApp confirmation from the linked gateway.
- Admin changes status to `approved`:
  - Approval email to the outlet owner.
  - Approval WhatsApp from the linked gateway.

## Verification

1. Deploy `notify-registration`.
2. Confirm the database webhook is enabled.
3. Register a disposable test outlet.
4. Check `gateway_health_log` for:
   - `registration_email_sent`
   - `registration_admin_email_sent`
5. Approve the test outlet.
6. Check for `approval_email_sent`.
7. Delete the disposable tenant after verification.

HTTP `503` means delivery is disabled or the relay is missing. HTTP `207`
means at least one recipient failed. The function no longer reports successful
delivery when email is skipped.
