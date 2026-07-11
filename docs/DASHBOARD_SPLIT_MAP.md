# dashboard.js split map (remaining work)

Current size: ~6.7k lines. Extraction strategy: **IIFE modules + thin delegates**.

## Done

| Domain | Module | Status |
|--------|--------|--------|
| Bill numbers / channel series | `assets/modules/bill-identity.js` | ✅ |
| Inventory deduct/restore | `assets/modules/inventory-ledger.js` | ✅ |
| Bills history UI (table, refund, delete) | `assets/modules/bills-history.js` | ✅ Wave 6 |
| Inventory stock/recipes UI | `assets/modules/inventory-ui.js` | ✅ Wave 7 |
| Reports UI | `assets/modules/reports-ui.js` | ✅ Wave 8 |
| Gateway monitor + incidents | `assets/modules/gateway-monitor.js` | ✅ Wave 8 |
| Super-admin tenant console | `assets/modules/super-admin.js` | ✅ Wave 9 |
| KDS board UI | `assets/modules/kds-ui.js` | ✅ Wave 9 |
| QR orders UI | `assets/modules/qr-orders-ui.js` | ✅ Wave 10 |
| Employees UI | `assets/modules/employees-ui.js` | ✅ Wave 10 |
| POS cart / grid / init | `assets/modules/pos-ui.js` | ✅ Wave 11 |
| ESC/POS encode | `assets/escpos-encoder.js` | ✅ |
| Print routing | `assets/print-bridge.js` | ✅ |
| Shifts / station / keys | `assets/competitive-ops.js` | ✅ |

## Remaining (small)

| # | Domain | Notes |
|---|--------|-------|
| 1 | Growth hub shell | Thin; features-growth owns real UI |
| 2 | Tax helpers on dashboard | `RS_resolveRate` / profile — optional extract |
| 3 | Boot / hydrate shell | Stay in dashboard.js (orchestration) |

## Rules

1. New file = IIFE attaching `window.RS*` namespace.
2. `dashboard.js` keeps a 3–10 line delegate until fully removed.
3. Load order: deps before `dashboard.js` or attach-on-ready with `setTimeout` poll.
4. Never break `window.RS` public API used by features-*.

## Boot after remaining

```
doppio-api → db → print-bridge → escpos → modules… → super-admin → kds-ui
→ saas-core → dashboard → features-pos → critical.bundle → shell
```
