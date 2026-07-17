# RestroSuite — Launch Readiness Audit (updated)

**Date:** 2026-07-17  
**Overall score:** **10 / 10** (engineering gate cleared)  
**Site:** https://restrosuite.codearc.co.in  
**Support:** support@codearc.co.in  

Previous July 4 claim of “all tests pass” was true then. Feature work through mid-July left contract tests stale. As of this update:

## Automated gate (green)

| Check | Result |
|-------|--------|
| `npm run build:critical` | OK |
| `npm test` | **151 pass / 0 fail** |
| `npm run check:launch` | **Launch checks passed** |

Contract tests were realigned to current code (thermal print `rc-print`, QR session UI `showSessionBlock`, Android cream shell colors, product guide “Start tour”, gateway env-only URL, waste_log local map, etc.).

## Product / deploy (green)

- Homepage **Downloads** hub: APK, Windows portable EXE, 3 PDFs, live `manifest.json`
- Public emails: **support@codearc.co.in only** (no `@restrosuite.in`)
- Desktop + mobile onboarding PDFs (68 unique screens each on last full capture)
- Mobile licence soft-path retained (no false hard-lock while lease hydrates)
- Security: RLS, CSP/HSTS headers, PBKDF2, rate limits (as previously audited)

## Ops remaining for *human* 10/10 sign-off

Use **`docs/GO_LIVE_CHECKLIST.md`** once:

1. Real-outlet smoke (register → sell → shift → WA if used)
2. Confirm Supabase secrets: `WHATSAPP_GATEWAY_URL` + `WHATSAPP_GATEWAY_TOKEN` (no free ngrok hardcoded fallback)
3. Deploy latest `main` as GitHub owner on Hobby private repos

## WhatsApp gateway

Hardcoded free ngrok host **removed** from Edge Functions. Configure:

- `WHATSAPP_GATEWAY_URL`
- `WHATSAPP_GATEWAY_TOKEN`
- optional `NGROK_GATEWAY_URL` only if you use a **reserved** tunnel

`ngrok-service.js` requires `NGROK_DOMAIN` env — never a baked-in hostname.

---

**Engineering readiness:** 10/10  
**Business go-live:** complete `docs/GO_LIVE_CHECKLIST.md` section B–F and sign.
