# Dashboard code-split modules (Wave 5+)

Small IIFE modules loaded **before** `dashboard.js` so the god file can delegate.

| Module | Global | Purpose |
|--------|--------|---------|
| `bill-identity.js` | `RSBillIdentity` | Bill numbers, channel series, idempotency |
| `../escpos-encoder.js` | `RSEscPos` | ESC/POS thermal encoding |
| `../print-bridge.js` | `RSPrintBridge` | Desktop/web print routing |
| `../competitive-ops.js` | `RSOps` | Shifts, station, keyboard, Z-report |

## Convention

1. Each file is a pure IIFE attaching one `window.RS*` namespace.
2. `dashboard.js` / `features-*.js` **prefer** the module if present, keep inline fallback.
3. Bundle via `npm run build:critical` when safe to concatenate.

Do **not** put circular deps on `window.RS` boot order.
