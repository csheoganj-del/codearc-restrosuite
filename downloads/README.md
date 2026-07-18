# Public downloads + auto-update feeds

Stable files at `https://restrosuite.codearc.co.in/downloads/…`

| Path | Purpose |
|------|---------|
| `updates.json` | Android + portable + web version feed |
| `desktop/latest.yml` | electron-updater (Windows Setup) |
| `RestroSuite-Windows-Setup.exe` | Full installer (auto-updates) |
| `RestroSuite-Windows-Portable.exe` | Portable (prompts download) |
| `RestroSuite-Android.apk` | Android package (in-app update) |

Regenerate:

```bash
node scripts/sync-downloads.cjs
```

Release flow (large EXEs on GitHub, site on Vercel):

```bash
cd desktop && npm run dist
node scripts/sync-downloads.cjs
node scripts/publish-github-release.cjs
node scripts/sync-downloads.cjs
npm run pages:build
```

Then deploy `publish-static` to Vercel (no EXEs uploaded).
