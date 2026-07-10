# RestroSuite Codearc-Restrosuite Assets Synchronisation Script
# Run this script whenever you update your web files to sync them with the codearc-restrosuite directory.

$SourceDir = $PSScriptRoot
$DestDir = Join-Path $SourceDir "codearc-restrosuite"

# Create destination directory if it doesn't exist
if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    Write-Host "Created codearc-restrosuite directory." -ForegroundColor Green
}

# List of files to copy
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
    "supabase_migration.sql",
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
    "sitemap.xml",
    "package.json",
    "package-lock.json",
    "vercel.json",
    "theme-luxe.css"
)

$DirectoriesToCopy = @(
    "src",
    "api",
    "assets",
    "tests",
    "scripts",
    "images",
    "docs"
)

# Copy individual files
foreach ($File in $FilesToCopy) {
    $SrcFile = Join-Path $SourceDir $File
    $DstFile = Join-Path $DestDir $File
    
    if (Test-Path $SrcFile) {
        Copy-Item -Path $SrcFile -Destination $DstFile -Force
        Write-Host "Synced: $File -> codearc-restrosuite" -ForegroundColor Cyan
    } else {
        Write-Warning "Source file not found: $File"
    }
}

foreach ($Directory in $DirectoriesToCopy) {
    $SrcDirectory = Join-Path $SourceDir $Directory
    $DstDirectory = Join-Path $DestDir $Directory

    if (Test-Path $SrcDirectory) {
        Copy-Item -Path $SrcDirectory -Destination $DestDir -Recurse -Force
        Write-Host "Synced directory: $Directory -> codearc-restrosuite" -ForegroundColor Cyan
    } else {
        Write-Warning "Source directory not found: $Directory"
    }
}

Write-Host "`ncodearc-restrosuite sync completed successfully!" -ForegroundColor Green
