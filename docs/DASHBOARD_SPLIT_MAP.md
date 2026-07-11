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
| ESC/POS encode | `assets/escpos-encoder.js` | ✅ |
| Print routing | `assets/print-bridge.js` | ✅ |
| Shifts / station / keys | `assets/competitive-ops.js` | ✅ |

## Next extractions (safe order)

| # | Domain | Approx lines | Notes |
|---|--------|--------------|-------|
| 1 | Super-admin table | ~1200 | High isolation; own file + `RS.addRenderer` |
| 2 | KDS / QR orders | ~200 | Medium coupling to pending_orders |
| 3 | POS cart/render | ~700 | Tight coupling to `MENU`/`cart` — last |

## Rules

1. New file = IIFE attaching `window.RS*` namespace.
2. `dashboard.js` keeps a 3–10 line delegate until fully removed.
3. Load order: deps before `dashboard.js` or attach-on-ready with `setTimeout` poll.
4. Never break `window.RS` public API used by features-*.

## Boot after remaining

```
doppio-api → db → print-bridge → escpos → bill-identity → inventory-ledger → bills-history → inventory-ui
→ reports-ui → gateway-monitor → saas-core → dashboard → features-pos → critical.bundle → shell
```
