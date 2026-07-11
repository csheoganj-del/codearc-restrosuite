# RestroSuite release notes

## v93 (2026-07-11) — Symbol chrome: cart items first

Rethought every cart control for space vs necessity:

| Element | Decision |
|---------|----------|
| Order type | **Icons only** (bag / utensils / bike) |
| Shift | **Dot + icons** (unlock / cash / Z / lock) |
| Customer | **User icon** + short Guest / name chip |
| Cart lines | **Primary surface** (taller min height) |
| Totals | Σ / % / tax icons + **large Total** |
| Disc·Tip·Promo | Collapsed **Adjust** |
| Pay methods | **Icons only** (Cash/UPI/Card/Due/Split) |
| Cash / Split | **Popover above pay row** — does not permanently shrink the item list |
| Hold / KOT | **Icons** (pause / fire) |
| Checkout | Compact **Pay** CTA |

## v92 (2026-07-11) — Live browser UX fixes (cashier walkthrough)

Verified in Chromium like a real cashier. Fixes from measurements:

- **Cart work surface was ~29% of panel** — foot max-height reduced; cash dens collapsed by default
- **Cash tender was ~211px** — now one row (Recv · Change · Exact · +notes)
- **Customer overlay blocked qty buttons** (phone flag interceptor) — close on pay/cart click; pointer-events when closed
- Split/cash stay inline; Hold / KOT stay reachable

## v91 (2026-07-11) — Current Order workbench (max cart space)

- **Wider cart** (~400px) and taller sticky panel for the most-used screen
- **Shift + customer on one row** — frees vertical room for line items
- **Dense cart lines**: name + unit on one row · qty · total (more items visible)
- **Compact order types, pay methods, totals** without losing utility
- **Cash tender**: Recv · Change · Exact on one row + quick notes; dens pad compact
- **Sticky checkout foot** with robust Hold / KOT / Print & Pay
- Table/Pax only when **Dine-in**

## v90 (2026-07-11) — Cart space + inline tender

- **Customer expand is an overlay** — opening Add customer no longer shrinks cart lines to 2 items
- Name + phone sit side-by-side in a short dropdown over the cart
- **Cash / Split** tender lives **inline under pay methods** (no floating side tabs over the menu)
- Cart list keeps a minimum height; foot scrolls if tender chrome is tall
- Loyalty banner stays compact under the customer chip

## v89 (2026-07-11) — POS Current Order panel 10/10

- **Cart lines**: name · unit · qty · total only; kitchen note via long-press / double-click (shown only when set)
- **Customer chip**: collapsed by default; pick → chip with masked phone + clear (×); search results stay inside the cart
- **Hold**: one **Hold** (uses current order type) + **Send KOT** — no triple Hold row
- **Shift strip**: tighter icon actions so cart + total + Print & Pay dominate

## v88 (2026-07-11) — POS menu cards 10/10

- **Minimal item cards**: veg marker + name + price only by default (Petpooja-calm)
- **Category** shows only when browsing **All** or using search
- **Stock** badge only for **Low** / **Out** — no more “In stock” noise
- **Qty badge** when item is in cart; happy-hour chip next to price (no overlap)
- Tighter card height so more menu items fit on screen

## v85 (2026-07-11) — POS calm mode (cashier 10/10 UX)

- **Money path first**: search + order type on the toolbar; sort/display tucked under **Display**
- **More** menu holds Day pack, keyboard shortcuts, Demo (Demo only when demo tools / superadmin / `?demo=1`)
- **No open shift**: single primary **Open shift** (no competing Day pack on the bar)
- **Empty cart**: pay methods, Hold, KOT, Print & Pay, and discount panel stay hidden until items exist
- **Add customer** collapsed by default (walk-in is the default path)
- Station chip shows **Counter 1** (not raw `ST-XXXX`); click still renames
- Order-type active state is quieter so **Print & Pay** is the only loud orange CTA
- Larger touch targets on pay methods and checkout

## v84 (2026-07-11) — Super-admin shell (no client flash)

- Super-admin and restaurant POS still share `dashboard.html`, but the **platform shell is stamped before first paint** from `sessionStorage`
- Client sidebar (POS, KDS, Bills…), mobile nav, and client tabs are **CSS-hidden** for `rs-role-superadmin` so reload never flashes the outlet dashboard
- Boot loader says “Loading platform console…” for super-admin
- Removed 300ms delayed lockdown that caused the split-second client UI flash

## v83 (2026-07-11) — Super-Admin & Gateway polish

- **Status labels**: table shows Active (not “Approved”) matching the manage modal
- **Plan labels**: Starter / Growth / Enterprise title case
- **Display names**: title-case outlet names; outlet type as a soft chip (not `(RESTAURANT)`)
- **Platform summary strip** fixed (was rendering into a hidden Growth Hub node)
- **MRR empty state**: `₹0` instead of `--`
- **Actions**: Manage · Open · Seed · Suspend; click row to manage
- Hide POS **station chip** + duplicate topbar search on super-admin
- **Gateway**: human-readable live log, friendlier incidents, consistent dates, KPI n/a empty states

## v82 (2026-07-11) — Super-admin tenant table fix

- Fix **Tenant directory** crash: `avatarColors is not defined` after Wave 9 code-split
- Super-admin module owns local avatar palette (fallback when `RS.avatarColors` missing)
- Cloud pack fields (tip/promo/covers/cash movements) map into existing JSON columns — **no new Supabase tables**
- Staff employees import list uses stable avatar color index

## v81 (2026-07-11) — UX / QR table CX 10× polish

### Guest (table QR)
- **One-tap menu**: printed QRs open `order.html` directly; hub only for track/pay (`?hub=1`)
- **Outlet branding** only (no product/Doppio styling); clean Fraunces outlet title
- **Veg / Non-veg / All** filters + diet marks; sold-out cards blocked
- **Kitchen notes** on cart lines (flows to KDS as `notes`)
- **Call waiter / request bill** dock on the menu page
- **EN ↔ हिं** language toggle for core guest strings
- Success: **Track order · Order more · Table home**

### Staff
- POS cart **Discount · Tip · Promo** collapsed under expandable “More”
- **Role-first home**: waiter/captain → Floor, kitchen → KDS, cashier → POS
- Larger touch targets on tablet (≤1024px)

## v80 (2026-07-11) — Guest covers (pax)

- **Pax** field next to table on POS cart (0–99)
- Stored on bill as `covers` / `pax`; shown on PDF, HTML/text receipt, KOT (+ ESC/POS)
- **Z-report**: total covers + average check per cover
- Floor **Seat & order** pre-fills from reservation pax or table capacity
- Clears with cart; KOT / kitchen order carries covers

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
| **Web (Vercel)** | Hard-refresh or `?appv=v81-…` after deploy; SW cache bumps force update |
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
