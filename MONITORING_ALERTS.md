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

## Suggested Free Monitors

Use any free uptime monitor for:

- `https://YOUR_DOMAIN/index.html`
- `https://YOUR_DOMAIN/login.html`
- `https://YOUR_SUPABASE_PROJECT.functions.supabase.co/tenant-public`
- Optional gateway health endpoint if WhatsApp automation is enabled.

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

