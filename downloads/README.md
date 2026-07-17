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

Release flow: build desktop + android → sync-downloads → deploy site.
