# RestroSuite release notes

## v79 (2026-07-11) — Kitchen notes on cart lines

- **Comment** button on each cart line: free-text note + quick chips (No onion, Extra spicy, …)
- Notes print on **KOT** (preview + thermal HTML + ESC/POS) and flow to **KDS** via `notes`
- Bill PDF, HTML/text receipt, and rebill preserve line notes
- Stored on bill `_items` as `note` / `notes`

## v78 (2026-07-11) — Cash drawer pay-in / pay-out / safe drop

- **Cash** on open shift bar: record pay-in, pay-out, or safe drop with amount + reason
- **Expected cash** on Z = float + cash sales + pay-ins − pay-outs − safe drops
- Z-report HTML/CSV lists movement totals and line detail
- Shift persists `cashMovements`; close stamps total pay-ins / payouts / safe drops
- **PIN gate** for pay-out & safe drop (Settings → Security → Pin gate cash move)

## v77 (2026-07-11) — POS promo / coupon codes

- **Promo code** field on POS cart: Apply / Clear; badge shows code + % or fixed off
- Discount applied in `getTotals` after line discount, before tip/SC/delivery/loyalty
- Looks up active **offers** by code; optional phone lock on offer
- **Demo fallback** `WELCOME10` (10% default) via Settings → Taxes
- Bill, PDF, HTML/text receipt show Promo line; fields stored on bill row
- Toggle: Settings → Taxes → POS promo codes

## v76 (2026-07-11) — Waste log deducts stock

- **Log waste** picks inventory ingredient, numeric qty, reason/note
- **Stock deducted** and cost estimated from unit cost; persisted to `waste_log`
- Waste table + **CSV export**; Inventory tabs include Purchase orders & Waste log
- Empty stock confirmation when logging more than on hand

## v75 (2026-07-11) — Partial receive & cancel PO

- **Partial receive**: edit qty per line; tracks cumulative `receivedLines` / receipts
- Status **partial** until fully received; remaining qty shown on view
- **Cancel PO** with reason (not allowed after full receive)
- Filters: Open / Received / Cancelled / All

## v74 (2026-07-11) — Receive stock against PO

- **Purchase orders**: View / Print / **Receive stock** (adds qty to inventory)
- Missing ingredients auto-created on receive when not in stock list
- Open POs sorted first; empty state + refresh; open-count pill
- Manual Raise PO parses item lines for later receive

## v73 (2026-07-11) — Low-stock reorder pack

- **Auto-draft POs**: preview modal (by supplier/category), structured lines, pending POs
- **Low-stock CSV** export from inventory banner/toolbar
- **Print first PO** prompt after draft; PO print layout
- **Owner strip**: Low stock tile → Inventory; POS quick tool when low
- **Sidebar badge** + attention blink for below-min ingredients

## v72 (2026-07-11) — Manager PIN gates + Happy Hour

- **Happy Hour**: time window + % off (or per-item `happyHourPrice`); POS banner, HH badge, cart labels
- **PIN gates**: Due/credit, clear cart, large loyalty redeem (toggleable in Security)
- **Discount threshold** configurable (default 10%); `RSPinModal.require()` for opt-out gates
- Security panel lists always-on vs optional manager gates

## v71 (2026-07-11) — Loyalty earn & redeem

- **Earn points** on CRM-matched checkouts (1 pt / ₹100 default; Gold 2×, VIP 3×)
- **Redeem** from POS loyalty banner; discount line on cart, bill, and receipt
- **Tiers** auto: Silver → Gold (5k spend) → VIP (10k)
- **Settings → Taxes**: Loyalty program, earn rate, point value
- Customer profile shows live points balance

## v70 (2026-07-11) — Delivery fee, Z tips, void/rebill

- **Delivery charge** included in cart grand total, bill, and receipt (live update on fee field)
- **Z-report**: tips, service charge, delivery fees, void count/amount
- **Bills**: Void/Refund wording, **Rebill** loads lines into POS; auto-rebill after amend reasons

## v69 (2026-07-11) — Tips, service charge %, cash drawer

- **Tip on cart**: amount input + No tip / 5% / 10% chips; included in total, bill, and receipt
- **Service charge %**: Settings field (default 5%) when dine-in SC toggle is on
- **Disc %** input restored on cart next to tip
- **Cash drawer**: ESC/POS pulse after cash (or cash-split) payment; toggle in Printers settings
- Desktop/Android print bridge exposes `openCashDrawer`

## v68 (2026-07-11) — Online orders + split pay chips

- **Online Orders**: Accept + KOT, open in POS, demo seed order, phone/elapsed, new-order chime + toast
- **Sidebar**: urgent badge + attention blink for new aggregator tickets
- **Split pay**: Rest→Cash/UPI/Card/Due, ½ Cash·½ UPI, Clear; currency-aware remaining label

## v67 (2026-07-11) — Waiter floor → POS + auto thermal

- **Floor → POS**: Seat / Add items / Checkout load table + order lines into the cart (Dine-in)
- **Transfer table**: move open order (+ QR session) to a free table
- **Floor map**: QR pending pulse, held state, guest/item hints, live refresh on order sync
- **Auto-print receipt** setting wired to thermal/ESC-POS after payment
- **Bills**: thermal reprint action next to preview reprint

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
| **Web (Vercel)** | Hard-refresh or `?appv=v79-…` after deploy; SW cache bumps force update |
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
