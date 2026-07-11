# USB / thermal printing (Wave 5 remaining)

## What works today

| Path | Environment | How |
|------|-------------|-----|
| **Silent HTML** | Electron desktop | `RS_DESKTOP.printHtml` → hidden BrowserWindow → system print |
| **RAW ESC/POS** | Windows + shared printer | Encoder builds bytes → spool file → `copy /b job.bin \\localhost\PrinterName` |
| **Browser iframe** | Web / Chrome | User print dialog (OS print to thermal) |
| **Android** | WebView | `AndroidInterface.printReceipt(html)` |

## Setting the printer

1. Run **RestroSuite Desktop** (not browser-only).
2. Open POS → click **Printer** chip in the top bar.
3. Pick the thermal USB printer name (must appear in Windows “Printers & scanners”).
4. Print a receipt/KOT — desktop tries **RAW first**, then silent HTML.

## Windows RAW requirements

- Printer must be **shared** (or addressable as `\\localhost\ExactPrinterName`).
- Driver should accept **RAW** / “Generic / Text Only” for pure ESC/POS.
- Some vendor drivers only accept EMF — then silent HTML path is used automatically.

## USB direct (libusb) — not bundled

Direct USB (libusb / node-usb / vendor SDK) is **not** in this repo because:

1. Native modules must be rebuilt per Electron/Node ABI.
2. Requires elevated installers and platform-specific udev rules (Linux).
3. Most restaurants already expose USB thermals as a Windows print queue.

### Optional extension (operators)

1. Spool files land in: `%APPDATA%\RestroSuite\print-spool\job-*.bin`
2. A small local agent can `watch` that folder and `write` to `\\.\USB001` or a COM port.
3. Keep `RSPrintBridge.printEscPosText` / `printBillEscPos` as the app contract — only the agent changes.

## Testing without hardware

```js
// DevTools on desktop
await RSPrintBridge.printEscPosText('TEST\nLine 2\n');
await RSPrintBridge.printBillEscPos({ no:'RS-TEST-001', items:[{name:'Tea',qty:1,price:20}], grand:20 }, { name:'Cafe' });
```

Jobs appear under the print-spool directory even if the physical printer is offline.
