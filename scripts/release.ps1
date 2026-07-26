$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Push-Location $Root
try {
    npm run check:launch
    npm test
    # Bump the service-worker cache version BEFORE syncing to Android and
    # deploying, so both the web PWA and the Android WebView shell actually
    # pick up this release's files instead of serving a stale cached copy.
    npm run bump:sw-version
    # Desktop EXE content-updater needs a NEW version on every deploy
    npm run bump:content-version -- --ci --slug release
    # Desktop live UI updater needs this list on the website
    npm run build:content-manifest
    npm run sync:android
    npm run check

    if ($env:SKIP_ANDROID_BUILD -ne "1") {
        npm run build:android
    }

    # Desktop Windows builds (NSIS + portable) when available on this machine
    if ($env:SKIP_DESKTOP_BUILD -ne "1" -and (Test-Path (Join-Path $Root "desktop/package.json"))) {
        Push-Location (Join-Path $Root "desktop")
        try {
            if (-not (Test-Path "node_modules")) { npm install }
            npm run dist
        } finally {
            Pop-Location
        }
    }

    # Publish APK/EXE + auto-update feeds (updates.json, desktop/latest.yml)
    npm run sync:downloads

    if ($env:SKIP_VERCEL_DEPLOY -ne "1") {
        vercel --prod --yes
    }
} finally {
    Pop-Location
}
