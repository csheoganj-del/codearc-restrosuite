# RestroSuite Gateway Tray

Windows system-tray app for the WhatsApp gateway (same UX as Desktop: tray + startup).

## Behaviour

- Starts **with Windows** (toggle in tray menu)
- **Close (X)** → hides to tray (gateway keeps running via PM2)
- **Quit Gateway** → stops `restrosuite-gateway` + `restrosuite-ngrok`
- **Exit tray only** → closes the tray app, leaves PM2 running
- Polls `http://127.0.0.1:3000/health` for Online / Ready status

## Requirements

- Node.js + global PM2 (`npm i -g pm2`)
- RestroSuite repo with `whatsapp-gateway.js` + `ecosystem.config.cjs`
  (default: parent folder `../` or `%USERPROFILE%\Downloads\restrosuite`)
- Durable env: `%USERPROFILE%\.restrosuite\gateway.env`

## Dev

```bat
cd gateway-tray
npm install
npm start
```

## Build EXE (local plug-and-play — not the public site)

From repo root (recommended):

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-gateway-exe.ps1
```

Or from this folder:

```bat
cd gateway-tray
npm install
npm run dist:local
```

Output:

| File | Use |
|------|-----|
| `../local-builds/RestroSuite-Gateway-Portable.exe` | **Double-click** — no install |
| `../local-builds/RestroSuite-Gateway-Setup.exe` | Optional installer |
| `dist/RestroSuite-Gateway-*-portable.exe` | Builder output |

Tray icon: solid **green W**. Starts with Windows by default (toggle in tray menu).

These EXEs are for local use only — they are **not** published on the website download page.
