# Doppio Cafe Android POS Assets Synchronization Script
# Run this script whenever you update your web files to sync them with the Android App assets.

$SourceDir = $PSScriptRoot
$DestDir = Join-Path $SourceDir "android-app\app\src\main\assets"

# Create destination assets directory if it doesn't exist
if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    Write-Host "Created Android assets directory." -ForegroundColor Green
}

# List of files to copy
$FilesToCopy = @(
    "index.html",
    "dashboard.html",
    "login.html",
    "home.html",
    "supabase_migration.sql",
    "styles.css",
    "dashboard-styles.css",
    "script.js",
    "dashboard.js",
    "recipes.json"
)

# Copy individual files
foreach ($File in $FilesToCopy) {
    $SrcFile = Join-Path $SourceDir $File
    $DstFile = Join-Path $DestDir $File
    
    if (Test-Path $SrcFile) {
        Copy-Item -Path $SrcFile -Destination $DstFile -Force
        Write-Host "Synced: $File -> android-app" -ForegroundColor Cyan
    } else {
        Write-Warning "Source file not found: $File"
    }
}

# Copy images folder if exists
$SrcImages = Join-Path $SourceDir "images"
$DstImages = Join-Path $DestDir "images"
if (Test-Path $SrcImages) {
    if (-not (Test-Path $DstImages)) {
        New-Item -ItemType Directory -Force -Path $DstImages | Out-Null
    }
    Copy-Item -Path "$SrcImages\*" -Destination $DstImages -Recurse -Force
    Write-Host "Synced images directory." -ForegroundColor Cyan
}

Write-Host "`nAssets sync completed successfully! Build your Android app in Android Studio or compile using Gradle." -ForegroundColor Green
