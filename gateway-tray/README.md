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

## Build EXE

```bat
cd gateway-tray
npm install
npm run dist
```

Output:

- `dist/RestroSuite-Gateway-1.0.0-x64.exe` (portable)
- `dist/RestroSuite-Gateway Setup 1.0.0.exe` (installer)

Install once, enable “Start with Windows” (on by default).
