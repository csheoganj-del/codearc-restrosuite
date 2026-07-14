# RestroSuite Android POS — full asset synchronisation
# Run after any web change, before building the APK.
# Usage:  powershell -ExecutionPolicy Bypass -File .\sync-assets.ps1

$ErrorActionPreference = "Stop"
$SourceDir = $PSScriptRoot
$DestDir = Join-Path $SourceDir "android-app\app\src\main\assets"

# Keep launcher / web brand marks in lockstep before copying into the APK
$iconScript = Join-Path $SourceDir "scripts\sync-brand-icons.cjs"
if (Test-Path $iconScript) {
    Write-Host "Refreshing brand icons from master source..." -ForegroundColor Yellow
    node $iconScript
    if ($LASTEXITCODE -ne 0) { throw "sync-brand-icons.cjs failed" }
}

if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    Write-Host "Created Android assets directory." -ForegroundColor Green
}

$FilesToCopy = @(
    "index.html",
    "dashboard.html",
    "dashboard-styles.css",
    "login.html",
    "home.html",
    "kds.html",
    "qr-order.html",
    "order.html",
    "tokens.html",
    "404.html",
    "bill.html",
    "app-update.json",
    "config.js",
    "styles.css",
    "script.js",
    "recipes.json",
    "pwa.js",
    "service-worker.js",
    "manifest.webmanifest",
    "legal.css",
    "terms.html",
    "privacy.html",
    "refund-policy.html",
    "robots.txt",
    "sitemap.xml"
)

$DirectoriesToCopy = @(
    "src",
    "api",
    "assets"
)

Write-Host "Syncing RestroSuite -> android-app assets..." -ForegroundColor Yellow

foreach ($File in $FilesToCopy) {
    $SrcFile = Join-Path $SourceDir $File
    $DstFile = Join-Path $DestDir $File
    if (Test-Path $SrcFile) {
        Copy-Item -Path $SrcFile -Destination $DstFile -Force
        Write-Host "  file  $File" -ForegroundColor Cyan
    } else {
        Write-Warning "Missing source: $File"
    }
}

foreach ($Directory in $DirectoriesToCopy) {
    $SrcDirectory = Join-Path $SourceDir $Directory
    if (Test-Path $SrcDirectory) {
        # Wipe dest first so deleted web files don't linger offline
        $DstDirectory = Join-Path $DestDir $Directory
        if (Test-Path $DstDirectory) {
            Remove-Item -Path $DstDirectory -Recurse -Force
        }
        Copy-Item -Path $SrcDirectory -Destination $DestDir -Recurse -Force
        Write-Host "  dir   $Directory/" -ForegroundColor Cyan
    } else {
        Write-Warning "Missing directory: $Directory"
    }
}

$SrcImages = Join-Path $SourceDir "images"
$DstImages = Join-Path $DestDir "images"
if (Test-Path $SrcImages) {
    if (Test-Path $DstImages) { Remove-Item $DstImages -Recurse -Force }
    Copy-Item -Path $SrcImages -Destination $DstImages -Recurse -Force
    Write-Host "  dir   images/" -ForegroundColor Cyan
}

# Remove stale root-level duplicates that used to confuse offline shell
$StaleRoot = @(
    "dashboard.js",
    "features-pos.js",
    "features-shell.js",
    "saas-core.js",
    "theme-luxe.css",
    "supabase_migration.sql",
    "vercel.json"
)
foreach ($s in $StaleRoot) {
    $p = Join-Path $DestDir $s
    if (Test-Path $p) {
        Remove-Item $p -Force
        Write-Host "  clean $s" -ForegroundColor DarkGray
    }
}

# Stamp sync time for diagnostics
$stamp = @{
    syncedAt = (Get-Date).ToUniversalTime().ToString("o")
    source   = "sync-assets.ps1"
    version  = "2.0.0"
} | ConvertTo-Json
Set-Content -Path (Join-Path $DestDir "android-sync.json") -Value $stamp -Encoding UTF8

Write-Host "`nAndroid assets sync complete. Build with:" -ForegroundColor Green
Write-Host "  .\scripts\build-android.ps1" -ForegroundColor White
Write-Host "  or Android Studio -> Build APK" -ForegroundColor White
