# Public downloads + auto-update feeds

Stable files at `https://restrosuite.codearc.co.in/downloads/…`

| Path | Purpose |
|------|---------|
| `updates.json` | Android + Windows + macOS + web version feed |
| `desktop/latest.yml` | electron-updater (Windows Setup) |
| `desktop/latest-mac.yml` | electron-updater (macOS) |
| `RestroSuite-Windows-Setup.exe` | Full installer (auto-updates) |
| `RestroSuite-Windows-Portable.exe` | Portable (prompts download) |
| `RestroSuite-Mac-AppleSilicon.dmg` | macOS Apple Silicon DMG |
| `RestroSuite-Mac-Intel.dmg` | macOS Intel DMG |
| `RestroSuite-Android.apk` | Android package (in-app update) |

Regenerate:

```bash
node scripts/sync-downloads.cjs
```

Release flow (large EXEs/DMGs on GitHub, site on Vercel):

```bash
cd desktop && npm run dist          # Windows (on PC)
# Mac DMG: GitHub Actions → Desktop Mac DMG, then download into desktop/dist/
node scripts/sync-downloads.cjs
node scripts/publish-github-release.cjs
node scripts/sync-downloads.cjs
npm run pages:build
```

Then deploy `publish-static` to Vercel (no large binaries uploaded).
