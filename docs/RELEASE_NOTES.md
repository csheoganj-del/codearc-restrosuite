# RestroSuite release notes

## v66 (2026-07-11) — Floor service alerts & thermal settle

- **New QR order alert**: chime + vibrate + clickable toast when a pending QR order lands (respects service-alert mute)
- **Bill settled**: one-tap **Thermal** (ESC/POS / print bridge) next to Print + WhatsApp
- **QR board**: pending cards pulse, guest name, pending-first sort, open-in-POS shortcut, urgent badge
- **KDS**: ticket count badge, oldest-first queue, aging/urgent card styles

## v65 (2026-07-11) — Floor map, KOT one-tap, demo seed

- **Table map**: held tables show amber **Held** badge (drafts + in-memory holds)
- **KOT**: **Print & send** one-tap (thermal + kitchen queue)
- **Super-admin**: seedling icon on tenant row — one-click demo seed (confirm dialog)

## v64 (2026-07-11) — Settle dues from POS

- Cart dues banner: **Settle** (opens CRM settle modal) + **Pay as Due**
- Holds total badge on POS tools; owner strip shows hold count + offline/sync
- Owner strip Ops tile: Offline / pending sync / WA status

## v62–v63 (2026-07-11) — Ops & cashier UX

### POS ops
- **Day pack** CSV for today’s bills (+ open-shift Z summary)
- Owner strip: today sales, orders, AOV, **shift total**, ops/WA
- Quick tools: **Day pack · Keys · Demo**
- Soft **open-shift** toast and checkout tip when no shift is open
- Multi-station **Z-report** scope (this station / all), station mix, CSV print

### Cashier CRM
- **Outstanding dues banner** under guest phone when CRM match has `dues > 0`
- Customer insights panel shows **Dues** line

### Held orders
- Richer hold list: phone, draft id, total holds count
- Confirm before replacing a non-empty cart when resuming a hold
- Clearer hold toast (channel + resume hint)

### WhatsApp / exports (from product pack)
- PDF send **retries** + warm PDF on bill paid
- Bills export: station, shift, cashier, tenders
- GSTR CSV: taxable value, slabs, totals row

### Demo
- `docs/DEMO_SCRIPT.md` — 15-minute talk track  
- In-app checklist: **Demo** button or right-click **Help & Setup**

### Platform
- Dashboard code-split modules (Waves 5–12); boot shell ~2.8k lines
- `npm run check:prod-assets` + Playwright deploy-health
- `tenant-data` **search_bills** for history beyond local cache

---

## Desktop / Android notes

| Channel | Notes |
|---------|--------|
| **Web (Vercel)** | Hard-refresh or `?appv=v66-…` after deploy; SW cache bumps force update |
| **Desktop (Electron)** | Rebuild with latest `assets/`; print bridge uses `print-bridge.js` + ESC/POS |
| **Android WebView** | Run `npm run sync:android` / build script after asset bump so modules ship in the shell |

---

## Verify after deploy

```powershell
npm run check:prod-assets
$env:E2E_OUTLET_SLUG='bbb'; $env:E2E_USERNAME='bbb'; $env:E2E_PASSWORD='Harry@1234'
npx playwright test tests/e2e/
```

Checklist: open shift → sell → dues banner (if CRM customer with dues) → hold/resume → Day pack → Z close.
