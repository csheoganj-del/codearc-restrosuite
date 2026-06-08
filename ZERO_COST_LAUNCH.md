# Zero-Cost Launch Mode

RestoSuite is configured to launch with no required paid infrastructure:

- Vercel serves the static web application.
- Supabase provides Postgres, Realtime, authentication APIs, and Edge Functions.
- The Android application uses the same static web assets.
- WhatsApp receipts use normal WhatsApp app/web sharing.
- Automated WhatsApp gateway hosting is optional and disabled by default.
- Email relay is optional. Registration still succeeds if email delivery is not configured.

## Cost Guardrails

- Starter workspaces: 5 active staff and 300 online orders per month.
- In-person POS billing is not restricted by the online-order cap.
- Tenant API reads default to 250 rows and cannot exceed 500 rows per request.
- Public menu responses are capped at 300 items.
- Error reports are retained for 30 days.
- Audit logs are retained for 90 days.
- Rate-limit records are retained for 2 days.
- The Vercel deployment does not run the WhatsApp Node gateway.

Run `npm run check:free-tier` before deployment.

## Upgrade Triggers

Move to paid Supabase or Vercel when revenue exists and any of these happen:

- Database size reaches 70% of the current free allowance.
- Monthly bandwidth or function usage reaches 70% of its allowance.
- Supabase project pausing is no longer acceptable.
- More than two active Supabase projects are required.
- Commercial use requires a different Vercel plan under the current terms.
- Automated WhatsApp delivery needs an always-on gateway.
- Backups, longer log retention, higher order volume, or uptime guarantees become contractual requirements.

Free-tier allowances and plan terms can change. Review the official provider dashboards and pricing pages monthly.
