# RestroSuite auto-update (all platforms)

After you change code, customers should **not** need a new installer every time
you only ship **data** changes — and for **app code**, each platform has a
channel that pulls updates over the internet.

## What updates where

| Surface | What auto-updates | How |
|---------|-------------------|-----|
| **Web / PWA** | UI + JS after you **deploy** the site | Service worker + `app-update.json` + reload banner |
| **Android (online)** | Same live web UI | App loads `https://restrosuite.codearc.co.in` |
| **Android (native shell / offline APK)** | New APK when `versionCode` rises | In-app check → DownloadManager → installer |
| **Windows Setup (NSIS)** | Full app binary | `electron-updater` + `downloads/desktop/latest.yml` |
| **Windows Portable** | Not silent replace | Checks `updates.json` → opens download link |

**Cloud data** (menu, orders, bills) always syncs via Supabase — no installer.

---

## One release checklist

1. Bump versions when shipping native packages:
   - Desktop: `desktop/package.json` → `"version"`
   - Android: `android-app/app/build.gradle` → `versionCode` **and** `versionName`
   - Web notes: `app-update.json` → `version` / title / highlights
2. Build:
   ```bash
   # Desktop (both Setup + portable)
   cd desktop && npm install && npm run dist

   # Android
   npm run build:android
   ```
3. Publish files into `/downloads`:
   ```bash
   npm run sync:downloads
   ```
4. Deploy the website (so `updates.json`, `desktop/latest.yml`, APK, EXEs, and web app go live):
   ```bash
   npm run deploy:production
   # or: vercel --prod
   ```

Customers on **Setup** get a restart prompt. **Portable** gets a download prompt.
**Android** gets an install prompt when `versionCode` is higher. **Web** reloads.

---

## Feed URLs (production)

| URL | Consumer |
|-----|----------|
| `https://restrosuite.codearc.co.in/app-update.json` | Web dashboard release notes |
| `https://restrosuite.codearc.co.in/downloads/updates.json` | Android + portable + catalog |
| `https://restrosuite.codearc.co.in/downloads/desktop/latest.yml` | electron-updater (Setup) |
| `https://restrosuite.codearc.co.in/downloads/RestroSuite-Windows-Setup.exe` | Public installer |
| `https://restrosuite.codearc.co.in/downloads/RestroSuite-Windows-Portable.exe` | Public portable |
| `https://restrosuite.codearc.co.in/downloads/RestroSuite-Android.apk` | Public APK |

---

## Platform details

### Web / PWA

- Deploy site → `service-worker.js` cache name bumps (`npm run bump:sw-version` in release).
- Open tabs: banner **Reload now** (`pwa.js`) + dashboard **Save & Update** (`dashboard.js`).
- No binary download.

### Android

- **Online:** always latest website (no APK needed for pure UI fixes).
- **APK update:** `AppUpdateChecker` compares `BuildConfig.VERSION_CODE` to
  `updates.json` → `android.versionCode`. User taps Update → download → system installer.
- Must allow “Install unknown apps” for the RestroSuite package (sideload).
- JS: `AndroidPlatform.checkForUpdates()`.

### Windows Setup (recommended for shops)

- Uses `electron-updater` with generic provider  
  `https://restrosuite.codearc.co.in/downloads/desktop`
- Checks a few seconds after launch, then every 4 hours.
- Downloads in background → **Restart now** dialog.
- Menu: **Help → Check for Updates…**

### Windows Portable

- Cannot safely overwrite itself while running.
- Polls `updates.json`; if desktop version is newer, opens the download URL.
- Prefer Setup for true silent updates.

---

## Local testing

| Platform | How |
|----------|-----|
| Web | Deploy or serve with HTTPS/SW; change `app-update.json` version |
| Windows | Build NSIS, host `desktop/` feed on a local static server, point `FEED_URL` temporarily if needed |
| Android | Raise `versionCode` in feed only (or lower installed code), open app online |

---

## Files added / touched

| File | Role |
|------|------|
| `desktop/auto-updater.js` | electron-updater + portable feed |
| `desktop/main.js` / `preload.js` | Wire-up + Help menu |
| `desktop/package.json` | `electron-updater`, `publish` generic URL |
| `android-app/.../AppUpdateChecker.java` | APK update |
| `android-app/.../MainActivity.java` | Quiet check + JS bridge |
| `android-app/.../AndroidManifest.xml` | `REQUEST_INSTALL_PACKAGES`, FileProvider |
| `android-app/.../res/xml/file_paths.xml` | APK share path |
| `scripts/sync-downloads.cjs` | Publishes feeds + binaries |
| `pwa.js` | Extra `app-update.json` poll |

---

## FAQ

**Q: I only changed a menu item in the DB — do I ship new EXEs?**  
No. Data syncs live.

**Q: I fixed a JS bug in the dashboard — do I need a new Windows EXE?**  
- Web + Android online: **deploy only**.  
- Windows desktop: **yes**, rebuild + `sync:downloads` + deploy (desktop ships a local snapshot).  
  Setup users then get the auto-update.

**Q: Why not auto-update portable like Chrome?**  
Portable EXEs extract to temp and are self-contained; silent replace of the running binary is unreliable. Use **Setup** for that.
