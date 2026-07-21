# RestroSuite Desktop (Windows `.exe` + macOS `.dmg`)

A native desktop version of RestroSuite for **Windows and macOS**. It is a
**separate system** that wraps your existing web app in an Electron shell —
**your web app and Android app are not touched.** All three targets (web,
Android, desktop) share the **same Supabase backend**, so data stays in sync
across them.

- **Offline-first:** launches and runs with no internet. Orders, bills, menu edits,
  etc. are written to a local cache immediately.
- **Online:** when a connection is available and you're signed in, everything syncs
  to Supabase automatically. Anything created while offline is queued and pushed on
  reconnect (this uses your app's existing `RS_DB` sync queue — nothing new to learn).

---

## How it works (in one paragraph)

`main.js` starts a tiny local web server (`server.js`) on `http://localhost:8001`
that serves a **byte-identical copy** of your web app (`./app`) and answers
`/api/config` with your Supabase credentials — exactly like the Vercel function does
in production. An Electron window points at that local server. Because `localhost:8001`
is already in your Edge Functions' `ALLOWED_ORIGINS`, cloud calls work with **zero
changes** to the web app. Offline, the local server still serves every file and the
config, and `RS_DB` falls back to its local cache + sync queue.

```
desktop/
├─ main.js          Electron main process (starts server + window)
├─ server.js        Local Express server: static files + clean URLs + /api/config
├─ preload.js       Minimal safe bridge (exposes window.RS_DESKTOP)
├─ splash.html      Loading splash
├─ config.json      Supabase URL + anon key, entry page, port  ← edit if needed
├─ sync-app.mjs     Copies the web app from ../ into ./app (run before building)
├─ build/icon.ico   App icon (generated from your brand mark)
└─ app/             Snapshot of the web app (auto-generated; do not edit by hand)
```

---

## Build the `.exe` (do this on Windows)

You need **Node.js 20+** installed. Open a terminal in this `desktop/` folder.

**One-time cleanup** (only if a partial `node_modules` / `smoke-test.js` is present
from earlier — safe to run regardless):

```bat
if exist node_modules rmdir /s /q node_modules
if exist smoke-test.js del /q smoke-test.js
```

**Then:**

```bat
npm install
npm run dist
```

That produces, in `desktop\dist\`:

- `RestroSuite-2.0.0-x64.exe` — **NSIS installer** (installs to Program Files, adds
  Start-menu + desktop shortcuts, uninstaller).
- `RestroSuite-2.0.0-portable.exe` — **portable** single file, no install; double-click
  to run from anywhere (e.g. a USB stick).

Want only one of them:

```bat
npm run dist:installer   REM installer only
npm run dist:portable    REM portable only
```

## Build the `.dmg` (macOS)

**A Mac is required** (or GitHub Actions macOS). Windows cannot produce a real
macOS `.dmg`.

### Option A — GitHub Actions (recommended; no Mac needed on your desk)

Workflow file: `.github/workflows/desktop-mac.yml`

1. Push the latest `desktop/` changes to GitHub (`main`).
2. Open the repo on GitHub → **Actions** → **Desktop Mac DMG** → **Run workflow**.
3. Wait ~10–20 minutes (macOS runner builds Intel + Apple Silicon).
4. Download **Artifacts** from the finished run, or open the draft **Release**
   if you left “Create a GitHub Release” enabled.

Or tag a release from your machine:

```bash
git tag desktop-v2.0.5
git push origin desktop-v2.0.5
```

That triggers the same Mac build and attaches DMGs to the release.

### Option B — Build on a Mac locally

```bash
cd desktop
npm install
npm run dist:mac
```

That produces, in `desktop/dist/`:

- `RestroSuite-2.0.5-mac-arm64.dmg` — **Apple Silicon** (M1/M2/M3/M4)
- `RestroSuite-2.0.5-mac-x64.dmg` — **Intel Mac**
- Matching `.zip` archives (useful for auto-update)

DMG only:

```bash
npm run dist:dmg
```

### Client install (unsigned build)

Without an Apple Developer ID signature, macOS Gatekeeper shows *“cannot be
opened because the developer cannot be verified.”* Clients can still install:

1. Open the `.dmg` and drag **RestroSuite** into **Applications**
2. Right-click the app → **Open** → **Open** (one-time allow)

### Optional: Apple code signing + notarization (no Gatekeeper warning)

Add these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `MAC_CERTS_P12_BASE64` | Base64 of your Developer ID Application `.p12` |
| `MAC_CERTS_PASSWORD` | Password for that `.p12` |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-character Team ID |

The workflow enables signing automatically when `MAC_CERTS_P12_BASE64` is set.
Requires an [Apple Developer](https://developer.apple.com) account (~$99/year).

## Run without building (to test)

```bat
npm install
npm start
```

`npm start` runs `sync` (refresh the bundled app) then launches the Electron window.

On a Mac the same commands work in Terminal.

---

## Keeping the desktop app in sync with the web app

The `./app` folder is a **snapshot** of your web app. Whenever you update the web app
and want the desktop build to include those changes, run:

```bat
npm run sync
```

(`npm start` and `npm run dist` do this automatically.) The web app in the parent
folder remains the single source of truth — `sync-app.mjs` only reads from it.

---

## Configuration (`config.json`)

| Key | Meaning |
|-----|---------|
| `entry` | First page shown. Default `/login`. Use `/dashboard`, `/kds` (kitchen display), etc. |
| `port` | Local server port. Default `8001` (matches your CORS allowlist — keep it unless you also add the new origin to `ALLOWED_ORIGINS`). |
| `supabaseUrl` / `supabaseAnonKey` | Your public Supabase project URL + anon key. Pre-filled from your project. The anon key is safe to ship (it's public by design). |
| `window` | Default window size / minimum size. |

> **Kitchen Display build tip:** to ship a dedicated KDS terminal, set
> `"entry": "/kds"` and rebuild.

---

## Auto-update

Packaged builds check for updates automatically:

| Build | Behaviour |
|-------|-----------|
| **NSIS Setup** | `electron-updater` downloads from `https://restrosuite.codearc.co.in/downloads/desktop` and prompts to restart |
| **Portable** | Polls `downloads/updates.json` and opens a download link when a newer version ships |

Publish pipeline after `npm run dist`:

```bat
cd ..
npm run sync:downloads
REM then deploy the site so /downloads/desktop/latest.yml + EXEs are live
```

Menu: **Help → Check for Updates…**  
Details: [`docs/AUTO_UPDATE.md`](../docs/AUTO_UPDATE.md)

## Notes & safety

- The local server binds to `127.0.0.1` only — it is never exposed on the network.
- External links (help pages, `mailto:`, etc.) open in the system browser, not inside
  the app.
- Double-launching focuses the existing window (single-instance lock).
- If port 8001 is busy, the app falls back to another port and rewrites the request
  `Origin` on Supabase calls to your production origin, so online sync still works.
- This wrapper adds **no** code to your web app and changes **nothing** in the parent
  folder. Deleting the whole `desktop/` folder returns you to exactly the web + Android
  setup you had before.

## Optional: app icon

`build/icon.ico` was generated from `assets/restrosuite-mark.png`. To use a different
icon, replace `build/icon.ico` (a multi-size `.ico`, 256×256 down to 16×16) and rebuild.
