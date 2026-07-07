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
    npm run sync:android
    npm run check

    if ($env:SKIP_ANDROID_BUILD -ne "1") {
        npm run build:android
    }

    if ($env:SKIP_VERCEL_DEPLOY -ne "1") {
        vercel --prod --yes
    }
} finally {
    Pop-Location
}
