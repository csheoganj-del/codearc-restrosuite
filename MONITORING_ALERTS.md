# RestroSuite Monitoring and Alerts

Start with free monitoring and upgrade only when revenue or scale requires it.

## Daily Manual Checks

- Vercel deployment is live.
- Supabase project is not paused.
- New registrations appear in superadmin.
- Application incidents are reviewed.
- QR order endpoint responds.
- Tenant login endpoint responds.
- Free-tier usage is below limits.
- Nightly backup GitHub Action succeeded (or was manually run) within the last 48 hours.
- Nightly restore **preview** drill step passed (non-destructive).

## Suggested Free Monitors

Use any free uptime monitor for:

- `https://YOUR_DOMAIN/` (or `/index.html`)
- `https://YOUR_DOMAIN/login`
- `https://YOUR_DOMAIN/api/config` (must return HTTP 200 with `supabaseUrl`)
- `https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/tenant-public` (POST preflight / OPTIONS)
- WhatsApp gateway (when enabled): `https://YOUR_GATEWAY_HOST/health`
  - Expect JSON `{ "ok": true, "ready": true|false, "status": "...", "alerts": {...} }`
  - Alert if the endpoint is unreachable for 5 minutes
  - Optionally alert when `ready` is `false` for >15 minutes during business hours
  - Confirm at least one of `alerts.email` / `alerts.telegram` / `alerts.desktop` is `true`

## Alert Conditions

- Public website unavailable for 5 minutes.
- Login function returns non-2xx unexpectedly.
- QR order function returns non-2xx unexpectedly.
- Supabase quota approaches free-tier limits.
- Vercel deployment fails.
- Application incidents exceed 10 open items.
- More than 3 login failures from the same tenant in 10 minutes.
- Starter tenant approaches monthly online order cap.

## Incident Review

Every incident should record:

- time detected
- affected tenant
- affected feature
- severity
- root cause
- fix
- prevention

## Upgrade Triggers

Move to paid monitoring or paid infrastructure when:

- a paying client depends on uptime guarantees
- Supabase free limits are regularly near capacity
- Vercel free commercial terms no longer fit your use
- support volume requires automated alert routing
- daily manual checks become unreliable

