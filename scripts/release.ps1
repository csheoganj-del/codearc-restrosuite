$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Push-Location $Root
try {
    npm test
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
