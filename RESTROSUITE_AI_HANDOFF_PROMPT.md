# CodeArc RestroSuite — AI Handoff Prompt

You are helping build **CodeArc RestroSuite**, a multi-tenant restaurant SaaS POS platform built by Kalpesh (India). This document tells you exactly what exists, what has been built, and what still needs to be done.

---

## What RestroSuite Is

A full-stack restaurant management SaaS with:
- **Multi-tenant architecture** — each restaurant is a "tenant" with isolated data
- **Web POS** (dashboard.html) — bills, menu, inventory, staff, reports, CRM
- **Android app** — wraps the same web assets in a WebView
- **Self-hosted WhatsApp gateway** — sends bills via whatsapp-web.js (unofficial, Baileys-style)
- **Supabase backend** — PostgreSQL + Edge Functions (Deno/TypeScript) + Realtime
- **Two target markets** — India (Razorpay payments) and Ireland/EU (Stripe Connect, planned)

---

## Project Structure

```
restrosuite/
├── assets/                          ← Main frontend JS (loaded in dashboard.html)
│   ├── saas-core.js                 ← RSPinModal (admin PIN gate) + RS_SAAS vertical resolver
│   ├── dashboard.js                 ← All tab renderers: POS, bills, inventory, reports, CRM, employees
│   ├── features-pos.js              ← POS cart, bill generation, KOT printing
│   ├── features-shell.js            ← Settings panel (all settings tabs + nav)
│   ├── features-growth.js           ← QR table codes, floor plan
│   ├── features-editor.js           ← Menu editor
│   ├── country-currency-data.js     ← RS_COUNTRIES array (123 countries, each with locale + tz)
│   ├── db.js                        ← IndexedDB + Supabase sync layer (RS_DB)
│   └── doppio-api.js                ← RS_API: Supabase data/auth abstraction
│
├── codearc-restrosuite/
│   ├── supabase/
│   │   ├── functions/               ← Deno Edge Functions
│   │   │   ├── razorpay-route/      ← Razorpay Route payment + onboarding
│   │   │   ├── razorpay-webhook/    ← Subscription + Route + KYC webhook handler
│   │   │   ├── tenant-public/       ← Public QR order API (no auth)
│   │   │   ├── tenant-data/         ← Authenticated tenant data CRUD
│   │   │   └── tenant-admin/        ← SuperAdmin operations
│   │   └── migrations/              ← 34 SQL migration files
│   └── android-app/
│       └── app/src/main/assets/     ← Mirror of /assets/ (keep in sync with cp commands)
│
├── whatsapp-gateway.js              ← Node.js server: whatsapp-web.js multi-tenant gateway
└── qr-order.html                    ← Customer-facing dine-in portal (QR scan → order → pay)
```

---

## Key Global Architecture

### Frontend globals
- `window.RS` — main object exposed by dashboard.js. Contains: `MENU`, `INVENTORY`, `BILLS`, `EMPLOYEES`, `toast()`, `rs()`, `saveOne()`, `save()`, `render()`, `deductInventoryForBill()`, `restoreInventoryForBill()`
- `window.RS_DB` — IndexedDB + Supabase hybrid storage layer
- `window.RS_API` — Supabase auth/data abstraction
- `window.RS_SETTINGS` — current outlet settings object (set by `normalizeReceiptProfile()` in features-pos.js line 21)
- `window.RS_COUNTRIES` — array of 123 country objects `{ name, code, dial, currency, symbol, locale, tz }`
- `window.RS_getOutletLocale()` — returns BCP 47 locale from current country setting (e.g. `'en-IE'`)
- `window.RS_getOutletTimezone()` — returns IANA timezone (e.g. `'Europe/Dublin'`)
- `window.RSPinModal` — admin PIN gate: `request(label)`, `setup()`, `change()`, `verify()`, `isConfigured()`

### Data flow
1. IndexedDB is primary local store (RS_DB)
2. Supabase is cloud sync (doppio_* tables per tenant)
3. On app load: hydrate arrays from IndexedDB, then sync from Supabase
4. On save: write to IndexedDB + Supabase simultaneously

### Multi-tenancy
- Each tenant has a row in `saas_tenants` table (slug, username, plan, status)
- Tenant data lives in `doppio_*` tables with `tenant_id` foreign key
- Row Level Security enforced via `doppio-api.js` JWT
- Edge functions use `SUPABASE_SERVICE_ROLE_KEY` for admin operations

---

## What Has Been Built (completed features)

### 1. Razorpay Route — Indian payment routing
- **Migration**: `20260626000000_razorpay_route.sql` — adds `razorpay_account_id`, `razorpay_route_enabled`, `razorpay_kyc_status` columns to `saas_tenants`
- **Edge function**: `razorpay-route/index.ts` — three actions:
  - `create_order`: creates Razorpay order with Route transfer to restaurant's bank
  - `onboard_account`: registers restaurant on Razorpay Route (KYC flow)
  - `get_account`: returns current Route status
- **Webhook**: `razorpay-webhook/index.ts` handles `payment.captured` (marks order paid) and `account.activated` (enables Route)
- **QR portal**: `qr-order.html` — customer scans table QR → places order → pays via Razorpay Checkout JS → falls back to UPI VPA if Route not enabled
- **Settings UI**: Settings → Payments tab — shows KYC status, onboarding form with PAN/bank/address fields

### 2. Currency & locale fixes
- `dashboard.js` `rs()` formatter: `getCurrencySymbol() + ' ' + amount.toLocaleString(RS_getOutletLocale())`
- `features-pos.js`: all 4 hardcoded `'en-IN'` locale strings replaced with `RS_getOutletLocale()` + `timeZone: RS_getOutletTimezone()`
- `country-currency-data.js`: all 123 RS_COUNTRIES entries have `locale` (BCP 47) and `tz` (IANA) fields
- Settings save flow calls `RS.loadReceiptProfile()` which updates `window.RS_SETTINGS` — so locale/timezone auto-applies after saving country in Settings

### 3. Admin PIN system (RSPinModal)
- **Location**: top of `saas-core.js` as an IIFE before the RS_SAAS code
- **PIN storage**: SHA-256 hash stored in `RS_SETTINGS.admin_pin_hash`, persisted to settings DB
- **Features**: 4-dot visual UI, physical keyboard support, 3-attempt lockout (30 seconds), forgot PIN via master reset code `482916`
- **Modes**: `request(label)` = verify, `setup()` = first-time set, `change()` = verify current then set new
- **Flows**: setup (enter → confirm), change (verify current → enter new → confirm new), forgot (enter master code → set new)

### 4. Bill delete + refund with PIN gate
- **Delete bill**: trash icon on each bill row → PIN gate → confirm dialog → removes from BILLS array → restores inventory → syncs to cloud. Toast: "Bill deleted — inventory restored"
- **Refund**: existing refund button → PIN gate → reason picker modal (6 preset reasons + free-text notes) → marks bill `status: 'refunded'` → logs to `doppio_refund_requests`. Does NOT restore inventory (food was served)
- **Refund does not restore inventory** — intentional. Delete does restore.

### 5. Inventory auto-deduction on bill generation
- `RS.deductInventoryForBill(billRow)` — exposed on RS object in dashboard.js
- Called from `features-pos.js` immediately after `RS.BILLS.unshift(billRow)`
- Looks up each `billRow._items[].name` in `MENU`, finds `menuItem.ingredients[]`, subtracts `ingredient.qty × ordered_qty` from `INVENTORY[].stock`
- `RS.restoreInventoryForBill(billRow)` — called inside `deleteBill()` in dashboard.js (reverse of deduction)
- Both persist changes via `RS_DB.writeLocal('inventory', INVENTORY)`

### 6. Settings → Security & PIN panel
- New nav item in Settings: "Security & PIN" with `fa-shield-halved` icon
- Shows PIN status (active/not set), Set/Change/Remove PIN buttons
- Lists all PIN-protected operations: Delete Bill, Refund, Discount Override (coming), Amend Bill (coming), Cash Drawer (coming), Data Reset
- Master reset code `482916` shown with warning

### 7. WhatsApp gateway humanisation (anti-ban)
- **File**: `whatsapp-gateway.js`
- **Added `humanSend()` function** replacing all 5 raw `client.sendMessage()` calls
- What it does before every send:
  1. Daily rate limit check (200 messages/day per tenant)
  2. Business hours check (8am–9pm)
  3. Per-tenant serial queue (no burst parallelism)
  4. `client.sendPresenceUpdate('available', chatId)` — go online
  5. `chat.sendStateTyping()` — show typing indicator
  6. Random delay proportional to message length (1–6 seconds)
  7. Actual `client.sendMessage()`
  8. `chat.clearState()` — stop typing
  9. `sendPresenceUpdate('paused')` — go idle
  10. Random inter-message gap (3–9 seconds jitter)

---

## How Meta/WhatsApp Banning Works (context for WhatsApp features)

1. **Complaint rate** (primary) — >2% of recipients tap "Block/Report Spam" → ban. Fixed by only sending to customers who gave their number at checkout.
2. **Velocity pattern** — uniform timing = detected as bot. Fixed by `_randInt(3000, 9000)` jitter.
3. **Protocol fingerprint** — no typing indicator before send = machine. Fixed by `chat.sendStateTyping()`.
4. **Burst pattern** — 50 messages in 60 seconds. Fixed by serial queue + inter-message gap.
5. **Daily ceiling** — 200/day per number keeps it in "light business user" profile.

### Alternatives to WhatsApp gateway (all free, no ban risk)
- **wa.me deep link** — `https://wa.me/{phone}?text={encodedBill}` — staff taps Send. Already partially implemented in `shareBillReceipt()`.
- **Digital bill link** — Print QR on thermal receipt → customer scans → sees bill at `restrosuite.codearc.co.in/bill/{billNo}`. Needs one edge function + HTML template.
- **Brevo email** — 300 emails/day free forever. One POST request.
- **Meta Cloud API** — Official WhatsApp, 1,000 conversations/month free. Needs Meta Business verification.

---

## Database Tables (Supabase)

### `saas_tenants` — platform tenants
```sql
id, slug, username, password_hash, plan, status,
subscription_id, razorpay_customer_id,
razorpay_account_id, razorpay_route_enabled, razorpay_kyc_status,
country, currency, timezone, locale,
created_at, updated_at
```

### `doppio_*` tables (per tenant, all have `tenant_id`)
- `doppio_bills` — completed transactions
- `doppio_pending_orders` — QR dine-in orders (status: Pending/Paid/Cancelled)
- `doppio_menu` — menu items (with `ingredients` JSON array for recipes)
- `doppio_inventory` — stock items (name, stock, min, unit, cost)
- `doppio_employees` — staff
- `doppio_business_profile` — outlet settings
- `doppio_refund_requests` — refund log
- `doppio_customers` — CRM

### Bill object shape (`_items` is critical for inventory)
```js
{
  no: 'RS-20260625-001',
  time: '25 Jun at 5:52 AM',
  dateTime: '2026-06-25T00:22:00.000Z',
  table: 'T-01',
  items: 3,              // count
  amount: 840,           // grand total
  pay: 'Cash',
  status: 'paid',        // 'paid' | 'refunded'
  _items: [              // detailed items for inventory deduction
    { name: 'Cappuccino', qty: 2, price: 180 },
    { name: 'Club Sandwich', qty: 1, price: 480 }
  ],
  customerName: 'Rahul',
  customerPhone: '919876543210'
}
```

### Menu item shape (recipe ingredients for inventory)
```js
{
  id: 'item-001',
  name: 'Cappuccino',
  cat: 'Hot Drinks',
  price: 180,
  veg: true,
  ingredients: [          // recipe — used for inventory deduction
    { name: 'Espresso', qty: 30, unit: 'ml' },
    { name: 'Milk', qty: 120, unit: 'ml' }
  ]
}
```

---

## What Still Needs to Be Built

### High priority
1. **Digital bill link** — `GET /bill/{billNo}` public edge function returning HTML receipt. QR printed on thermal paper. Customer scans to view bill permanently. Zero messaging cost.
2. **wa.me WhatsApp button fix** — `shareBillReceipt()` in `dashboard.js` should generate proper `wa.me` URL with full formatted bill text instead of current implementation.
3. **Stripe Connect for Ireland/EU** — Mirror of Razorpay Route but using Stripe Connect Express. Irish clients need card payments going directly to restaurant's Stripe account.
4. **QR code fix in print preview** — `features-growth.js` `showAllTableQRs()` uses `https://api.qrserver.com/v1/create-qr-code/` which fails in sandboxed print window. Fix: use `qrcode` npm package client-side with `<canvas>` → `toDataURL()`.
5. **Discount override PIN gate** — When cashier applies >10% discount at POS, trigger `RSPinModal.request('Discount Override')` before allowing it.

### Medium priority
6. **Stripe Connect edge function** — `stripe-connect/index.ts` with actions: `create_account`, `create_checkout_session`, `get_account`. Mirror of `razorpay-route/index.ts`.
7. **Meta Cloud API WhatsApp** — `send-bill-whatsapp` edge function calling `graph.facebook.com/v19.0/{PHONE_ID}/messages` with pre-approved utility template.
8. **Real-time PIN update in Settings** — When country dropdown changes in Settings (before clicking Save), update `window.RS_SETTINGS.set_country` immediately so locale/timezone preview is live.
9. **Shift close / End of day report** — PIN-protected action that generates EOD summary and locks the day's bills from editing.

### Low priority / future
10. **Telegram Bot integration** — Free alternative to WhatsApp. Customer scans QR on receipt to start conversation with RestroSuite bot, then receives all future bills automatically.
11. **Partial refund** — Current refund marks full bill. Add partial amount field to refund modal.
12. **Void order (POS)** — Cancel a pending order from POS with PIN gate. Different from delete bill (void happens before payment, delete after).
13. **WhatsApp Business App migration** — Move from unofficial whatsapp-web.js to official Meta Cloud API for the gateway to eliminate ban risk completely.

---

## Coding Rules & Conventions

- **No TypeScript in frontend** — all frontend is vanilla JS (ES2020+), no build step
- **Android sync** — after editing any file in `assets/`, always copy to `codearc-restrosuite/android-app/app/src/main/assets/` with `cp`
- **Edge functions** — Deno/TypeScript, import from `https://esm.sh/` and `https://deno.land/std`
- **`_e(str)`** — HTML-escape helper used in all innerHTML template strings (already defined in dashboard.js)
- **`rs(amount)`** — currency formatter: `getCurrencySymbol() + ' ' + Math.round(n).toLocaleString(RS_getOutletLocale())`
- **`toast(msg, icon)`** — global toast notification (defined in dashboard.js)
- **Settings save flow**: `RS.saveSettings(SET_STORE)` → calls `RS.loadReceiptProfile()` → updates `window.RS_SETTINGS`
- **PIN protection pattern**: always `await RSPinModal.request('Action label')` → `if (!ok) return;` before any destructive action
- **Inventory deduction**: only deduct if `menuItem.ingredients` array is non-empty (not all menu items have recipes defined)

---

## Environment

- **Supabase project**: connected, Edge Functions deployed via `supabase functions deploy`
- **Secrets needed**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **WhatsApp gateway**: Node.js server, runs separately, connects to same Supabase project
- **Android app**: WebView wrapping the web assets, built with Android Studio
- **Hosting**: `restrosuite.codearc.co.in` (India), files served as static HTML/JS

---

## What to Ask This AI

When asking for help, always specify:
1. Which file(s) to edit
2. What the exact behaviour should be
3. Whether it needs Android sync (cp command after editing)
4. Whether it's a new feature or fixing existing code

Example task: *"In `dashboard.js`, fix `shareBillReceipt()` to open a `wa.me` URL with the full formatted bill text. The bill object has `_items`, `no`, `amount`, `time`, `table`, `customerName`. Format a readable message and URL-encode it. Then sync to android-app assets."*
