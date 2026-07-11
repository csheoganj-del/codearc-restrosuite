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
| ESC/POS encode | `assets/escpos-encoder.js` | ✅ |
| Print routing | `assets/print-bridge.js` | ✅ |
| Shifts / station / keys | `assets/competitive-ops.js` | ✅ |

## Next extractions (safe order)

| # | Domain | Approx lines | Notes |
|---|--------|--------------|-------|
| 1 | QR orders UI | ~200 | Coupled to pending_orders / KDS hydrate |
| 2 | Employees UI | ~250 | Medium isolation |
| 3 | POS cart/render | ~700 | Tight coupling to `MENU`/`cart` — last |

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
