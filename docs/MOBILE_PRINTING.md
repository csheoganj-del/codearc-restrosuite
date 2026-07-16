# Mobile / PWA / Android printing

## What works where

| Environment | Path | Bluetooth | USB | Wi‑Fi network printer |
|-------------|------|-----------|-----|------------------------|
| **Android app** | System Print Manager (`AndroidInterface.printReceipt`) | Yes (if printer appears in Android Print) | Yes | Yes |
| **Desktop (Electron)** | Silent HTML + RAW ESC/POS | Via OS | Best path | Shared/network printer name |
| **Chrome PWA (phone)** | Browser print dialog | Limited | Limited | If OS has driver |
| **Chrome + Web Bluetooth** | `RSPrintBridge.printWebBluetoothEscPos` | ESC/POS BLE printers | No | No |

## Recommended setup

1. **Counter terminal** — RestroSuite Desktop + USB thermal (silent, fastest).
2. **Waiter phone (Android app)** — Install system print service for your brand (Epson, Star, etc.) or use generic Bluetooth printer in Settings → Connected devices → Print.
3. **PWA only** — Use browser Print, or Pair Bluetooth thermal from Settings → Printers (Chrome).

## Wi‑Fi printers (port 9100)

Set in Settings → Printers when Desktop agent is available:

- `set_wifi_printer_host` = printer IP  
- `set_wifi_printer_port` = `9100` (default)

Browser tabs cannot open raw TCP; use Desktop or Android Print Service.

## Test

```js
// DevTools
await RSPrintBridge.printSmart('<div class="rcp-logo">Test</div>', 'Test');
await RSPrintBridge.printWebBluetoothEscPos(btoa('\nBT test\n\n\n'));
```
