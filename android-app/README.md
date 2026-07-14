# RestroSuite POS — Android

Production Android shell for RestroSuite: hybrid online/offline WebView, encrypted offline lease, thermal print, TTS, haptics.

## Features (2.0)

| Area | Behaviour |
|------|-----------|
| **Online** | Loads `https://restrosuite.codearc.co.in` (always latest deploy) |
| **Offline** | Bundled web shell via `WebViewAssetLoader` (`login.html` + full assets) |
| **License** | ECDSA lease in EncryptedSharedPreferences; locks when offline & expired |
| **Print** | System PrintManager · 58mm thermal media size |
| **Bridge** | `AndroidInterface` (print/speak/vibrate/share) · `AndroidLicense` · `AndroidPlatform` |
| **Security** | HTTPS only · no cleartext · no file:// browsing · JS bridges kept in ProGuard |
| **UX** | Brand splash · keep screen on · double-back exit · file chooser · landscape OK |

## Sync web → Android

From repo root (after any web change):

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-assets.ps1
```

## Build

```powershell
.\scripts\build-android.ps1
```

Debug APK: `android-app/app/build/outputs/apk/debug/app-debug.apk`

Release needs `gradle.properties` keys (see `app/build.gradle` comments).

## Version

- `versionName` 2.0.0  
- `versionCode` 2  

Bump both on every Play Store upload.
