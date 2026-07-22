# Local builds (not published to the website)

Binaries here are for **your PC only** — double-click plug-and-play.  
They are **not** linked from the public download page.

## Gateway (WhatsApp tray)

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-gateway-exe.ps1
```

Then run:

- `RestroSuite-Gateway-Portable.exe` — no install, green **W** tray icon  
- `RestroSuite-Gateway-Setup.exe` — optional installer + Start Menu shortcut  

### Requirements for Gateway EXE

- RestroSuite project folder (default: `%USERPROFILE%\Downloads\restrosuite`)
- Node.js + PM2 (`npm i -g pm2`) for the WhatsApp process  
- Optional: `%USERPROFILE%\.restrosuite\gateway.env`

### Desktop POS EXE

```bat
cd desktop
npm install
npm run dist
```

Copy outputs from `desktop\dist\` here if you want them in one place.

## Git

Source is on GitHub. Rebuild after `git pull` with the scripts above.  
`*.exe` files under this folder stay local (gitignored) so the public site is unchanged.
