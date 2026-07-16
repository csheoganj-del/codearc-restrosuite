# RestroSuite 2.0.1 — Launch packages (2026-07-16)

## Installers (on this PC)

| Platform | File |
|----------|------|
| Android | `android-app/dist/RestroSuite-POS-2.0.1-debug.apk` |
| Windows portable | `desktop/dist/RestroSuite-2.0.1-portable.exe` |

## Sync status
- Web / Android offline assets / Desktop `app/` — **same code hashes** for POS + CSS
- Android online always loads https://restrosuite.codearc.co.in (latest)
- Edge functions: tenant-public bill QR fixed, tenant-data/admin gateway proxy fixed

## Smoke test (10 min)
1. Install APK / run EXE / open web
2. Login Big Bites
3. Add cart → Print & Pay
4. Customer phone live search
5. Scan printed bill QR on phone
6. Kitchen tab / KDS
7. WhatsApp PDF (gateway PC + ngrok on)

## Ops
- Keep WhatsApp gateway + ngrok running on office PC for central bills
