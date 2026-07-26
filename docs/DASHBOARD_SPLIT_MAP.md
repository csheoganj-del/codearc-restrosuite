# dashboard.js split map

Extraction strategy: **IIFE modules + thin delegates**. Major UI domains are split out (Waves 5–12).

## Done

| Domain | Module | Status |
|--------|--------|--------|
| Bill numbers / channel series | `assets/modules/bill-identity.js` | ✅ |
| Inventory deduct/restore | `assets/modules/inventory-ledger.js` | ✅ |
| Bills history UI | `assets/modules/bills-history.js` | ✅ Wave 6 |
| Inventory stock/recipes UI | `assets/modules/inventory-ui.js` | ✅ Wave 7 |
| Reports UI | `assets/modules/reports-ui.js` | ✅ Wave 8 |
| Gateway monitor + incidents | `assets/modules/gateway-monitor.js` | ✅ Wave 8 |
| Super-admin tenant console | `assets/modules/super-admin.js` | ✅ Wave 9 |
| KDS board UI | `assets/modules/kds-ui.js` | ✅ Wave 9 |
| QR orders UI | `assets/modules/qr-orders-ui.js` | ✅ Wave 10 |
| Employees UI | `assets/modules/employees-ui.js` | ✅ Wave 10 |
| POS cart / grid / init | `assets/modules/pos-ui.js` | ✅ Wave 11 |
| Tax rate helpers | `assets/modules/tax-helpers.js` | ✅ Wave 12 |
| Growth Hub shell tiles | `assets/modules/growth-hub-shell.js` | ✅ Wave 12 |
| ESC/POS encode | `assets/escpos-encoder.js` | ✅ |
| Print routing | `assets/print-bridge.js` | ✅ |
| Shifts / station / keys | `assets/competitive-ops.js` | ✅ |

## Intentionally remaining in dashboard.js

| Domain | Why |
|--------|-----|
| Boot / auth shell | Theme, tabs, toast, update check, role lockdown |
| Collection hydrate | MENU / BILLS / INVENTORY arrays + IndexedDB/cloud sync |
| QR/KDS pending_orders sync | Mutates shared arrays used by multiple modules |
| Menu editor fallback | Tiny; real UI in `features-editor.js` |

## Rules

1. New file = IIFE attaching one `window.RS*` namespace.
2. `dashboard.js` keeps 3–10 line delegates.
3. Load modules before `dashboard.js`.
4. Never break `window.RS` public API used by `features-*`.

## Boot order (single-path — each activity once)

```
static essentials (db, saas-core, settings, non-critical modules)
→ country-currency → dashboard.js
→ critical.bundle  (pos-ui, print, receipt, bills, inventory UI, KDS, QR,
                    tax-helpers, competitive-ops, wa-queue, …)  [ONCE]
→ features-pos.js  [ONCE]
→ features-shell.js
→ product-10x / staff-efficiency / onboarding
```

Do **not** also `<script src>` files that live inside `critical.bundle`.
Rebuild bundle after source changes: `npm run build:critical`.
