# Phase 2 Architecture And Reliability

## Target Structure

The dashboard is being split incrementally so production behavior remains stable.

| Domain | Module | Status |
| --- | --- | --- |
| Tenant auth/admin/data API | `src/dashboard/api.js` | Extracted and integrated |
| Authoritative session state | `src/dashboard/auth.js` | Extracted and integrated |
| Billing totals and deductions | `src/dashboard/billing.js` | Extracted and integrated |
| Bill dates and CSV export | `src/dashboard/bills.js` | Extracted and integrated |
| Inventory FEFO | `src/dashboard/inventory.js` | Extracted and integrated |
| Onboarding component | `src/dashboard/onboarding.js` | Extracted from HTML |
| POS payment calculations | `src/dashboard/pos.js` | Extracted and integrated |
| KDS/QR date operations | `src/dashboard/operations.js` | Extracted and integrated |
| CRM loyalty and payroll | `src/dashboard/people.js` | Extracted and integrated |
| Superadmin status/selection | `src/dashboard/superadmin.js` | Extracted and integrated |
| WhatsApp routing helpers | `src/dashboard/whatsapp.js` | Extracted and integrated |

Event-heavy rendering remains in `dashboard.js` for compatibility, but its
security, calculations, formatting, and cross-domain rules now live behind
testable modules.

## Reliability Commands

- `npm test`: core billing, ordering, inventory, auth, tenant approval, and reset contracts.
- `npm run check`: JavaScript syntax and web/Android asset parity.
- `npm run sync:android`: copy canonical web assets into the Android wrapper.
- `npm run build:android`: build the debug APK with the supported local toolchain.
- `npm run deploy:production`: test, sync, check, build Android, then deploy Vercel.

Set `SKIP_ANDROID_BUILD=1` or `SKIP_VERCEL_DEPLOY=1` only for a deliberately
partial local run.

## Rules For Further Extraction

1. Keep canonical source files at the repository root and under `src/`.
2. Treat Android assets as generated mirrors; update them with `sync:android`.
3. Move pure calculations before moving DOM event handlers.
4. Preserve the existing Supabase-like tenant data adapter until each domain has
   a typed repository API.
5. Add regression tests before changing billing, inventory, authorization, or
   destructive tenant behavior.
